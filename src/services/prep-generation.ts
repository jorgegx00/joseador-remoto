import { differenceInCalendarDays } from "date-fns";
import type { LlmService } from "@/lib/llm/service";
import type { MaterialLanguage } from "@/lib/llm/language";
import type { GapBrief, RoundPack } from "@/lib/llm/prep-schemas";
import { getPrepDocument, getStarStoriesByCvId } from "@/services/database";
import type { Interview, InterviewType, Job, ParsedCv } from "@/types";

export interface PrepSubject {
  applicationId: string;
  cvId: string | null;
  cv: ParsedCv;
  job: Job;
}

export function produceGapBrief(
  llm: LlmService,
  subject: PrepSubject,
  language: MaterialLanguage,
  signal?: AbortSignal,
): Promise<GapBrief> {
  return llm.generateGapBrief({ cv: subject.cv, job: subject.job, language }, signal);
}

/**
 * Round prep pack for a scheduled interview or a bare round type. Pulls in the
 * candidate's STAR stories and the stored gap brief when they exist.
 */
export async function produceRoundPack(
  llm: LlmService,
  subject: PrepSubject,
  round: { interview: Interview | null; type: InterviewType },
  language: MaterialLanguage,
  signal?: AbortSignal,
): Promise<RoundPack> {
  const [stories, brief] = await Promise.all([
    subject.cvId ? getStarStoriesByCvId(subject.cvId).catch(() => []) : Promise.resolve([]),
    getPrepDocument<GapBrief>(subject.applicationId, "gap_brief").catch(() => null),
  ]);
  const { interview } = round;
  return llm.generateRoundPack(
    {
      cv: subject.cv,
      job: subject.job,
      interviewType: round.type,
      daysUntil: interview ? Math.max(0, differenceInCalendarDays(interview.scheduled_at, Date.now())) : null,
      stories,
      gapBrief: brief?.content ?? null,
      interviewerRole: interview?.interviewer_role || undefined,
      notes: interview?.notes || undefined,
      language,
    },
    signal,
  );
}
