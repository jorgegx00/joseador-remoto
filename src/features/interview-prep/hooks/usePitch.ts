import { useState, useCallback, useEffect } from "react";
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
import type { PitchVariant, InterviewPrep, ParsedCv } from "@/types";
import type { LlmProviderConfig } from "@/lib/llm/providers/base";

interface PitchState {
  casual: string;
  formal: string;
  technical: string;
}

interface GeneratingState {
  casual: boolean;
  formal: boolean;
  technical: boolean;
}

interface UsePitchReturn {
  pitches: PitchState;
  isGenerating: GeneratingState;
  isLoading: boolean;
  hasLlm: boolean;
  loadPitches: (applicationId: string) => Promise<void>;
  generatePitch: (
    variant: PitchVariant,
    cv: ParsedCv,
    applicationId: string,
  ) => Promise<void>;
  generateAll: (cv: ParsedCv, applicationId: string) => Promise<void>;
  updatePitchText: (variant: PitchVariant, text: string) => void;
  savePitches: (applicationId: string) => Promise<void>;
}

export function usePitch(): UsePitchReturn {
  const { t } = useTranslation("interview-prep");
  const [pitches, setPitches] = useState<PitchState>({
    casual: "",
    formal: "",
    technical: "",
  });
  const [isGenerating, setIsGenerating] = useState<GeneratingState>({
    casual: false,
    formal: false,
    technical: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [prepId, setPrepId] = useState<string | null>(null);

  const activeProvider = useSettingsStore((s) => s.llm.active_provider);
  const hasLlm = activeProvider !== null;

  const getProviderConfig =
    useCallback(async (): Promise<LlmProviderConfig | null> => {
      const { llm } = useSettingsStore.getState();
      if (!llm.active_provider) return null;
      return getConfig(llm.active_provider);
    }, []);

  const loadPitches = useCallback(async (applicationId: string) => {
    setIsLoading(true);
    try {
      const prep = await getInterviewPrepByApplicationId(applicationId);
      if (prep) {
        setPrepId(prep.id);
        setPitches({
          casual: prep.pitch_casual,
          formal: prep.pitch_formal,
          technical: prep.pitch_technical,
        });
      }
    } catch (err) {
      console.error("Failed to load pitches:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const savePitches = useCallback(
    async (applicationId: string) => {
      try {
        const existing = await getInterviewPrepByApplicationId(applicationId);
        const now = Date.now();
        const prep: InterviewPrep = existing
          ? {
              ...existing,
              pitch_casual: pitches.casual,
              pitch_formal: pitches.formal,
              pitch_technical: pitches.technical,
              updated_at: now,
            }
          : {
              id: prepId ?? ulid(),
              application_id: applicationId,
              pitch_casual: pitches.casual,
              pitch_formal: pitches.formal,
              pitch_technical: pitches.technical,
              strengths: [],
              weaknesses: [],
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
        console.error("Failed to save pitches:", err);
      }
    },
    [pitches, prepId],
  );

  const generatePitch = useCallback(
    async (
      variant: PitchVariant,
      cv: ParsedCv,
      applicationId: string,
    ) => {
      setIsGenerating((prev) => ({ ...prev, [variant]: true }));
      try {
        const config = await getProviderConfig();
        if (!config) {
          toast.error(t("pitch.no_llm"));
          return;
        }
        const service = createLlmService(config);
        const result = await service.generatePitch(cv, variant);
        setPitches((prev) => ({ ...prev, [variant]: result.pitch }));

        // Save immediately
        const existing = await getInterviewPrepByApplicationId(applicationId);
        const now = Date.now();
        const pitchKey = `pitch_${variant}` as const;
        const prep: InterviewPrep = existing
          ? { ...existing, [pitchKey]: result.pitch, updated_at: now }
          : {
              id: prepId ?? ulid(),
              application_id: applicationId,
              pitch_casual: variant === "casual" ? result.pitch : "",
              pitch_formal: variant === "formal" ? result.pitch : "",
              pitch_technical: variant === "technical" ? result.pitch : "",
              strengths: [],
              weaknesses: [],
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
        toast.success(t("pitch.generated_success"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg);
      } finally {
        setIsGenerating((prev) => ({ ...prev, [variant]: false }));
      }
    },
    [getProviderConfig, prepId, t],
  );

  const generateAll = useCallback(
    async (cv: ParsedCv, applicationId: string) => {
      const variants: PitchVariant[] = ["casual", "formal", "technical"];
      for (const variant of variants) {
        await generatePitch(variant, cv, applicationId);
      }
    },
    [generatePitch],
  );

  const updatePitchText = useCallback(
    (variant: PitchVariant, text: string) => {
      setPitches((prev) => ({ ...prev, [variant]: text }));
    },
    [],
  );

  return {
    pitches,
    isGenerating,
    isLoading,
    hasLlm,
    loadPitches,
    generatePitch,
    generateAll,
    updatePitchText,
    savePitches,
  };
}
