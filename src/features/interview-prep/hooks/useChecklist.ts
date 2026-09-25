import { useState, useCallback, useMemo } from "react";
import { ulid } from "ulid";
import {
  getInterviewPrepByApplicationId,
  upsertInterviewPrep,
} from "@/services/database";
import type { ChecklistState, InterviewPrep } from "@/types";
import {
  checklistSections,
  TOTAL_CHECKLIST_ITEMS,
} from "../data/checklist-items";

const emptyChecklistState: ChecklistState = {
  pre_interview: {},
  video_call_setup: {},
  during_interview: {},
  closing: {},
  post_interview: {},
};

interface UseChecklistReturn {
  checklistState: ChecklistState;
  isLoading: boolean;
  totalItems: number;
  completedItems: number;
  progressPercent: number;
  sectionProgress: (
    sectionId: keyof ChecklistState,
  ) => { completed: number; total: number };
  toggleItem: (
    sectionId: keyof ChecklistState,
    itemId: string,
    applicationId: string,
  ) => void;
  resetChecklist: (applicationId: string) => Promise<void>;
  load: (applicationId: string) => Promise<void>;
}

export function useChecklist(): UseChecklistReturn {
  const [checklistState, setChecklistState] =
    useState<ChecklistState>(emptyChecklistState);
  const [isLoading, setIsLoading] = useState(false);
  const [prepId, setPrepId] = useState<string | null>(null);

  const load = useCallback(async (applicationId: string) => {
    setIsLoading(true);
    try {
      const prep = await getInterviewPrepByApplicationId(applicationId);
      if (prep) {
        setPrepId(prep.id);
        setChecklistState(prep.checklist_state);
      }
    } catch (err) {
      console.error("Failed to load checklist:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persistChecklist = useCallback(
    async (applicationId: string, newState: ChecklistState) => {
      try {
        const existing =
          await getInterviewPrepByApplicationId(applicationId);
        const now = Date.now();
        const prep: InterviewPrep = existing
          ? {
              ...existing,
              checklist_state: newState,
              updated_at: now,
            }
          : {
              id: prepId ?? ulid(),
              application_id: applicationId,
              pitch_casual: "",
              pitch_formal: "",
              pitch_technical: "",
              strengths: [],
              weaknesses: [],
              company_brief: "",
              custom_questions: [],
              checklist_state: newState,
              created_at: now,
              updated_at: now,
            };
        await upsertInterviewPrep(prep);
        if (!prepId) setPrepId(prep.id);
      } catch (err) {
        console.error("Failed to persist checklist:", err);
      }
    },
    [prepId],
  );

  const toggleItem = useCallback(
    (
      sectionId: keyof ChecklistState,
      itemId: string,
      applicationId: string,
    ) => {
      setChecklistState((prev) => {
        const sectionState = { ...prev[sectionId] };
        sectionState[itemId] = !sectionState[itemId];
        const newState = { ...prev, [sectionId]: sectionState };
        persistChecklist(applicationId, newState);
        return newState;
      });
    },
    [persistChecklist],
  );

  const resetChecklist = useCallback(
    async (applicationId: string) => {
      const newState = emptyChecklistState;
      setChecklistState(newState);
      await persistChecklist(applicationId, newState);
    },
    [persistChecklist],
  );

  const completedItems = useMemo(() => {
    let count = 0;
    for (const section of checklistSections) {
      const sectionState = checklistState[section.id] ?? {};
      for (const item of section.items) {
        if (sectionState[item.id]) count++;
      }
    }
    return count;
  }, [checklistState]);

  const progressPercent = useMemo(
    () =>
      TOTAL_CHECKLIST_ITEMS > 0
        ? Math.round((completedItems / TOTAL_CHECKLIST_ITEMS) * 100)
        : 0,
    [completedItems],
  );

  const sectionProgress = useCallback(
    (sectionId: keyof ChecklistState) => {
      const section = checklistSections.find((s) => s.id === sectionId);
      if (!section) return { completed: 0, total: 0 };
      const sectionState = checklistState[sectionId] ?? {};
      let completed = 0;
      for (const item of section.items) {
        if (sectionState[item.id]) completed++;
      }
      return { completed, total: section.items.length };
    },
    [checklistState],
  );

  return {
    checklistState,
    isLoading,
    totalItems: TOTAL_CHECKLIST_ITEMS,
    completedItems,
    progressPercent,
    sectionProgress,
    toggleItem,
    resetChecklist,
    load,
  };
}
