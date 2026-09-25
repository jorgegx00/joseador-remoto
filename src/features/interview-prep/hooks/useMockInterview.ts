import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ulid } from "ulid";
import { CancelledError, describeLlmError } from "@/lib/llm/errors";
import type { MaterialLanguage } from "@/lib/llm/language";
import type { MockTranscriptTurn } from "@/lib/llm/prep-prompts";
import {
  deleteMockSession,
  getMockSessionsByApplicationId,
  saveMockSession,
} from "@/services/database";
import type { InterviewType, Job, MockSession, MockTurn, ParsedCv } from "@/types";
import { getActiveLlmService } from "./usePrepDocument";

export interface StartMockOptions {
  interviewType: InterviewType;
  interviewId: string;
  totalQuestions: number;
  language: MaterialLanguage;
  coachingLanguage: MaterialLanguage;
}

function answered(turns: MockTurn[]): MockTranscriptTurn[] {
  return turns.filter((t) => t.answer.trim()).map((t) => ({ question: t.question, answer: t.answer }));
}

/**
 * Turn-based practice interview. Each answer costs one LLM call that both coaches the
 * answer and asks the next question; the session ends with a report.
 * Sessions are saved after every step so a crash or navigation never loses answers.
 */
export function useMockInterview(applicationId: string, cv: ParsedCv | null, job: Job | null) {
  const { t } = useTranslation("interview-prep");
  const [sessions, setSessions] = useState<MockSession[]>([]);
  const [session, setSession] = useState<MockSession | null>(null);
  const [busy, setBusy] = useState<null | "question" | "report">(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMockSessionsByApplicationId(applicationId)
      .then((list) => {
        if (!cancelled) setSessions(list);
      })
      .catch((err) => console.error("[mock] load sessions failed:", err));
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [applicationId]);

  const persist = useCallback(async (next: MockSession) => {
    setSession(next);
    setSessions((prev) => [next, ...prev.filter((s) => s.id !== next.id)]);
    try {
      await saveMockSession(next);
    } catch (err) {
      console.error("[mock] save failed:", err);
    }
  }, []);

  const withLlm = useCallback(
    async <T,>(
      kind: "question" | "report",
      fn: (llm: NonNullable<Awaited<ReturnType<typeof getActiveLlmService>>>, signal: AbortSignal) => Promise<T>,
    ): Promise<T | null> => {
      const llm = await getActiveLlmService();
      if (!llm) {
        toast.error(t("prep_ai.no_llm"));
        return null;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(kind);
      try {
        return await fn(llm, controller.signal);
      } catch (err) {
        if (!(err instanceof CancelledError) && !controller.signal.aborted) {
          toast.error(t("prep_ai.generation_failed"), { description: describeLlmError(err).message });
        }
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(null);
      }
    },
    [t],
  );

  const finish = useCallback(
    async (current: MockSession) => {
      if (!cv || !job) return;
      const transcript = answered(current.turns);
      // Drop an unanswered trailing question so the transcript matches the report.
      const turns = current.turns.filter((turn) => turn.answer.trim());
      if (transcript.length === 0) {
        await persist({ ...current, turns, status: "completed" });
        return;
      }
      const report = await withLlm("report", (llm, signal) =>
        llm.mockReport(
          { cv, job, interviewType: current.interview_type, coachingLanguage: current.coaching_language, transcript },
          signal,
        ),
      );
      await persist({ ...current, turns, report, status: report ? "completed" : current.status });
    },
    [cv, job, persist, withLlm],
  );

  const start = useCallback(
    async (opts: StartMockOptions) => {
      if (!cv || !job) return;
      const now = Date.now();
      const draft: MockSession = {
        id: ulid(),
        application_id: applicationId,
        interview_id: opts.interviewId,
        interview_type: opts.interviewType,
        language: opts.language,
        coaching_language: opts.coachingLanguage,
        total_questions: opts.totalQuestions,
        turns: [],
        report: null,
        status: "active",
        created_at: now,
        updated_at: now,
      };
      setSession(draft);
      const result = await withLlm("question", (llm, signal) =>
        llm.mockTurn(
          {
            cv,
            job,
            interviewType: opts.interviewType,
            language: opts.language,
            coachingLanguage: opts.coachingLanguage,
            transcript: [],
            current: null,
            totalQuestions: opts.totalQuestions,
          },
          signal,
        ),
      );
      if (!result?.next_question) {
        setSession(null);
        return;
      }
      await persist({
        ...draft,
        turns: [{ ...result.next_question, answer: "", coaching: null }],
      });
    },
    [applicationId, cv, job, persist, withLlm],
  );

  /** Coaches the last (answered) turn and asks the next question, or finishes. */
  const advance = useCallback(
    async (current: MockSession) => {
      if (!cv || !job) return;
      const turns = current.turns;
      const last = turns[turns.length - 1];
      if (!last?.answer) return;
      const done = turns.length >= current.total_questions;
      const result = await withLlm("question", (llm, signal) =>
        llm.mockTurn(
          {
            cv,
            job,
            interviewType: current.interview_type,
            language: current.language,
            coachingLanguage: current.coaching_language,
            transcript: answered(turns.slice(0, -1)),
            current: { question: last.question, answer: last.answer },
            totalQuestions: current.total_questions,
          },
          signal,
        ),
      );
      if (!result) return; // answer is saved; the user can retry

      const coached = [...turns];
      coached[coached.length - 1] = { ...last, coaching: result.coaching };
      const next = result.next_question && !done ? { ...result.next_question, answer: "", coaching: null } : null;
      const updated = { ...current, turns: next ? [...coached, next] : coached };
      await persist(updated);
      if (!next) await finish(updated);
    },
    [cv, job, persist, withLlm, finish],
  );

  const answer = useCallback(
    async (text: string) => {
      if (!session) return;
      const last = session.turns[session.turns.length - 1];
      if (!last || last.answer) return;
      const withAnswer = { ...session, turns: [...session.turns.slice(0, -1), { ...last, answer: text }] };
      await persist(withAnswer);
      await advance(withAnswer);
    },
    [session, persist, advance],
  );

  /** True when the last answer was saved but the follow-up call failed or was cancelled. */
  const stalled =
    !!session &&
    session.status === "active" &&
    busy === null &&
    session.turns.length > 0 &&
    !!session.turns[session.turns.length - 1].answer;

  const retry = useCallback(async () => {
    if (!session) return;
    const last = session.turns[session.turns.length - 1];
    // Coaching arrived but the report failed: only the report needs retrying.
    if (last?.coaching) await finish(session);
    else await advance(session);
  }, [session, advance, finish]);

  const endNow = useCallback(async () => {
    if (session) await finish(session);
  }, [session, finish]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const open = useCallback((s: MockSession | null) => setSession(s), []);

  const remove = useCallback(
    async (id: string) => {
      await deleteMockSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setSession((cur) => (cur?.id === id ? null : cur));
    },
    [],
  );

  return { sessions, session, busy, stalled, start, answer, retry, endNow, cancel, open, remove };
}
