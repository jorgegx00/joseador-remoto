import { useState, useCallback } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { useTranslation } from "react-i18next";
import { createLlmService } from "@/lib/llm";
import { getConfig } from "@/services/llm";
import {
  getInterviewPrepByApplicationId,
  upsertInterviewPrep,
} from "@/services/database";
import { useSettingsStore } from "@/stores/settingsStore";
import type {
  StrengthEntry,
  WeaknessEntry,
  InterviewPrep,
  ParsedCv,
  Job,
} from "@/types";
import type { LlmProviderConfig } from "@/lib/llm/providers/base";

interface UseStrengthsWeaknessesReturn {
  strengths: StrengthEntry[];
  weaknesses: WeaknessEntry[];
  isLoading: boolean;
  isGenerating: boolean;
  hasLlm: boolean;
  load: (applicationId: string) => Promise<void>;
  generate: (
    cv: ParsedCv,
    job: Job,
    applicationId: string,
  ) => Promise<void>;
  regenerateStrength: (
    index: number,
    cv: ParsedCv,
    job: Job,
    applicationId: string,
  ) => Promise<void>;
  regenerateWeakness: (
    index: number,
    cv: ParsedCv,
    job: Job,
    applicationId: string,
  ) => Promise<void>;
  updateStrength: (index: number, entry: StrengthEntry) => void;
  updateWeakness: (index: number, entry: WeaknessEntry) => void;
  addStrength: (entry: StrengthEntry) => void;
  addWeakness: (entry: WeaknessEntry) => void;
  removeStrength: (index: number) => void;
  removeWeakness: (index: number) => void;
  save: (applicationId: string) => Promise<void>;
}

export function useStrengthsWeaknesses(): UseStrengthsWeaknessesReturn {
  const { t } = useTranslation("interview-prep");
  const [strengths, setStrengths] = useState<StrengthEntry[]>([]);
  const [weaknesses, setWeaknesses] = useState<WeaknessEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [prepId, setPrepId] = useState<string | null>(null);

  const activeProvider = useSettingsStore((s) => s.llm.active_provider);
  const hasLlm = activeProvider !== null;

  const getProviderConfig =
    useCallback(async (): Promise<LlmProviderConfig | null> => {
      const { llm } = useSettingsStore.getState();
      if (!llm.active_provider) return null;
      return getConfig(llm.active_provider);
    }, []);

  const load = useCallback(async (applicationId: string) => {
    setIsLoading(true);
    try {
      const prep = await getInterviewPrepByApplicationId(applicationId);
      if (prep) {
        setPrepId(prep.id);
        setStrengths(prep.strengths);
        setWeaknesses(prep.weaknesses);
      }
    } catch (err) {
      console.error("Failed to load strengths/weaknesses:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persistData = useCallback(
    async (
      applicationId: string,
      newStrengths: StrengthEntry[],
      newWeaknesses: WeaknessEntry[],
    ) => {
      try {
        const existing =
          await getInterviewPrepByApplicationId(applicationId);
        const now = Date.now();
        const prep: InterviewPrep = existing
          ? {
              ...existing,
              strengths: newStrengths,
              weaknesses: newWeaknesses,
              updated_at: now,
            }
          : {
              id: prepId ?? ulid(),
              application_id: applicationId,
              pitch_casual: "",
              pitch_formal: "",
              pitch_technical: "",
              strengths: newStrengths,
              weaknesses: newWeaknesses,
              company_brief: "",
              custom_questions: [],
              checklist_state: {
                pre_interview: {},
                video_call_setup: {},
                during_interview: {},
                closing: {},
                post_interview: {},
              },
              created_at: now,
              updated_at: now,
            };
        await upsertInterviewPrep(prep);
        if (!prepId) setPrepId(prep.id);
      } catch (err) {
        console.error("Failed to persist strengths/weaknesses:", err);
      }
    },
    [prepId],
  );

  const generate = useCallback(
    async (cv: ParsedCv, job: Job, applicationId: string) => {
      setIsGenerating(true);
      try {
        const config = await getProviderConfig();
        if (!config) {
          toast.error(t("strengths_weaknesses.no_llm"));
          return;
        }
        const service = createLlmService(config);
        const result = await service.generateStrengthsWeaknesses(cv, job);
        setStrengths(result.strengths);
        setWeaknesses(result.weaknesses);
        await persistData(applicationId, result.strengths, result.weaknesses);
        toast.success(t("strengths_weaknesses.generated_success"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg);
      } finally {
        setIsGenerating(false);
      }
    },
    [getProviderConfig, persistData, t],
  );

  const regenerateStrength = useCallback(
    async (
      index: number,
      cv: ParsedCv,
      job: Job,
      applicationId: string,
    ) => {
      setIsGenerating(true);
      try {
        const config = await getProviderConfig();
        if (!config) {
          toast.error(t("strengths_weaknesses.no_llm"));
          return;
        }
        const service = createLlmService(config);
        const result = await service.generateStrengthsWeaknesses(cv, job);
        if (result.strengths.length > 0) {
          const newEntry =
            result.strengths[index % result.strengths.length];
          setStrengths((prev) => {
            const updated = [...prev];
            updated[index] = newEntry;
            persistData(applicationId, updated, weaknesses);
            return updated;
          });
          toast.success(t("strengths_weaknesses.regenerated_success"));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg);
      } finally {
        setIsGenerating(false);
      }
    },
    [getProviderConfig, persistData, weaknesses, t],
  );

  const regenerateWeakness = useCallback(
    async (
      index: number,
      cv: ParsedCv,
      job: Job,
      applicationId: string,
    ) => {
      setIsGenerating(true);
      try {
        const config = await getProviderConfig();
        if (!config) {
          toast.error(t("strengths_weaknesses.no_llm"));
          return;
        }
        const service = createLlmService(config);
        const result = await service.generateStrengthsWeaknesses(cv, job);
        if (result.weaknesses.length > 0) {
          const newEntry =
            result.weaknesses[index % result.weaknesses.length];
          setWeaknesses((prev) => {
            const updated = [...prev];
            updated[index] = newEntry;
            persistData(applicationId, strengths, updated);
            return updated;
          });
          toast.success(t("strengths_weaknesses.regenerated_success"));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg);
      } finally {
        setIsGenerating(false);
      }
    },
    [getProviderConfig, persistData, strengths, t],
  );

  const updateStrength = useCallback(
    (index: number, entry: StrengthEntry) => {
      setStrengths((prev) => {
        const updated = [...prev];
        updated[index] = entry;
        return updated;
      });
    },
    [],
  );

  const updateWeakness = useCallback(
    (index: number, entry: WeaknessEntry) => {
      setWeaknesses((prev) => {
        const updated = [...prev];
        updated[index] = entry;
        return updated;
      });
    },
    [],
  );

  const addStrength = useCallback((entry: StrengthEntry) => {
    setStrengths((prev) => [...prev, entry]);
  }, []);

  const addWeakness = useCallback((entry: WeaknessEntry) => {
    setWeaknesses((prev) => [...prev, entry]);
  }, []);

  const removeStrength = useCallback((index: number) => {
    setStrengths((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removeWeakness = useCallback((index: number) => {
    setWeaknesses((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const save = useCallback(
    async (applicationId: string) => {
      await persistData(applicationId, strengths, weaknesses);
    },
    [persistData, strengths, weaknesses],
  );

  return {
    strengths,
    weaknesses,
    isLoading,
    isGenerating,
    hasLlm,
    load,
    generate,
    regenerateStrength,
    regenerateWeakness,
    updateStrength,
    updateWeakness,
    addStrength,
    addWeakness,
    removeStrength,
    removeWeakness,
    save,
  };
}
