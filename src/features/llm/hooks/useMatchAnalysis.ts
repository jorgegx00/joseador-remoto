import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useLlmStore } from "@/stores/llmStore";
import type { MatchAnalysis } from "@/types";

interface UseMatchAnalysisResult {
  analysis: MatchAnalysis | null;
  isCached: boolean;
  isLoading: boolean;
  error: string | null;
  runAnalysis: (
    cvId: string,
    jobId: string,
    options?: { force?: boolean },
  ) => Promise<void>;
  reset: () => void;
}

export function useMatchAnalysis(): UseMatchAnalysisResult {
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analyzeMatch = useLlmStore((s) => s.analyzeMatch);

  const runAnalysis = useCallback(
    async (
      cvId: string,
      jobId: string,
      options?: { force?: boolean },
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await analyzeMatch(cvId, jobId, options);
        if (result) {
          setAnalysis(result);
          // Cached-ness comes from the service, not from the `force` flag: a first-time
          // (non-forced) analysis is fresh, not cached.
          setIsCached(useLlmStore.getState().lastMatchCached);
        } else {
          const storeError = useLlmStore.getState().error;
          const msg = storeError ?? "Analysis failed";
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
    [analyzeMatch],
  );

  const reset = useCallback(() => {
    setAnalysis(null);
    setIsCached(false);
    setError(null);
    setIsLoading(false);
  }, []);

  return { analysis, isCached, isLoading, error, runAnalysis, reset };
}
