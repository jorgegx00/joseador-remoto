import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useLlmStore } from "@/stores/llmStore";
import type { NarrativeReport } from "@/types";

interface UseNarrativeAnalysisResult {
  report: NarrativeReport | null;
  isLoading: boolean;
  error: string | null;
  runAnalysis: (cvId: string, jobId: string | null) => Promise<void>;
  reset: () => void;
}

export function useNarrativeAnalysis(): UseNarrativeAnalysisResult {
  const [report, setReport] = useState<NarrativeReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generateNarrativeReport = useLlmStore((s) => s.generateNarrativeReport);

  const runAnalysis = useCallback(
    async (cvId: string, jobId: string | null) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await generateNarrativeReport(cvId, jobId);
        if (result) {
          setReport(result);
        } else {
          const storeError = useLlmStore.getState().error;
          const msg = storeError ?? "Narrative report generation failed";
          setError(msg);
          toast.error(msg);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        toast.error(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [generateNarrativeReport],
  );

  const reset = useCallback(() => {
    setReport(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { report, isLoading, error, runAnalysis, reset };
}
