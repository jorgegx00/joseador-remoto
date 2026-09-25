import { useState, useCallback, useRef } from "react";
import { useCvStore } from "@/stores/cvStore";
import { useCvRefine } from "@/features/cv/hooks/useCvRefine";
import { useSettingsStore } from "@/stores/settingsStore";
import { cvService } from "@/services/cv";
import type { ParsedCv } from "@/types";

type UploadStep =
  | "idle"
  | "uploading"
  | "extracting"
  | "analyzing"
  | "awaiting_enhanced_choice"
  | "refining"
  | "complete"
  | "error";

interface PendingRefinement {
  cvId: string;
  rawText: string;
  heuristic: ParsedCv;
}

interface UseCvUploadResult {
  upload: () => Promise<string | null>;
  isUploading: boolean;
  step: UploadStep;
  progress: number;
  error: string | null;
  pendingRefinement: PendingRefinement | null;
  refinementFailed: boolean;
  confirmEnhanced: () => void;
  skipEnhanced: () => void;
  reset: () => void;
}

export function useCvUpload(): UseCvUploadResult {
  const { uploadCv, parseCv, updateCvData } = useCvStore();
  const { refine } = useCvRefine();
  const [step, setStep] = useState<UploadStep>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingRefinement, setPendingRefinement] = useState<PendingRefinement | null>(null);
  const [refinementFailed, setRefinementFailed] = useState(false);
  const choiceResolverRef = useRef<((value: "confirm" | "skip") => void) | null>(null);

  const reset = useCallback(() => {
    setStep("idle");
    setProgress(0);
    setError(null);
    setPendingRefinement(null);
    setRefinementFailed(false);
    choiceResolverRef.current = null;
  }, []);

  const upload = useCallback(async (): Promise<string | null> => {
    setError(null);
    setPendingRefinement(null);
    setRefinementFailed(false);
    setStep("uploading");
    setProgress(20);

    try {
      const cvId = await uploadCv();
      if (!cvId) {
        setStep("idle");
        setProgress(0);
        return null;
      }

      setStep("extracting");
      setProgress(45);

      try {
        await parseCv(cvId);
      } catch {
        setStep("complete");
        setProgress(100);
        return cvId;
      }

      setStep("analyzing");
      setProgress(65);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // why: read provider directly from the store so we don't miss the dialog
      // when settings haven't finished hydrating yet.
      const activeProvider = useSettingsStore.getState().llm.active_provider;
      if (!activeProvider) {
        setStep("complete");
        setProgress(100);
        return cvId;
      }

      const fresh = await cvService.getCv(cvId);
      if (!fresh || !fresh.raw_text) {
        setStep("complete");
        setProgress(100);
        return cvId;
      }

      const pending: PendingRefinement = {
        cvId,
        rawText: fresh.raw_text,
        heuristic: fresh.parsed_data,
      };
      setPendingRefinement(pending);
      setStep("awaiting_enhanced_choice");
      setProgress(75);

      const choice = await new Promise<"confirm" | "skip">((resolve) => {
        choiceResolverRef.current = resolve;
      });
      choiceResolverRef.current = null;
      setPendingRefinement(null);

      if (choice === "skip") {
        setStep("complete");
        setProgress(100);
        return cvId;
      }

      setStep("refining");
      setProgress(85);
      try {
        const refined = await refine(pending.rawText, pending.heuristic);
        if (refined) {
          // why: if LLM returns null we keep the heuristic parse rather than wiping user-visible data.
          await updateCvData(cvId, refined);
        } else {
          setRefinementFailed(true);
        }
      } catch {
        setRefinementFailed(true);
      }

      setStep("complete");
      setProgress(100);
      return cvId;
    } catch (err) {
      setError(String(err));
      setStep("error");
      setProgress(0);
      return null;
    }
  }, [uploadCv, parseCv, refine, updateCvData]);

  const confirmEnhanced = useCallback(() => {
    const resolver = choiceResolverRef.current;
    choiceResolverRef.current = null;
    resolver?.("confirm");
  }, []);

  const skipEnhanced = useCallback(() => {
    const resolver = choiceResolverRef.current;
    choiceResolverRef.current = null;
    resolver?.("skip");
  }, []);

  return {
    upload,
    isUploading: step !== "idle" && step !== "complete" && step !== "error",
    step,
    progress,
    error,
    pendingRefinement,
    refinementFailed,
    confirmEnhanced,
    skipEnhanced,
    reset,
  };
}
