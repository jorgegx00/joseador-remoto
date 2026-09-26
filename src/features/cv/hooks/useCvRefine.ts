import { useState, useCallback } from "react";
import { LlmService } from "@/lib/llm/service";
import { getConfig } from "@/services/llm";
import { useSettingsStore } from "@/stores/settingsStore";
import type { CvLayoutLine, ParsedCv } from "@/types";
import type { CvChatTurn } from "@/lib/llm/prompts";
import type { CvParseProgress } from "@/lib/cv/llm-parse";

interface UseCvRefineResult {
  proposed: ParsedCv | null;
  isRefining: boolean;
  /** Progress of the running AI parse (sections, then entries). */
  parseProgress: CvParseProgress | null;
  isChatting: boolean;
  chatHistory: CvChatTurn[];
  error: string | null;
  chatError: string | null;
  refine: (rawText: string, current: ParsedCv, layout?: CvLayoutLine[] | null) => Promise<ParsedCv | null>;
  refineWithChat: (rawText: string, userMessage: string) => Promise<void>;
  setProposedManually: (cv: ParsedCv) => void;
  clearChat: () => void;
  reset: () => void;
}

export function useCvRefine(): UseCvRefineResult {
  const [proposed, setProposed] = useState<ParsedCv | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [parseProgress, setParseProgress] = useState<CvParseProgress | null>(null);
  const [isChatting, setIsChatting] = useState(false);
  const [chatHistory, setChatHistory] = useState<CvChatTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const refine = useCallback(
    async (rawText: string, current: ParsedCv, layout?: CvLayoutLine[] | null): Promise<ParsedCv | null> => {
      setError(null);
      setIsRefining(true);
      setProposed(null);
      try {
        const activeProvider = useSettingsStore.getState().llm.active_provider;
        if (!activeProvider) {
          setError("No LLM provider configured");
          return null;
        }
        const config = await getConfig(activeProvider);
        const service = new LlmService(config);
        const refined = await service.refineCvParsing(rawText, current, {
          layout,
          onProgress: setParseProgress,
        });
        setProposed(refined);
        return refined;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setIsRefining(false);
        setParseProgress(null);
      }
    },
    [],
  );

  const refineWithChat = useCallback(
    async (rawText: string, userMessage: string): Promise<void> => {
      const trimmed = userMessage.trim();
      if (!trimmed || !proposed) return;
      setChatError(null);
      setIsChatting(true);
      const previousHistory = chatHistory;
      setChatHistory((prev) => [...prev, { role: "user", content: trimmed }]);
      try {
        const activeProvider = useSettingsStore.getState().llm.active_provider;
        if (!activeProvider) {
          throw new Error("No LLM provider configured");
        }
        const config = await getConfig(activeProvider);
        const service = new LlmService(config);
        const updated = await service.chatRefineParsedCv(
          rawText,
          proposed,
          previousHistory,
          trimmed,
        );
        setProposed(updated);
        setChatHistory((prev) => [
          ...prev,
          { role: "assistant", content: "Updated the parsed CV." },
        ]);
      } catch (err) {
        setChatError(err instanceof Error ? err.message : String(err));
        setChatHistory(previousHistory);
      } finally {
        setIsChatting(false);
      }
    },
    [proposed, chatHistory],
  );

  const setProposedManually = useCallback((cv: ParsedCv) => {
    setProposed(cv);
  }, []);

  const clearChat = useCallback(() => {
    setChatHistory([]);
    setChatError(null);
  }, []);

  const reset = useCallback(() => {
    setProposed(null);
    setError(null);
    setChatError(null);
    setChatHistory([]);
    setIsRefining(false);
    setIsChatting(false);
  }, []);

  return {
    proposed,
    isRefining,
    parseProgress,
    isChatting,
    chatHistory,
    error,
    chatError,
    refine,
    refineWithChat,
    setProposedManually,
    clearChat,
    reset,
  };
}
