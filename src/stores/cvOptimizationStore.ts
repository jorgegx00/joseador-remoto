/**
 * "Optimize CV" session: source CV + target job → match analysis → streamed proposal →
 * section-by-section review (edit / keep original / restore AI) → chat refinement → save.
 *
 * One active session, persisted to localStorage so navigating away (or restarting the
 * app) never loses the review. Streaming text and run handles are NOT persisted.
 */
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { ulid } from "ulid";
import { LlmService } from "@/lib/llm/service";
import type { CvChatTurn } from "@/lib/llm/prompts";
import type {
  CvOutputLanguage,
  SkillToAdd,
  CvOptimizationInput,
} from "@/lib/llm/cv-optimization-prompts";
import { describeLlmError, isCancelledError, type LlmErrorCode } from "@/lib/llm/errors";
import {
  findPlaceholderViolation,
  isRunaway,
  splitNotesAndCv,
  stripNotesBlock,
  applyPatches,
  extractPatchSectionsDuringStream,
  stripForbiddenPersonalData,
} from "@/lib/llm/cv-output-guard";
import { formatCvAsMarkdown } from "@/lib/cv/formatCvAsMarkdown";
import { normalizeCvMarkdown } from "@/lib/cv/markdown-blocks";
import { parseCvSections } from "@/lib/cv/cv-sections";
import {
  createReviewState,
  composeFinal,
  reviewReducer,
  rowFinalBody,
  historyInit,
  historyPush,
  historyUndo,
  historyRedo,
  type History,
  type ReviewState,
  type ReviewAction,
} from "@/lib/cv/review-state";
import {
  computeMissingJdSkills,
  computeExperienceYears,
  extractFigures,
  extractFigureMatches,
} from "@/lib/cv/cv-claims";
import { detectLanguage } from "@/lib/cv/detect-language";
import { fnv1a } from "@/lib/utils/fingerprint";
import { getOrRunMatchAnalysis, getCachedMatchAnalysis } from "@/services/match-analysis";
import { getActiveLlmConfig } from "@/services/llm-active";
import { saveTailoredCv, type SaveTailoredCvResult } from "@/services/tailored-cv";
import { useCvStore } from "@/stores/cvStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { cvMarketsForJob, cvRulesForMarkets, type CvRules } from "@/lib/markets/cv-rules";
import { countryName } from "@/lib/markets/countries";
import { isRegionCode } from "@/lib/markets/regions";
import type { CvRecord, Job, MatchAnalysis, GeneratedCv } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OptimizationErrorCode =
  | LlmErrorCode
  | "no_provider"
  | "empty_output"
  | "placeholder"
  | "runaway"
  | "analysis_failed";

export type RunAction = "analyze" | "generate" | "refine";

export type OptimizationStatus =
  | { kind: "idle" }
  | { kind: "analyzing"; startedAt: number }
  | {
      kind: "generating";
      phase: "connecting" | "thinking" | "writing";
      chars: number;
      reasoningChars: number;
      section: string | null;
      startedAt: number;
    }
  | { kind: "review" }
  | { kind: "refining"; sections: string[]; startedAt: number }
  | {
      kind: "error";
      code: OptimizationErrorCode;
      message: string;
      detail?: string;
      canRetry: boolean;
      action: RunAction;
    };

export interface SkillCandidate extends SkillToAdd {
  selected: boolean;
}

export interface OptimizationSession {
  /** `${cvId}::${jobId}` */
  key: string;
  cvId: string;
  jobId: string;
  originalMd: string;
  sourceLanguage: CvOutputLanguage | null;
  outputLanguage: CvOutputLanguage;
  languageOverridden: boolean;
  skillCandidates: SkillCandidate[];
  proposalMd: string | null;
  review: History<ReviewState> | null;
  chat: CvChatTurn[];
  /** Figures the user typed or confirmed ("This is accurate") — never flagged. */
  allowedFigures: string[];
  /** Job-post skills the user acknowledged ("I can discuss this"). */
  acknowledgedClaims: string[];
  truncated: boolean;
  /** generated_cvs id for this proposal (stable across saves → upsert). */
  generatedId: string | null;
  llmProvider: string;
  llmModel: string;
  /** True while a generation is in flight; survives a restart → "interrupted" notice. */
  generationInFlight: boolean;
  interrupted: boolean;
}

interface Ctx {
  cv: CvRecord;
  job: Job;
}

interface CvOptimizationState {
  session: OptimizationSession | null;
  /** Tailored CV id per `${cvId}::${jobId}` — later saves update instead of duplicating. */
  savedCvIds: Record<string, string>;
  /** Hash of the last saved final markdown per key, to show "saved" vs "save changes". */
  savedHashes: Record<string, string>;

  // Not persisted
  ctx: Ctx | null;
  status: OptimizationStatus;
  /** Live text of the current generation (preview while streaming). */
  streamText: string;
  analysis: MatchAnalysis | null;
  analysisCached: boolean;
  analysisStale: boolean | null;
  isLoadingAnalysis: boolean;
  isSaving: boolean;

  startSession: (cv: CvRecord, job: Job) => void;
  discardSession: () => void;
  loadCachedAnalysis: () => Promise<void>;
  runAnalysis: (force?: boolean) => Promise<MatchAnalysis | null>;
  generate: () => Promise<void>;
  refine: (message: string) => Promise<boolean>;
  cancel: () => void;
  retry: () => void;
  dismissError: () => void;
  setOutputLanguage: (lang: CvOutputLanguage) => void;
  toggleSkill: (skill: string) => void;
  dispatchReview: (action: ReviewAction) => void;
  undo: () => void;
  redo: () => void;
  acknowledgeClaim: (skill: string) => void;
  allowFigure: (figure: string) => void;
  save: (opts: {
    name: string;
    asNew: boolean;
    scoreBefore: number | null;
    scoreAfter: number | null;
    defaultNamePrefix: string;
  }) => Promise<SaveTailoredCvResult | null>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class GuardError extends Error {
  readonly code: OptimizationErrorCode;
  constructor(code: OptimizationErrorCode, message: string) {
    super(message);
    this.name = "GuardError";
    this.code = code;
  }
}

export function sessionKey(cvId: string, jobId: string): string {
  return `${cvId}::${jobId}`;
}

export function finalMarkdown(session: OptimizationSession | null): string {
  if (!session?.review) return "";
  return composeFinal(session.review.present);
}

function headingText(line: string | null): string {
  return (line ?? "").replace(/^#+\s*/, "").trim();
}

/** CV conventions of the job's market(s), from the user's market profile. */
export function marketContext(job: Job): { rules: CvRules; label: string } {
  const markets = cvMarketsForJob(job, useSettingsStore.getState().market.targetMarkets);
  return {
    rules: cvRulesForMarkets(markets),
    label: markets.map((m) => (isRegionCode(m) ? m : countryName(m, "en"))).join(", "),
  };
}

/** The job post's language; when it can't be told, the market's usual CV language. */
function detectOutputLanguage(job: Job): CvOutputLanguage {
  return detectLanguage(`${job.title}\n${job.description}`) ?? marketContext(job).rules.languages[0] ?? "en";
}

/** Drops personal data the job's market says must not be on a CV. */
export function applyMarketGuard(markdown: string, job: Job): string {
  const { markdown: clean, removed } = stripForbiddenPersonalData(markdown, marketContext(job).rules, job.description);
  if (removed.length > 0) console.info(`[cv-optimize] removed ${removed.length} personal-data line(s) per market rules`);
  return clean;
}

function buildSkillCandidates(originalMd: string, job: Job, analysis: MatchAnalysis | null): SkillCandidate[] {
  return computeMissingJdSkills(originalMd, job, analysis).map((s) => ({ ...s, selected: true }));
}

/** Last `## ` heading in streamed text — "Writing: Experience". */
function currentSection(text: string): string | null {
  const matches = text.match(/^##\s+(.+)$/gm);
  if (!matches || matches.length === 0) return null;
  return headingText(matches[matches.length - 1]);
}

// Run bookkeeping lives outside the store: AbortControllers aren't serializable.
let runCounter = 0;
let activeRun: { id: number; controller: AbortController; action: RunAction } | null = null;
let lastRefineMessage: string | null = null;

function startRun(action: RunAction): { id: number; signal: AbortSignal } {
  activeRun?.controller.abort();
  const controller = new AbortController();
  const id = ++runCounter;
  activeRun = { id, controller, action };
  return { id, signal: controller.signal };
}

function isCurrentRun(id: number): boolean {
  return activeRun?.id === id;
}

function endRun(id: number): void {
  if (activeRun?.id === id) activeRun = null;
}

const STREAM_FLUSH_MS = 50;

// Debounced localStorage: the persisted session can be a few hundred KB, don't rewrite it
// on every keystroke/stream tick.
function debouncedLocalStorage(delayMs: number): StateStorage {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, string>();
  const flush = (name: string) => {
    const value = pending.get(name);
    if (value === undefined) return;
    pending.delete(name);
    try {
      localStorage.setItem(name, value);
    } catch (err) {
      console.warn("[cvOptimizationStore] could not persist session:", err);
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      for (const name of [...pending.keys()]) flush(name);
    });
  }
  return {
    getItem: (name) => pending.get(name) ?? localStorage.getItem(name),
    setItem: (name, value) => {
      pending.set(name, value);
      const existing = timers.get(name);
      if (existing) clearTimeout(existing);
      timers.set(
        name,
        setTimeout(() => {
          timers.delete(name);
          flush(name);
        }, delayMs),
      );
    },
    removeItem: (name) => {
      pending.delete(name);
      const existing = timers.get(name);
      if (existing) clearTimeout(existing);
      localStorage.removeItem(name);
    },
  };
}

const PERSISTED_HISTORY_CAP = 20;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCvOptimizationStore = create<CvOptimizationState>()(
  persist(
    (set, get) => {
      const patchSession = (patch: Partial<OptimizationSession>) =>
        set((s) => (s.session ? { session: { ...s.session, ...patch } } : {}));

      const errorStatus = (
        err: unknown,
        action: RunAction,
      ): Extract<OptimizationStatus, { kind: "error" }> => {
        if (err instanceof GuardError) {
          return { kind: "error", code: err.code, message: err.message, canRetry: true, action };
        }
        const described = describeLlmError(err);
        return {
          kind: "error",
          code: described.code,
          message: described.message,
          canRetry: described.retryable || described.code === "unknown",
          action,
        };
      };

      const setAnalysis = (analysis: MatchAnalysis | null, cached: boolean, stale: boolean | null) => {
        const { ctx, session } = get();
        set({ analysis, analysisCached: cached, analysisStale: stale });
        if (ctx && session && analysis) {
          // Keep the user's unchecked skills unchecked across re-analysis.
          const unchecked = new Set(
            session.skillCandidates.filter((c) => !c.selected).map((c) => c.skill.toLowerCase()),
          );
          const candidates = buildSkillCandidates(session.originalMd, ctx.job, analysis).map((c) => ({
            ...c,
            selected: !unchecked.has(c.skill.toLowerCase()),
          }));
          patchSession({ skillCandidates: candidates });
        }
      };

      return {
        session: null,
        savedCvIds: {},
        savedHashes: {},
        ctx: null,
        status: { kind: "idle" },
        streamText: "",
        analysis: null,
        analysisCached: false,
        analysisStale: null,
        isLoadingAnalysis: false,
        isSaving: false,

        startSession: (cv, job) => {
          const key = sessionKey(cv.id, job.id);
          const current = get().session;
          const sameContext = get().ctx?.cv.id === cv.id && get().ctx?.job.id === job.id;
          if (current?.key === key) {
            // Resume (e.g. after navigating back or a restart). Refresh the live objects.
            set({ ctx: { cv, job } });
            if (!sameContext) {
              set({
                status: current.review ? { kind: "review" } : { kind: "idle" },
                analysis: null,
                analysisCached: false,
                analysisStale: null,
              });
            }
            // In flight but no live run → the app was closed mid-generation.
            if (current.generationInFlight && !activeRun) {
              patchSession({ generationInFlight: false, interrupted: true });
            }
            return;
          }

          activeRun?.controller.abort();
          activeRun = null;
          const originalMd = formatCvAsMarkdown(cv.parsed_data);
          set({
            ctx: { cv, job },
            status: { kind: "idle" },
            streamText: "",
            analysis: null,
            analysisCached: false,
            analysisStale: null,
            session: {
              key,
              cvId: cv.id,
              jobId: job.id,
              originalMd,
              sourceLanguage: detectLanguage(originalMd),
              outputLanguage: detectOutputLanguage(job),
              languageOverridden: false,
              skillCandidates: buildSkillCandidates(originalMd, job, null),
              proposalMd: null,
              review: null,
              chat: [],
              allowedFigures: [],
              acknowledgedClaims: [],
              truncated: false,
              generatedId: null,
              llmProvider: "",
              llmModel: "",
              generationInFlight: false,
              interrupted: false,
            },
          });
        },

        discardSession: () => {
          activeRun?.controller.abort();
          activeRun = null;
          set({
            session: null,
            ctx: null,
            status: { kind: "idle" },
            streamText: "",
            analysis: null,
            analysisCached: false,
            analysisStale: null,
          });
        },

        loadCachedAnalysis: async () => {
          const ctx = get().ctx;
          if (!ctx) return;
          set({ isLoadingAnalysis: true });
          try {
            const cached = await getCachedMatchAnalysis(ctx.cv.id, ctx.job.id);
            if (get().ctx !== ctx) return;
            if (cached) setAnalysis(cached.analysis, true, cached.stale);
          } catch (err) {
            console.warn("[cvOptimization] cached analysis unavailable:", err);
          } finally {
            if (get().ctx === ctx) set({ isLoadingAnalysis: false });
          }
        },

        runAnalysis: async (force = false) => {
          const ctx = get().ctx;
          if (!ctx) return null;
          const run = startRun("analyze");
          const previous = get().status;
          set({ status: { kind: "analyzing", startedAt: Date.now() } });
          try {
            const result = await getOrRunMatchAnalysis(ctx.cv.id, ctx.job.id, {
              force,
              signal: run.signal,
            });
            if (!isCurrentRun(run.id)) return null;
            setAnalysis(result.analysis, result.cached, result.stale);
            set({ status: get().session?.review ? { kind: "review" } : { kind: "idle" } });
            return result.analysis;
          } catch (err) {
            if (!isCurrentRun(run.id)) return null;
            if (isCancelledError(err)) {
              set({ status: previous.kind === "analyzing" ? { kind: "idle" } : previous });
              return null;
            }
            set({ status: errorStatus(err, "analyze") });
            return null;
          } finally {
            endRun(run.id);
          }
        },

        generate: async () => {
          const { ctx } = get();
          const session = get().session;
          if (!ctx || !session) return;
          const run = startRun("generate");
          const hadReview = Boolean(session.review);
          patchSession({ generationInFlight: true, interrupted: false });

          try {
            set({ status: { kind: "analyzing", startedAt: Date.now() } });
            const config = await getActiveLlmConfig();
            if (!isCurrentRun(run.id)) return;
            if (!config) throw new GuardError("no_provider", "No LLM provider configured");

            // Analysis first when missing or stale — it feeds the skills to add. A failing
            // analysis must not block generation: fall back to the stale one (or none).
            let analysis = get().analysis;
            if (!analysis || get().analysisStale) {
              try {
                const result = await getOrRunMatchAnalysis(ctx.cv.id, ctx.job.id, {
                  force: Boolean(analysis && get().analysisStale),
                  signal: run.signal,
                });
                if (!isCurrentRun(run.id)) return;
                setAnalysis(result.analysis, result.cached, result.stale);
                analysis = result.analysis;
              } catch (err) {
                if (isCancelledError(err)) throw err;
                if (!isCurrentRun(run.id)) return;
                console.warn("[cvOptimization] match analysis failed; generating without it:", err);
              }
            }

            const s = get().session!;
            const startedAt = Date.now();
            set({
              streamText: "",
              status: {
                kind: "generating",
                phase: "connecting",
                chars: 0,
                reasoningChars: 0,
                section: null,
                startedAt,
              },
            });

            const input: CvOptimizationInput = {
              candidateName: ctx.cv.parsed_data.full_name || ctx.cv.name,
              sourceMarkdown: s.originalMd,
              job: ctx.job,
              analysis,
              outputLanguage: s.outputLanguage,
              sourceLanguage: s.sourceLanguage,
              skillsToAdd: s.skillCandidates
                .filter((c) => c.selected)
                .map(({ skill, importance }) => ({ skill, importance })),
              skillsToAvoid: s.skillCandidates.filter((c) => !c.selected).map((c) => c.skill),
              experienceYears: computeExperienceYears(ctx.cv.parsed_data),
              sourceCv: ctx.cv.parsed_data,
              market: marketContext(ctx.job),
            };

            let content = "";
            let reasoningChars = 0;
            let finishReason: string | null = null;
            let lastFlush = 0;
            const baseline = Math.max(s.originalMd.length, 2000);
            const flush = (force = false) => {
              const now = Date.now();
              if (!force && now - lastFlush < STREAM_FLUSH_MS) return;
              lastFlush = now;
              set({
                streamText: content,
                status: {
                  kind: "generating",
                  phase: content ? "writing" : reasoningChars > 0 ? "thinking" : "connecting",
                  chars: content.length,
                  reasoningChars,
                  section: currentSection(content),
                  startedAt,
                },
              });
            };

            const service = new LlmService(config);
            for await (const ev of service.streamCvOptimization(input, run.signal)) {
              if (!isCurrentRun(run.id)) return;
              if (ev.type === "reasoning") {
                reasoningChars += ev.chars;
                flush();
              } else if (ev.type === "text") {
                content += ev.text;
                const violation = findPlaceholderViolation(content);
                if (violation) {
                  throw new GuardError("placeholder", violation);
                }
                if (isRunaway(content, baseline)) {
                  throw new GuardError("runaway", `${content.length} chars`);
                }
                flush();
              } else if (ev.type === "finish") {
                finishReason = ev.finishReason;
              }
            }
            if (!isCurrentRun(run.id)) return;
            flush(true);

            const proposal = applyMarketGuard(normalizeCvMarkdown(content), ctx.job).trim();
            if (!proposal) {
              throw new GuardError(
                "empty_output",
                reasoningChars > 0 ? "reasoning_budget" : "no_text",
              );
            }

            const reviewState = createReviewState(s.originalMd, proposal + "\n");
            const latest = get().session!;
            patchSession({
              proposalMd: proposal + "\n",
              review: latest.review ? historyPush(latest.review, reviewState) : historyInit(reviewState),
              truncated: finishReason === "length",
              generatedId: ulid(),
              llmProvider: config.provider,
              llmModel: config.model,
              chat: [],
              acknowledgedClaims: [],
              generationInFlight: false,
            });
            set({ status: { kind: "review" }, streamText: "" });
          } catch (err) {
            if (!isCurrentRun(run.id)) return;
            patchSession({ generationInFlight: false });
            if (isCancelledError(err)) {
              set({ status: hadReview ? { kind: "review" } : { kind: "idle" }, streamText: "" });
              return;
            }
            console.error("[cvOptimization] generation failed:", err);
            set({ status: errorStatus(err, "generate") });
          } finally {
            endRun(run.id);
          }
        },

        refine: async (message) => {
          const { ctx } = get();
          const session = get().session;
          if (!ctx || !session?.review) return false;
          const text = message.trim();
          if (!text) return false;
          lastRefineMessage = text;

          const run = startRun("refine");
          const previousChat = session.chat;
          const current = composeFinal(session.review.present);
          patchSession({ chat: [...previousChat, { role: "user", content: text }] });
          const startedAt = Date.now();
          set({ status: { kind: "refining", sections: [], startedAt } });

          try {
            const config = await getActiveLlmConfig();
            if (!isCurrentRun(run.id)) return false;
            if (!config) throw new GuardError("no_provider", "No LLM provider configured");

            const rows = session.review.present.rows;
            const input = {
              candidateName: ctx.cv.parsed_data.full_name || ctx.cv.name,
              sourceMarkdown: session.originalMd,
              job: ctx.job,
              outputLanguage: session.outputLanguage,
              sourceLanguage: session.sourceLanguage,
              skillsToAdd: session.skillCandidates
                .filter((c) => c.selected)
                .map(({ skill, importance }) => ({ skill, importance })),
              skillsToAvoid: session.skillCandidates.filter((c) => !c.selected).map((c) => c.skill),
              experienceYears: computeExperienceYears(ctx.cv.parsed_data),
              market: marketContext(ctx.job),
              currentDraft: current,
              patchableHeadings: parseCvSections(current, "p")
                .nodes.map((n) => n.heading)
                .filter(Boolean),
              history: previousChat,
              userMessage: text,
              revertedSections: rows
                .filter((r) => r.status === "original")
                .map((r) => headingText(r.originalHeading ?? r.proposedHeading))
                .filter(Boolean),
              editedSections: rows
                .filter((r) => r.status === "edited")
                .map((r) => headingText(r.headingOverride ?? r.proposedHeading ?? r.originalHeading))
                .filter(Boolean),
            };

            let content = "";
            let lastFlush = 0;
            const baseline = Math.max(current.length, 2000);
            const service = new LlmService(config);
            for await (const ev of service.streamCvOptimizationChat(input, run.signal)) {
              if (!isCurrentRun(run.id)) return false;
              if (ev.type !== "text") continue;
              content += ev.text;
              const violation = findPlaceholderViolation(stripNotesBlock(content));
              if (violation) throw new GuardError("placeholder", violation);
              if (isRunaway(content, baseline)) throw new GuardError("runaway", `${content.length} chars`);
              const now = Date.now();
              if (now - lastFlush >= STREAM_FLUSH_MS) {
                lastFlush = now;
                set({
                  status: {
                    kind: "refining",
                    sections: extractPatchSectionsDuringStream(content),
                    startedAt,
                  },
                });
              }
            }
            if (!isCurrentRun(run.id)) return false;

            const parsed = splitNotesAndCv(content);
            let draft: string | null = null;
            let notes = parsed.notes || "";
            if (parsed.patches.length > 0) {
              const { cv: patched, missing } = applyPatches(current, parsed.patches);
              draft = patched;
              if (missing.length > 0) {
                notes = `${notes}${notes ? "\n\n" : ""}⚠ ${missing.join(", ")}`;
              }
            } else if (parsed.cv.trim()) {
              draft = normalizeCvMarkdown(parsed.cv);
            }
            if (!notes && !draft) {
              throw new GuardError("empty_output", "no_text");
            }

            const latest = get().session!;
            const nextReview =
              draft && latest.review
                ? historyPush(
                    latest.review,
                    reviewReducer(latest.review.present, { type: "mergeRefined", draftMd: draft }, latest.originalMd),
                  )
                : latest.review;
            patchSession({
              review: nextReview,
              chat: [...latest.chat, { role: "assistant", content: notes || "Done." }],
            });
            set({ status: { kind: "review" } });
            return true;
          } catch (err) {
            if (!isCurrentRun(run.id)) return false;
            // Roll back the optimistic user turn; the chat panel restores the draft.
            patchSession({ chat: previousChat });
            if (isCancelledError(err)) {
              set({ status: { kind: "review" } });
              return false;
            }
            console.error("[cvOptimization] refinement failed:", err);
            set({ status: errorStatus(err, "refine") });
            return false;
          } finally {
            endRun(run.id);
          }
        },

        cancel: () => {
          activeRun?.controller.abort();
          // The run's own catch restores the previous status; this covers a run that is
          // stuck before its first event (the abort surfaces on the next await).
        },

        retry: () => {
          const status = get().status;
          if (status.kind !== "error") return;
          if (status.action === "analyze") void get().runAnalysis(true);
          else if (status.action === "generate") void get().generate();
          else if (status.action === "refine" && lastRefineMessage) void get().refine(lastRefineMessage);
        },

        dismissError: () => {
          set({ status: get().session?.review ? { kind: "review" } : { kind: "idle" } });
        },

        setOutputLanguage: (lang) => patchSession({ outputLanguage: lang, languageOverridden: true }),

        toggleSkill: (skill) => {
          const session = get().session;
          if (!session) return;
          patchSession({
            skillCandidates: session.skillCandidates.map((c) =>
              c.skill === skill ? { ...c, selected: !c.selected } : c,
            ),
          });
        },

        dispatchReview: (action) => {
          const session = get().session;
          if (!session?.review) return;
          const present = session.review.present;
          const next = reviewReducer(present, action, session.originalMd);
          if (next === present) return;

          // Figures the user types themselves are facts, not inventions. Stored as written
          // ("$2M"): findUnsupportedFigures re-parses allowed figures.
          let allowedFigures = session.allowedFigures;
          const userText =
            action.type === "edit" ? action.text : action.type === "applyFullMarkdown" ? action.md : null;
          if (userText !== null) {
            const row = action.type === "edit" ? present.rows.find((r) => r.id === action.id) : null;
            const previous =
              action.type === "edit" ? (row ? rowFinalBody(row) ?? "" : "") : composeFinal(present);
            const before = new Set(extractFigures(previous));
            const typed = extractFigureMatches(userText)
              .filter((f) => !before.has(f.canonical))
              .map((f) => f.raw);
            if (typed.length > 0) allowedFigures = [...new Set([...allowedFigures, ...typed])];
          }
          patchSession({ review: historyPush(session.review, next), allowedFigures });
        },

        undo: () => {
          const session = get().session;
          if (!session?.review || session.review.past.length === 0) return;
          patchSession({ review: historyUndo(session.review) });
        },

        redo: () => {
          const session = get().session;
          if (!session?.review || session.review.future.length === 0) return;
          patchSession({ review: historyRedo(session.review) });
        },

        acknowledgeClaim: (skill) => {
          const session = get().session;
          if (!session || session.acknowledgedClaims.includes(skill)) return;
          patchSession({ acknowledgedClaims: [...session.acknowledgedClaims, skill] });
        },

        allowFigure: (figure) => {
          const session = get().session;
          if (!session || session.allowedFigures.includes(figure)) return;
          patchSession({ allowedFigures: [...session.allowedFigures, figure] });
        },

        save: async ({ name, asNew, scoreBefore, scoreAfter, defaultNamePrefix }) => {
          const { ctx, session } = get();
          if (!ctx || !session?.review) return null;
          const markdown = applyMarketGuard(composeFinal(session.review.present), ctx.job);
          set({ isSaving: true });
          try {
            const generatedId = session.generatedId ?? ulid();
            const generated: GeneratedCv = {
              id: generatedId,
              cv_id: ctx.cv.id,
              job_id: ctx.job.id,
              content: markdown,
              match_score_before: scoreBefore,
              match_score_after: scoreAfter,
              llm_provider: session.llmProvider,
              llm_model: session.llmModel,
              created_at: Date.now(),
            };
            const result = await saveTailoredCv({
              existingCvId: asNew ? null : get().savedCvIds[session.key] ?? null,
              name,
              markdown,
              sourceCv: ctx.cv,
              job: ctx.job,
              generated,
              llm: await getActiveLlmConfig().catch(() => null),
              defaultNamePrefix,
            });
            set((s) => ({
              savedCvIds: { ...s.savedCvIds, [session.key]: result.cvId },
              savedHashes: { ...s.savedHashes, [session.key]: fnv1a(markdown) },
            }));
            patchSession({ generatedId });
            await useCvStore.getState().fetchCvs();
            return result;
          } finally {
            set({ isSaving: false });
          }
        },
      };
    },
    {
      name: "cv-opt-session-v1",
      version: 1,
      storage: createJSONStorage(() => debouncedLocalStorage(400)),
      partialize: (state) => ({
        savedCvIds: state.savedCvIds,
        savedHashes: state.savedHashes,
        session: state.session
          ? {
              ...state.session,
              review: state.session.review
                ? {
                    ...state.session.review,
                    past: state.session.review.past.slice(-PERSISTED_HISTORY_CAP),
                    future: state.session.review.future.slice(0, PERSISTED_HISTORY_CAP),
                  }
                : null,
            }
          : null,
      }),
    },
  ),
);

/** True when the current final CV differs from what was last saved for this CV+job. */
export function hasUnsavedChanges(state: Pick<CvOptimizationState, "session" | "savedHashes">): boolean {
  const session = state.session;
  if (!session?.review) return false;
  const saved = state.savedHashes[session.key];
  return !saved || saved !== fnv1a(composeFinal(session.review.present));
}
