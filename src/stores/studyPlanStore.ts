import { create } from "zustand";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { CancelledError, describeLlmError } from "@/lib/llm/errors";
import { createLlmService } from "@/lib/llm/service";
import {
  BUDGET_OPTIONS,
  DEFAULT_BUDGET,
  MAX_PLAN_DAYS,
  isPlanOutdated,
  planWindow,
  type StudyPlanDoc,
} from "@/lib/applications/study-plan";
import { getActiveLlmConfig } from "@/services/llm-active";
import { getPrepDocument, getSetting, setSetting } from "@/services/database";
import {
  collectPlanContext,
  contextStamp,
  generateStudyPlan,
  saveStudyPlanProgress,
  type PlanStep,
} from "@/services/study-plan";
import { onPrepDocumentChanged } from "@/services/prep-events";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Interview, PrepDocument } from "@/types";

const BUDGET_SETTING = "study_plan_minutes";

export type PlanStatus = "idle" | "loading" | "generating" | "error";

interface StudyPlanState {
  /** undefined = not loaded yet; null = no plan stored. */
  docs: Record<string, PrepDocument<StudyPlanDoc> | null | undefined>;
  outdated: Record<string, boolean>;
  status: Record<string, PlanStatus>;
  step: Record<string, PlanStep | null>;
  defaultBudget: number;

  /** Load the stored plan; auto-generate once per session when none exists and the round is close. */
  ensure: (interview: Interview) => Promise<void>;
  /** Re-read the stored plan and recompute whether it is outdated. */
  load: (interview: Interview) => Promise<void>;
  generate: (interview: Interview, budget?: number) => Promise<void>;
  setBudget: (interview: Interview, minutes: number) => Promise<void>;
  toggleTask: (interviewId: string, taskId: string) => Promise<void>;
  cancel: (interviewId: string) => void;
  /** Called when an interview changed (rescheduled, type edited) or was deleted. */
  invalidate: (interviewId: string) => void;
}

// Module-level bookkeeping shared by every placement of the plan.
const controllers = new Map<string, AbortController>();
const inFlight = new Map<string, Promise<void>>();
/** Interviews we already auto-generated for (or tried to) in this session. */
const autoAttempted = new Set<string>();
/** Generations run one at a time so the dashboard never fires N parallel LLM calls. */
let queue: Promise<unknown> = Promise.resolve();
let budgetLoaded: Promise<void> | null = null;
/** Interviews seen by ensure(), so prep changes can refresh their outdated flag. */
const known = new Map<string, Interview>();

function eligibleForPlan(interview: Interview): boolean {
  return (
    (interview.status === "scheduled" || interview.status === "rescheduled") &&
    planWindow(Date.now(), interview.scheduled_at) !== null
  );
}

export const useStudyPlanStore = create<StudyPlanState>((set, get) => {
  const patch = <K extends "docs" | "outdated" | "status" | "step">(
    key: K,
    id: string,
    value: StudyPlanState[K][string],
  ) => set((s) => ({ [key]: { ...s[key], [id]: value } }) as Partial<StudyPlanState>);

  const loadBudget = () => {
    budgetLoaded ??= getSetting(BUDGET_SETTING)
      .then((v) => {
        const n = Number(v);
        if ((BUDGET_OPTIONS as readonly number[]).includes(n)) set({ defaultBudget: n });
      })
      .catch(() => {});
    return budgetLoaded;
  };

  return {
    docs: {},
    outdated: {},
    status: {},
    step: {},
    defaultBudget: DEFAULT_BUDGET,

    load: async (interview) => {
      const id = interview.id;
      if (get().docs[id] === undefined) patch("status", id, "loading");
      try {
        const doc = await getPrepDocument<StudyPlanDoc>(interview.application_id, "study_plan", id);
        patch("docs", id, doc);
        if (doc) {
          const ctx = await collectPlanContext(interview);
          patch("outdated", id, ctx ? isPlanOutdated(doc.content, contextStamp(ctx, doc.content.meta.budget)) : false);
        }
      } catch (err) {
        console.error("[study-plan] load failed:", err);
        patch("docs", id, null);
      } finally {
        if (get().status[id] === "loading") patch("status", id, "idle");
      }
    },

    ensure: async (interview) => {
      const id = interview.id;
      if (!eligibleForPlan(interview)) return;
      known.set(id, interview);
      await loadBudget();
      if (get().docs[id] === undefined) {
        const pending = inFlight.get(`load:${id}`) ?? get().load(interview);
        inFlight.set(`load:${id}`, pending);
        await pending;
        inFlight.delete(`load:${id}`);
      }
      const hasLlm = useSettingsStore.getState().llm.active_provider !== null;
      const daysUntil = planWindow(Date.now(), interview.scheduled_at)?.daysUntil ?? Infinity;
      if (get().docs[id] === null && hasLlm && daysUntil <= MAX_PLAN_DAYS && !autoAttempted.has(id)) {
        autoAttempted.add(id);
        await get().generate(interview);
      }
    },

    generate: async (interview, budget) => {
      const id = interview.id;
      if (inFlight.has(id)) return inFlight.get(id);
      const run = async () => {
        const config = await getActiveLlmConfig();
        if (!config) {
          patch("status", id, "idle");
          toast.error(i18n.t("interview-prep:prep_ai.no_llm"));
          return;
        }
        const controller = new AbortController();
        controllers.set(id, controller);
        patch("status", id, "generating");
        try {
          const minutes = budget ?? get().docs[id]?.content.meta.budget ?? get().defaultBudget;
          const doc = await generateStudyPlan(createLlmService(config), interview, minutes, {
            uiLanguage: i18n.language,
            signal: controller.signal,
            onStep: (step) => patch("step", id, step),
          });
          // null: the round is no longer upcoming or its job/CV is gone.
          patch("docs", id, doc);
          patch("outdated", id, false);
          patch("status", id, "idle");
        } catch (err) {
          if (err instanceof CancelledError || controller.signal.aborted) {
            patch("status", id, "idle");
            return;
          }
          patch("status", id, "error");
          toast.error(i18n.t("interview-prep:quick_plan.failed"), { description: describeLlmError(err).message });
        } finally {
          controllers.delete(id);
          patch("step", id, null);
        }
      };
      patch("status", id, "generating");
      const p = (queue = queue.then(run, run)).then(() => undefined);
      inFlight.set(id, p);
      try {
        await p;
      } finally {
        inFlight.delete(id);
      }
    },

    setBudget: async (interview, minutes) => {
      set({ defaultBudget: minutes });
      void setSetting(BUDGET_SETTING, String(minutes)).catch(() => {});
      await get().generate(interview, minutes);
    },

    toggleTask: async (interviewId, taskId) => {
      const doc = get().docs[interviewId];
      if (!doc) return;
      const progress = { ...doc.content.progress, [taskId]: !doc.content.progress[taskId] };
      const next = { ...doc, content: { ...doc.content, progress } };
      patch("docs", interviewId, next);
      try {
        await saveStudyPlanProgress(next);
      } catch (err) {
        console.error("[study-plan] saving progress failed:", err);
      }
    },

    cancel: (interviewId) => controllers.get(interviewId)?.abort(),

    invalidate: (interviewId) => {
      controllers.get(interviewId)?.abort();
      known.delete(interviewId);
      set((s) => {
        const docs = { ...s.docs };
        delete docs[interviewId];
        return { docs };
      });
    },
  };
});

// Regenerating the gap brief or a round pack elsewhere makes dependent plans outdated.
onPrepDocumentChanged((change) => {
  if (change.kind === "study_plan") return;
  for (const interview of known.values()) {
    if (interview.application_id !== change.applicationId) continue;
    if (change.kind === "round_pack" && change.interviewId !== interview.id) continue;
    if (useStudyPlanStore.getState().status[interview.id] === "generating") continue;
    void useStudyPlanStore.getState().load(interview);
  }
});
