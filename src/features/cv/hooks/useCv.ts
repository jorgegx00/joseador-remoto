import { useEffect, useState, useCallback } from "react";
import { cvService } from "@/services/cv";
import type { CvRecord } from "@/types";

interface UseCvResult {
  cv: CvRecord | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCv(cvId: string): UseCvResult {
  const [cv, setCv] = useState<CvRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCv = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await cvService.getCv(cvId);
      if (result) {
        setCv(result);
      } else {
        setError(`CV not found: ${cvId}`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [cvId]);

  useEffect(() => {
    void fetchCv();
  }, [fetchCv]);

  return { cv, isLoading, error, refetch: fetchCv };
}
