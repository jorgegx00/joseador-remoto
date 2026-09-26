import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import type { LlmService } from "@/lib/llm/service";
import { resolveMaterialLanguage, toMaterialLanguage } from "@/lib/llm/language";
import type { GapBrief, RoundPack } from "@/lib/llm/prep-schemas";
import {
  normalizePlan,
  planWindow,
  sourceStamp,
  type StudyPlanDoc,
} from "@/lib/applications/study-plan";
import {
  getAllInterviews,
  getApplicationById,
  getCvById,
  getInterviewPrepByApplicationId,
  getJobById,
  getMockSessionsByApplicationId,
  getPrepDocument,
  getStarStoriesByCvId,
  upsertPrepDocument,
} from "@/services/database";
import { produceGapBrief, produceRoundPack, type PrepSubject } from "@/services/prep-generation";
import type {
  CvRecord,
  Interview,
  InterviewPrep,
  Job,
  MockSession,
  PrepDocument,
  StarStory,
} from "@/types";

export interface PlanContext {
  interview: Interview;
  job: Job;
  cv: CvRecord;
  gapBrief: PrepDocument<GapBrief> | null;
  roundPack: PrepDocument<RoundPack> | null;
  interviewPrep: InterviewPrep | null;
  stories: StarStory[];
  latestMock: MockSession | null;
  /** Other scheduled interviews (any application), for load balancing. */
  otherRounds: Interview[];
}

/** Newest completed mock for this round, else for the same round type. */
function pickMock(sessions: MockSession[], interview: Interview): MockSession | null {
  const done = sessions.filter((s) => s.status === "completed" && s.report);
  return (
    done.find((s) => s.interview_id === interview.id) ??
    done.find((s) => s.interview_type === interview.interview_type) ??
    null
  );
}

/** Loads everything a plan is built from. Null when the job or CV is gone. */
export async function collectPlanContext(interview: Interview): Promise<PlanContext | null> {
  const app = await getApplicationById(interview.application_id);
  if (!app) return null;
  const [job, cv] = await Promise.all([getJobById(app.job_id).catch(() => null), getCvById(app.cv_id).catch(() => null)]);
  if (!job || !cv) return null;
  const [gapBrief, roundPack, interviewPrep, stories, mocks, all] = await Promise.all([
    getPrepDocument<GapBrief>(app.id, "gap_brief").catch(() => null),
    getPrepDocument<RoundPack>(app.id, "round_pack", interview.id).catch(() => null),
    getInterviewPrepByApplicationId(app.id).catch(() => null),
    getStarStoriesByCvId(cv.id).catch(() => []),
    getMockSessionsByApplicationId(app.id).catch(() => []),
    getAllInterviews().catch(() => []),
  ]);
  const now = Date.now();
  const otherRounds = all.filter(
    (i) => i.id !== interview.id && i.status === "scheduled" && i.scheduled_at > now && i.scheduled_at < interview.scheduled_at,
  );
  return { interview, job, cv, gapBrief, roundPack, interviewPrep, stories, latestMock: pickMock(mocks, interview), otherRounds };
}

export function contextStamp(ctx: PlanContext, budget: number): string {
  const latest = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
  return sourceStamp({
    scheduledAt: ctx.interview.scheduled_at,
    interviewType: ctx.interview.interview_type,
    budget,
    gapBriefAt: ctx.gapBrief?.updated_at ?? null,
    roundPackAt: ctx.roundPack?.updated_at ?? null,
    interviewPrepAt: ctx.interviewPrep?.updated_at ?? null,
    latestStoryAt: latest(ctx.stories.map((s) => s.updated_at)),
    latestMockAt: ctx.latestMock?.updated_at ?? null,
  });
}

export type PlanStep = "fit" | "round" | "plan";

/**
 * Generates (and stores) the quick study plan for one interview. Missing core prep —
 * the gap brief and this round's pack — is generated and saved first, so the full
 * prep module benefits too.
 */
export async function generateStudyPlan(
  llm: LlmService,
  interview: Interview,
  budget: number,
  opts: { uiLanguage: string; onStep?: (step: PlanStep) => void; signal?: AbortSignal },
): Promise<PrepDocument<StudyPlanDoc> | null> {
  const window = planWindow(Date.now(), interview.scheduled_at);
  if (!window) return null;
  let ctx = await collectPlanContext(interview);
  if (!ctx) return null;

  const materialLanguage = resolveMaterialLanguage(ctx.job, opts.uiLanguage);
  const planLanguage = toMaterialLanguage(opts.uiLanguage);
  const subject: PrepSubject = {
    applicationId: interview.application_id,
    cvId: ctx.cv.id,
    cv: ctx.cv.parsed_data,
    job: ctx.job,
  };

  if (!ctx.gapBrief) {
    opts.onStep?.("fit");
    const content = await produceGapBrief(llm, subject, materialLanguage, opts.signal);
    await upsertPrepDocument({
      application_id: interview.application_id,
      interview_id: "",
      kind: "gap_brief",
      language: materialLanguage,
      content,
    });
  }
  if (!ctx.roundPack) {
    opts.onStep?.("round");
    const content = await produceRoundPack(
      llm,
      subject,
      { interview, type: interview.interview_type },
      materialLanguage,
      opts.signal,
    );
    await upsertPrepDocument({
      application_id: interview.application_id,
      interview_id: interview.id,
      kind: "round_pack",
      language: materialLanguage,
      content,
    });
  }
  // Reload so the plan (and its stamp) reflect the freshly generated material.
  ctx = (await collectPlanContext(interview)) ?? ctx;

  opts.onStep?.("plan");
  const inWindow = new Set(window.dates);
  const labels = await Promise.all(
    ctx.otherRounds
      .filter((r) => inWindow.has(format(new Date(r.scheduled_at), "yyyy-MM-dd")))
      .map(async (r) => {
        const app = r.application_id === interview.application_id ? null : await getApplicationById(r.application_id);
        const job = app ? await getJobById(app.job_id).catch(() => null) : ctx!.job;
        return {
          date: format(new Date(r.scheduled_at), "yyyy-MM-dd"),
          label: `${r.interview_type.replace("_", " ")} interview${job?.company_name ? ` with ${job.company_name}` : ""}`,
        };
      }),
  );

  const raw = await llm.generateQuickPlan(
    {
      cv: ctx.cv.parsed_data,
      job: ctx.job,
      interviewType: interview.interview_type,
      interviewAt: format(new Date(interview.scheduled_at), "EEEE d MMMM yyyy, HH:mm", { locale: enUS }),
      mode: window.mode,
      dates: window.dates.map((d) => ({ date: d, weekday: format(new Date(`${d}T12:00:00`), "EEEE", { locale: enUS }) })),
      minutesPerDay: budget,
      stories: ctx.stories,
      gapBrief: ctx.gapBrief?.content ?? null,
      roundPack: ctx.roundPack?.content ?? null,
      interviewPrep: ctx.interviewPrep,
      mockReport: ctx.latestMock?.report ?? null,
      otherRounds: labels,
      interviewerRole: interview.interviewer_role || undefined,
      planLanguage,
      materialLanguage,
    },
    opts.signal,
  );

  const doc: StudyPlanDoc = {
    plan: normalizePlan(raw, window.dates),
    meta: {
      stamp: contextStamp(ctx, budget),
      budget,
      dates: window.dates,
      mode: window.mode,
      language: planLanguage,
    },
    progress: {},
  };
  return upsertPrepDocument<StudyPlanDoc>({
    application_id: interview.application_id,
    interview_id: interview.id,
    kind: "study_plan",
    language: planLanguage,
    content: doc,
  });
}

export function saveStudyPlanProgress(docRecord: PrepDocument<StudyPlanDoc>): Promise<PrepDocument<StudyPlanDoc>> {
  return upsertPrepDocument<StudyPlanDoc>({
    application_id: docRecord.application_id,
    interview_id: docRecord.interview_id,
    kind: "study_plan",
    language: docRecord.language,
    content: docRecord.content,
  });
}
