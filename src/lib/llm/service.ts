import { generateText, streamText } from "ai";
import type { FinishReason, LanguageModelUsage } from "ai";
import { llmRegistry } from "./registry";
import * as prompts from "./prompts";
import * as schemas from "./schemas";
import {
  buildCvOptimizationPrompt,
  buildCvOptimizationChatPrompt,
  type CvOptimizationInput,
  type CvOptimizationChatInput,
  type PromptPair,
} from "./cv-optimization-prompts";
import {
  pastedJobExtractionSchema,
  buildPastedJobExtractionPrompt,
  type PastedJobExtraction,
} from "./job-extraction";
import { CancelledError, LlmRequestError, describeLlmError } from "./errors";
import { generateValidated } from "./structured";
import { groundSkillMatches } from "./match-grounding";
import { canTailorBySection, streamSectionedTailoring } from "./cv-tailor-sectioned";
import { taskCallSettings, type LlmTask } from "./task-profile";
import type { z } from "zod";
import {
  buildGapBriefPrompt,
  buildMessageDraftPrompt,
  buildMockReportPrompt,
  buildMockTurnPrompt,
  buildQuickPlanPrompt,
  buildRoundPackPrompt,
  type QuickPlanInput,
  type MessageDraftInput,
  type MockTurnInput,
  type RoundPackInput,
} from "./prep-prompts";
import {
  gapBriefSchema,
  messageDraftSchema,
  mockReportSchema,
  mockTurnSchema,
  quickPlanSchema,
  roundPackSchema,
  type GapBrief,
  type MessageDraft,
  type MockReport,
  type MockTurnResult,
  type QuickPlan,
  type RoundPack,
} from "./prep-schemas";
import type { MaterialLanguage } from "./language";
import { parseCvWithLlm, type CvParseProgress } from "@/lib/cv/llm-parse";
import type { LlmProviderConfig } from "./providers/base";
import type {
  ParsedCv,
  CvLayoutLine,
  Job,
  MatchAnalysis,
  NarrativeReport,
  StarStory,
  StrengthEntry,
  WeaknessEntry,
  PitchVariant,
} from "@/types";

/**
 * Output-token budget for the streaming CV-optimization calls.
 *
 * This MUST be generous: for reasoning models (Gemini, Grok, o-series, Claude with
 * thinking) the reasoning tokens are drawn from the same `maxOutputTokens` budget as
 * the visible text. A tight cap (the old 4096) let reasoning consume the entire budget,
 * so the text stream came back empty and the CV rendered as blank blocks. A real CV is
 * only ~1-2k tokens of visible text — the rest of this budget is headroom for reasoning.
 *
 * Runaway/looping output is bounded separately by `isRunaway` + `findPlaceholderViolation`
 * in cv-output-guard.ts, so this cap is not our runaway protection.
 */
const CV_STREAM_MAX_OUTPUT_TOKENS = 32000;

/** Same reasoning-budget concern as above, for the structured interview-prep calls. */
const PREP_MAX_OUTPUT_TOKENS = 16000;

/**
 * Events from the CV optimization streams. `reasoning` lets the UI show "thinking…"
 * while a reasoning model hasn't produced visible text yet.
 */
export type CvStreamEvent =
  | { type: "reasoning"; chars: number }
  | { type: "text"; text: string }
  | { type: "finish"; finishReason: FinishReason; usage: LanguageModelUsage };

export class LlmService {
  private config: LlmProviderConfig;

  constructor(config: LlmProviderConfig) {
    this.config = config;
  }

  private get model() {
    return llmRegistry.createModel(this.config);
  }

  /** Sampling settings for a task on the active provider (only Ollama gets any). */
  private settings(task: LlmTask) {
    return taskCallSettings(this.config.provider, task);
  }

  /**
   * Structured call with JSON repair, semantic validation and corrective retries
   * (see structured.ts). Returns the same `{ object }` shape as generateObject.
   */
  private async object<S extends z.ZodType>(
    task: LlmTask,
    opts: {
      schema: S;
      schemaName?: string;
      schemaDescription?: string;
      system?: string;
      prompt: string;
      maxOutputTokens?: number;
      abortSignal?: AbortSignal;
      validate?: (value: z.infer<S>) => string[];
    },
  ): Promise<{ object: z.infer<S> }> {
    const object = await generateValidated({
      model: this.model,
      ...opts,
      settings: this.settings(task),
      schemaInPrompt: this.config.provider === "ollama",
    });
    return { object };
  }

  // -------------------------------------------------------------------------
  // CV-Job Match Analysis
  // -------------------------------------------------------------------------
  async analyzeCvMatch(cv: ParsedCv, job: Job, abortSignal?: AbortSignal): Promise<MatchAnalysis> {
    const result = await this.object("extract", {
      schema: schemas.matchAnalysisSchema,
      schemaName: "MatchAnalysis",
      schemaDescription:
        "Structured match analysis between a candidate CV and a job description.",
      ...prompts.buildMatchPrompt(cv, job),
      abortSignal,
    });
    return groundSkillMatches(result.object as MatchAnalysis, cv);
  }

  // -------------------------------------------------------------------------
  // CV Narrative Report
  // -------------------------------------------------------------------------
  async analyzeNarrative(
    cv: ParsedCv,
    job?: Job
  ): Promise<NarrativeReport> {
    const result = await this.object("extract", {
      schema: schemas.narrativeReportSchema,
      schemaName: "NarrativeReport",
      schemaDescription:
        "Structured feedback report on the quality of a candidate CV.",
      ...prompts.buildNarrativePrompt(cv, job),
    });
    return result.object as NarrativeReport;
  }

  // -------------------------------------------------------------------------
  // CV Optimization / chat refinement (streaming)
  // -------------------------------------------------------------------------
  streamCvOptimization(
    input: CvOptimizationInput,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<CvStreamEvent> {
    // Local models tailor section by section: code keeps the structure and each small
    // rewrite is validated (see cv-tailor-sectioned.ts). Cloud models handle the
    // whole CV in one pass well, which reads more coherently.
    const sourceCv = input.sourceCv;
    if (this.config.provider === "ollama" && canTailorBySection(sourceCv)) {
      return streamSectionedTailoring(
        { ...input, sourceCv },
        {
          generate: async (opts) => (await this.object("rewrite", opts)).object,
          abortSignal,
          onFallback: (what, problems) =>
            console.warn(`[cvOptimization] ${what} kept the source text:`, problems),
        },
      );
    }
    return this.streamCvEvents("cvOptimization", buildCvOptimizationPrompt(input), abortSignal);
  }

  streamCvOptimizationChat(
    input: CvOptimizationChatInput,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<CvStreamEvent> {
    return this.streamCvEvents("cvOptimizationChat", buildCvOptimizationChatPrompt(input), abortSignal);
  }

  /**
   * Iterates `fullStream` (not `textStream`, which silently drops provider errors) and
   * turns it into CvStreamEvents. Provider failures throw LlmRequestError with a
   * classified code; an abort throws CancelledError.
   */
  private async *streamCvEvents(
    label: string,
    pair: PromptPair,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<CvStreamEvent> {
    const result = streamText({
      model: this.model,
      ...this.settings("rewrite"),
      system: pair.system,
      prompt: pair.prompt,
      // Only Ollama gets sampling settings: cloud reasoning models reject or ignore temperature.
      maxOutputTokens: CV_STREAM_MAX_OUTPUT_TOKENS,
      abortSignal,
    });
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "reasoning-delta":
          yield { type: "reasoning", chars: part.text.length };
          break;
        case "text-delta":
          yield { type: "text", text: part.text };
          break;
        case "error":
          throw new LlmRequestError(describeLlmError(part.error), part.error);
        case "abort":
          throw new CancelledError();
        case "finish":
          // A `length` finish or a large reasoning-token count is the fingerprint of the
          // reasoning-model budget-starvation problem.
          console.info(`[${label}] finishReason=%s usage=%o`, part.finishReason, part.totalUsage);
          yield { type: "finish", finishReason: part.finishReason, usage: part.totalUsage };
          break;
        default:
          break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Cover Letter (streaming)
  // -------------------------------------------------------------------------
  async *generateCoverLetter(
    cv: ParsedCv,
    job: Job
  ): AsyncGenerator<string> {
    const result = streamText({
      model: this.model,
      ...this.settings("rewrite"),
      ...prompts.buildCoverLetterPrompt(cv, job),
    });
    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }

  // -------------------------------------------------------------------------
  // Cover Letter (structured)
  // -------------------------------------------------------------------------
  async generateCoverLetterStructured(
    cv: ParsedCv,
    job: Job
  ): Promise<{
    subject_line: string;
    greeting: string;
    opening_paragraph: string;
    body_paragraphs: string[];
    closing_paragraph: string;
    sign_off: string;
  }> {
    const result = await this.object("rewrite", {
      schema: schemas.coverLetterSchema,
      ...prompts.buildCoverLetterPrompt(cv, job),
    });
    return result.object;
  }

  // -------------------------------------------------------------------------
  // Personal Pitch
  // -------------------------------------------------------------------------
  async generatePitch(
    cv: ParsedCv,
    variant: PitchVariant
  ): Promise<{ pitch: string; key_points: string[]; tips: string[] }> {
    const result = await this.object("rewrite", {
      schema: schemas.pitchSchema,
      ...prompts.buildPitchPrompt(cv, variant),
    });
    return result.object;
  }

  // -------------------------------------------------------------------------
  // STAR Stories
  // -------------------------------------------------------------------------
  async generateStarStories(
    cv: ParsedCv,
    experienceIndex: number
  ): Promise<
    Array<
      Pick<
        StarStory,
        "title" | "situation" | "task" | "action" | "result" | "skills_demonstrated"
      >
    >
  > {
    const result = await this.object("rewrite", {
      schema: schemas.starStorySchema,
      ...prompts.buildStarStoriesPrompt(cv, experienceIndex),
    });
    return result.object.stories;
  }

  // -------------------------------------------------------------------------
  // Strengths and Weaknesses
  // -------------------------------------------------------------------------
  async generateStrengthsWeaknesses(
    cv: ParsedCv,
    job: Job
  ): Promise<{
    strengths: StrengthEntry[];
    weaknesses: WeaknessEntry[];
  }> {
    const result = await this.object("rewrite", {
      schema: schemas.strengthsWeaknessesSchema,
      ...prompts.buildStrengthsWeaknessesPrompt(cv, job),
    });
    return result.object;
  }

  // -------------------------------------------------------------------------
  // Company-Specific Interview Questions
  // -------------------------------------------------------------------------
  async generateCompanyQuestions(
    companyName: string,
    reviews: Array<{ text: string; rating?: number; source?: string }>,
    job: Job
  ): Promise<
    Array<{ category: string; question: string; rationale: string }>
  > {
    const result = await this.object("rewrite", {
      schema: schemas.companyQuestionsSchema,
      prompt: prompts.buildCompanyQuestionsPrompt(
        companyName,
        reviews,
        job
      ),
    });
    return result.object.questions;
  }

  // -------------------------------------------------------------------------
  // Company Research Brief (structured)
  // -------------------------------------------------------------------------
  async generateCompanyBrief(
    companyName: string,
    reviews: Array<{ text: string; rating?: number; source?: string }>,
    job: Job
  ): Promise<{
    overview: string;
    culture_values: string[];
    interview_process: string;
    pros: string[];
    cons: string[];
    talking_points: string[];
    questions_to_ask: string[];
  }> {
    const result = await this.object("rewrite", {
      schema: schemas.companyBriefSchema,
      prompt: prompts.buildCompanyBriefPrompt(companyName, reviews, job),
    });
    return result.object;
  }

  // -------------------------------------------------------------------------
  // Company Research Brief (streaming text)
  // -------------------------------------------------------------------------
  async *generateCompanyBriefStream(
    companyName: string,
    reviews: Array<{ text: string; rating?: number; source?: string }>,
    job: Job
  ): AsyncGenerator<string> {
    const result = streamText({
      model: this.model,
      ...this.settings("rewrite"),
      prompt: prompts.buildCompanyBriefPrompt(companyName, reviews, job),
    });
    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }

  // -------------------------------------------------------------------------
  // Interview Study Material (structured)
  // -------------------------------------------------------------------------
  async generateStudyMaterial(
    companyName: string,
    role: string,
    reviews: Array<{ text: string; rating?: number; source?: string }>
  ): Promise<{
    role_overview: string;
    technical_topics: Array<{
      topic: string;
      importance: "must_know" | "should_know" | "nice_to_know";
      study_points: string[];
      sample_question: string;
    }>;
    behavioral_scenarios: Array<{
      scenario: string;
      preparation_tip: string;
    }>;
    day_of_tips: string[];
  }> {
    const result = await this.object("rewrite", {
      schema: schemas.studyMaterialSchema,
      prompt: prompts.buildStudyMaterialPrompt(companyName, role, reviews),
    });
    return result.object;
  }

  // -------------------------------------------------------------------------
  // Interview Study Material (streaming text)
  // -------------------------------------------------------------------------
  async *generateStudyMaterialStream(
    companyName: string,
    role: string,
    reviews: Array<{ text: string; rating?: number; source?: string }>
  ): AsyncGenerator<string> {
    const result = streamText({
      model: this.model,
      ...this.settings("rewrite"),
      prompt: prompts.buildStudyMaterialPrompt(companyName, role, reviews),
    });
    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }

  // -------------------------------------------------------------------------
  // CV Parsing Refinement
  // -------------------------------------------------------------------------
  async refineCvParsing(
    rawText: string,
    heuristicResult: ParsedCv,
    options: {
      layout?: CvLayoutLine[] | null;
      onProgress?: (progress: CvParseProgress) => void;
      abortSignal?: AbortSignal;
    } = {},
  ): Promise<ParsedCv> {
    const { parsed, warnings } = await parseCvWithLlm(
      { rawText, layout: options.layout, heuristic: heuristicResult },
      {
        generate: async (opts) => (await this.object("extract", opts)).object,
        // One local GPU serves one request at a time; cloud APIs handle a few in parallel.
        concurrency: this.config.provider === "ollama" ? 1 : 4,
        onProgress: options.onProgress,
        abortSignal: options.abortSignal,
      },
    );
    if (warnings.length > 0) console.warn("[refineCvParsing]", warnings);
    return parsed;
  }

  // -------------------------------------------------------------------------
  // CV Parsing — Chat Refinement
  // -------------------------------------------------------------------------
  async chatRefineParsedCv(
    rawText: string,
    current: ParsedCv,
    history: prompts.CvChatTurn[],
    userMessage: string,
  ): Promise<ParsedCv> {
    const pair = prompts.buildCvParsingChatRefinementPrompt(rawText, current, history, userMessage);
    const result = await this.object("extract", {
      schema: schemas.cvRefinementSchema,
      schemaName: "ParsedCv",
      system: pair.system,
      prompt: pair.prompt,
    });
    return result.object as ParsedCv;
  }

  // -------------------------------------------------------------------------
  // Interview prep grounded in CV + job post (see prep-prompts.ts)
  // -------------------------------------------------------------------------
  private async structured<S extends z.ZodType>(
    schema: S,
    schemaName: string,
    pair: PromptPair,
    abortSignal?: AbortSignal,
    task: LlmTask = "rewrite",
  ): Promise<z.infer<S>> {
    try {
      const result = await this.object(task, {
        schema,
        schemaName,
        system: pair.system,
        prompt: pair.prompt,
        maxOutputTokens: PREP_MAX_OUTPUT_TOKENS,
        abortSignal,
      });
      return result.object as z.infer<S>;
    } catch (err) {
      if (abortSignal?.aborted) throw new CancelledError();
      throw err;
    }
  }

  generateGapBrief(
    input: { cv: ParsedCv; job: Job; language: MaterialLanguage },
    abortSignal?: AbortSignal,
  ): Promise<GapBrief> {
    return this.structured(gapBriefSchema, "FitAnalysis", buildGapBriefPrompt(input), abortSignal);
  }

  generateRoundPack(input: RoundPackInput, abortSignal?: AbortSignal): Promise<RoundPack> {
    return this.structured(roundPackSchema, "RoundPrepPack", buildRoundPackPrompt(input), abortSignal);
  }

  mockTurn(input: MockTurnInput, abortSignal?: AbortSignal): Promise<MockTurnResult> {
    return this.structured(mockTurnSchema, "MockInterviewTurn", buildMockTurnPrompt(input), abortSignal, "chat");
  }

  mockReport(
    input: Parameters<typeof buildMockReportPrompt>[0],
    abortSignal?: AbortSignal,
  ): Promise<MockReport> {
    return this.structured(mockReportSchema, "MockInterviewReport", buildMockReportPrompt(input), abortSignal);
  }

  generateQuickPlan(input: QuickPlanInput, abortSignal?: AbortSignal): Promise<QuickPlan> {
    return this.structured(quickPlanSchema, "QuickStudyPlan", buildQuickPlanPrompt(input), abortSignal);
  }

  draftMessage(input: MessageDraftInput, abortSignal?: AbortSignal): Promise<MessageDraft> {
    return this.structured(messageDraftSchema, "MessageDraft", buildMessageDraftPrompt(input), abortSignal);
  }

  // -------------------------------------------------------------------------
  // Pasted job post → structured fields
  // -------------------------------------------------------------------------
  async extractJobPosting(text: string, abortSignal?: AbortSignal): Promise<PastedJobExtraction> {
    const result = await this.object("extract", {
      schema: pastedJobExtractionSchema,
      schemaName: "JobPosting",
      schemaDescription: "Structured fields extracted from a pasted job post.",
      prompt: buildPastedJobExtractionPrompt(text),
      abortSignal,
    });
    return result.object as PastedJobExtraction;
  }

  // -------------------------------------------------------------------------
  // Generic text generation (for custom prompts)
  // -------------------------------------------------------------------------
  async generateText(prompt: string): Promise<string> {
    const result = await generateText({
      model: this.model,
      prompt,
    });
    return result.text;
  }

  // -------------------------------------------------------------------------
  // Generic streaming text generation
  // -------------------------------------------------------------------------
  async *streamText(prompt: string): AsyncGenerator<string> {
    const result = streamText({
      model: this.model,
      ...this.settings("rewrite"),
      prompt,
    });
    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }

  // -------------------------------------------------------------------------
  // DR/LATAM eligibility adjudication (batched)
  // Only used for jobs the cheap keyword classifier left "ambiguous", so LLM
  // cost stays bounded. Resolves each to explicit_latam | global_remote | restricted.
  // -------------------------------------------------------------------------
  async classifyDrEligibility(
    jobs: prompts.DrEligibilityJobInput[],
  ): Promise<
    Array<{
      id: string;
      eligibility: "explicit_latam" | "global_remote" | "restricted";
      reason: string;
    }>
  > {
    const result = await this.object("extract", {
      schema: schemas.drEligibilitySchema,
      schemaName: "DrEligibility",
      schemaDescription: "Per-job DR/LATAM work-eligibility classification.",
      prompt: prompts.buildDrEligibilityPrompt(jobs),
    });
    return result.object.results;
  }
}

/**
 * Factory function to create an LlmService instance from a provider configuration.
 */
export function createLlmService(config: LlmProviderConfig): LlmService {
  return new LlmService(config);
}
