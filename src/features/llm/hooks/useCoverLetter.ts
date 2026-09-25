import { useState, useCallback, useRef } from "react";
import { ulid } from "ulid";
import { LlmService } from "@/lib/llm/service";
import { getConfig } from "@/services/llm";
import {
  getCoverLettersByJob,
  insertCoverLetter,
} from "@/services/database";
import { useSettingsStore } from "@/stores/settingsStore";
import type { CvRecord, Job, CoverLetter } from "@/types";
import type { LlmProviderConfig } from "@/lib/llm/providers/base";

interface UseCoverLetterReturn {
  streamedContent: string;
  isGenerating: boolean;
  error: string | null;
  elapsedSeconds: number;
  savedLetter: CoverLetter | null;
  previousLetters: CoverLetter[];
  isLoadingHistory: boolean;

  generate: (cv: CvRecord, job: Job) => Promise<void>;
  loadHistory: (cvId: string, jobId: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useCoverLetter(): UseCoverLetterReturn {
  const [streamedContent, setStreamedContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [savedLetter, setSavedLetter] = useState<CoverLetter | null>(null);
  const [previousLetters, setPreviousLetters] = useState<CoverLetter[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const getProviderConfig = useCallback(async (): Promise<LlmProviderConfig | null> => {
    const { llm } = useSettingsStore.getState();
    if (!llm.active_provider) return null;
    const config = await getConfig(llm.active_provider);
    return config;
  }, []);

  const loadHistory = useCallback(async (cvId: string, jobId: string) => {
    setIsLoadingHistory(true);
    try {
      const letters = await getCoverLettersByJob(cvId, jobId);
      setPreviousLetters(letters);
    } catch (err) {
      console.error("Failed to load cover letter history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const generate = useCallback(
    async (cv: CvRecord, job: Job) => {
      cancelledRef.current = false;
      setIsGenerating(true);
      setError(null);
      setStreamedContent("");
      setSavedLetter(null);

      try {
        const config = await getProviderConfig();
        if (!config) {
          setError("No LLM provider configured");
          setIsGenerating(false);
          return;
        }

        startTimer();

        const service = new LlmService(config);
        let content = "";

        const generator = service.generateCoverLetter(cv.parsed_data, job);
        for await (const chunk of generator) {
          if (cancelledRef.current) throw new Error("Cancelled");
          content += chunk;
          setStreamedContent(content);
        }

        if (cancelledRef.current) throw new Error("Cancelled");

        // Save to DB
        const now = Date.now();
        const letter: CoverLetter = {
          id: ulid(),
          cv_id: cv.id,
          job_id: job.id,
          content,
          tone: "professional",
          llm_provider: config.provider,
          llm_model: config.model,
          created_at: now,
          updated_at: now,
        };

        await insertCoverLetter(letter);
        setSavedLetter(letter);

        // Reload history
        await loadHistory(cv.id, job.id);
      } catch (err) {
        const message = String(err);
        if (!message.includes("Cancelled")) {
          setError(message);
        }
      } finally {
        stopTimer();
        setIsGenerating(false);
      }
    },
    [getProviderConfig, startTimer, stopTimer, loadHistory],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stopTimer();
    setIsGenerating(false);
  }, [stopTimer]);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    setStreamedContent("");
    setError(null);
    setElapsedSeconds(0);
    setSavedLetter(null);
    stopTimer();
  }, [stopTimer]);

  return {
    streamedContent,
    isGenerating,
    error,
    elapsedSeconds,
    savedLetter,
    previousLetters,
    isLoadingHistory,
    generate,
    loadHistory,
    cancel,
    reset,
  };
}
