import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { createLlmService, type LlmService } from "@/lib/llm/service";
import { CancelledError, describeLlmError } from "@/lib/llm/errors";
import type { MaterialLanguage } from "@/lib/llm/language";
import { getActiveLlmConfig } from "@/services/llm-active";
import { getPrepDocument, upsertPrepDocument } from "@/services/database";
import { useSettingsStore } from "@/stores/settingsStore";
import type { PrepDocument, PrepDocumentKind } from "@/types";

export async function getActiveLlmService(): Promise<LlmService | null> {
  const config = await getActiveLlmConfig();
  return config ? createLlmService(config) : null;
}

/**
 * Loads a stored prep document (gap brief / round pack) and regenerates it on demand.
 * `produce` receives the LLM service and an abort signal and returns the new content.
 */
export function usePrepDocument<T>(
  applicationId: string,
  kind: PrepDocumentKind,
  interviewId = "",
) {
  const { t } = useTranslation("interview-prep");
  const [doc, setDoc] = useState<PrepDocument<T> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hasLlm = useSettingsStore((s) => s.llm.active_provider !== null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setDoc(null);
    getPrepDocument<T>(applicationId, kind, interviewId)
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch((err) => console.error(`[prep] load ${kind} failed:`, err))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [applicationId, kind, interviewId]);

  const generate = useCallback(
    async (language: MaterialLanguage, produce: (llm: LlmService, signal: AbortSignal) => Promise<T>) => {
      const llm = await getActiveLlmService();
      if (!llm) {
        toast.error(t("prep_ai.no_llm"));
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsGenerating(true);
      try {
        const content = await produce(llm, controller.signal);
        const saved = await upsertPrepDocument<T>({
          application_id: applicationId,
          interview_id: interviewId,
          kind,
          language,
          content,
        });
        setDoc(saved);
      } catch (err) {
        if (err instanceof CancelledError || controller.signal.aborted) return;
        toast.error(t("prep_ai.generation_failed"), { description: describeLlmError(err).message });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setIsGenerating(false);
      }
    },
    [applicationId, interviewId, kind, t],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { doc, isLoading, isGenerating, hasLlm, generate, cancel };
}
