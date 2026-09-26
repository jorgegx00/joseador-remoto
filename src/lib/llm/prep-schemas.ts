import { z } from "zod";

// ---------------------------------------------------------------------------
// Interview-prep outputs grounded in CV + job post. Every claim about the candidate
// must point at CV evidence; missing facts become `needs_input` questions.
// ---------------------------------------------------------------------------

const needsInput = z
  .array(
    z.object({
      question: z.string().describe("Short question to the candidate for a fact the CV lacks (a metric, scope, outcome)"),
      why: z.string().describe("Which answer or requirement this fact would strengthen"),
    }),
  )
  .describe("Facts to ask the candidate instead of inventing them. Empty when nothing is missing.");

export const gapBriefSchema = z.object({
  headline: z.string().describe("One or two honest sentences on overall fit, naming the biggest strength and biggest gap"),
  requirements: z
    .array(
      z.object({
        requirement: z.string().describe("A requirement from the job post, in few words"),
        priority: z.enum(["must", "nice"]).describe("must = required/essential in the post; nice = preferred/bonus"),
        fit: z.enum(["strong", "partial", "missing"]),
        cv_evidence: z
          .string()
          .describe("The CV fact (role + what they did) that supports it, close to the CV's wording. Empty string when missing."),
        how_to_address: z
          .string()
          .describe("One concrete sentence: how to present the evidence, or how to frame adjacent experience / a learning plan for a gap"),
      }),
    )
    .describe("8–14 most important requirements, must-haves first"),
  talking_points: z
    .array(z.string())
    .describe("3–5 strongest selling points for THIS role, each tied to a specific CV fact"),
  remote_notes: z
    .array(z.string())
    .describe("Things to clarify for a remote hire: timezone overlap, country eligibility, contractor vs employee/EOR, currency. Only what the post leaves open or states."),
  needs_input: needsInput,
});
export type GapBrief = z.infer<typeof gapBriefSchema>;

export const roundPackSchema = z.object({
  focus: z.string().describe("2–3 sentences: what this round is most likely assessing for this role, based on the job post"),
  likely_questions: z
    .array(
      z.object({
        question: z.string(),
        why_asked: z.string().describe("The job-post requirement or signal behind it"),
        answer_outline: z
          .array(z.string())
          .describe("2–4 bullet points for the candidate's answer, built only from CV facts"),
        story: z
          .string()
          .describe("Title of the candidate's STAR story or CV experience to use; empty string when none fits"),
      }),
    )
    .describe("6–10 questions, most likely first"),
  questions_to_ask: z
    .array(z.object({ question: z.string(), why: z.string() }))
    .describe("4–6 specific questions for the candidate to ask the interviewer in this round"),
  study_plan: z
    .array(
      z.object({
        day: z.number().int().min(1),
        topic: z.string(),
        tasks: z.array(z.string()).describe("2–4 concrete, time-boxed tasks"),
        why: z.string().describe("Requirement / gap this closes"),
      }),
    )
    .describe("Day-by-day plan fitted to the days available, only for must-have gaps and weak spots. Empty when nothing needs study."),
  pitfalls: z.array(z.string()).describe("2–4 specific mistakes to avoid in this round for this role"),
  needs_input: needsInput,
});
export type RoundPack = z.infer<typeof roundPackSchema>;

export const mockCoachingSchema = z.object({
  what_worked: z.array(z.string()).describe("1–2 specific things the answer did well; empty if nothing"),
  to_improve: z.array(z.string()).describe("At most 2 concrete improvements"),
  uses_evidence: z.boolean().describe("The answer cites a concrete example from their experience"),
  has_result: z.boolean().describe("The answer states an outcome or impact"),
  relevant_to_role: z.boolean().describe("The answer connects to what this job needs"),
  cv_fact_to_use: z.string().describe("A fact from the CV that would have strengthened the answer; empty string if none"),
  stronger_opening: z.string().describe("A better first sentence for this answer, in the interview language"),
});
export type MockCoaching = z.infer<typeof mockCoachingSchema>;

export const mockTurnSchema = z.object({
  coaching: mockCoachingSchema.nullable().describe("Feedback on the candidate's latest answer; null when there is no answer yet"),
  next_question: z
    .object({
      question: z.string(),
      intent: z.string().describe("What this question assesses, in few words"),
      is_follow_up: z.boolean().describe("True when probing deeper into the previous answer"),
    })
    .nullable()
    .describe("The interviewer's next question; null when the interview should end"),
});
export type MockTurnResult = z.infer<typeof mockTurnSchema>;

export const mockReportSchema = z.object({
  summary: z.string().describe("3–4 sentences, honest and encouraging, about how the candidate came across"),
  strengths: z.array(z.string()).describe("2–4 specific strengths shown"),
  recurring_gaps: z.array(z.string()).describe("1–3 patterns to fix"),
  stories_to_prepare: z
    .array(
      z.object({
        title: z.string(),
        competency: z.string().describe("e.g. conflict, ownership, failure, leadership"),
        source: z.string().describe("The CV role/project this story should come from"),
      }),
    )
    .describe("1–3 STAR stories worth writing down before the real interview"),
  review_topics: z.array(z.string()).describe("Technical or domain topics to review; empty if none"),
});
export type MockReport = z.infer<typeof mockReportSchema>;

export const messageDraftSchema = z.object({
  subject: z.string().describe("Email subject; empty string for chat/LinkedIn style"),
  body: z.string().describe("The message body, ready to send after the candidate reviews it"),
});
export type MessageDraft = z.infer<typeof messageDraftSchema>;

export const PLAN_SOURCES = ["fit", "round_pack", "stories", "pitch", "strengths", "mock", "job_post", "cv"] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

export const quickPlanSchema = z.object({
  headline: z.string().describe("One line: the single most important focus for this round"),
  key_messages: z
    .array(z.string())
    .describe("Exactly 3 things the candidate must get across, each tied to a specific CV fact"),
  days: z
    .array(
      z.object({
        date: z.string().describe("One of the dates listed in <plan_dates>, YYYY-MM-DD"),
        focus: z.string().describe("Theme of the day in a few words"),
        tasks: z
          .array(
            z.object({
              title: z.string().describe("Short imperative task, e.g. 'Rehearse your 60-second pitch out loud'"),
              detail: z.string().describe("One sentence: exactly what to do, naming the story / topic / question"),
              minutes: z.number().int().describe("Time box in minutes"),
              source: z.enum(PLAN_SOURCES).describe("Which prep material this task uses"),
            }),
          )
          .describe("2–4 tasks whose minutes add up to about the daily budget"),
      }),
    )
    .describe("One entry per date in <plan_dates>, in order"),
  cheat_sheet: z.object({
    opener: z.string().describe("Opening line for 'tell me about yourself', in the interview language"),
    stories: z.array(z.string()).describe("2–4 stories to have ready: 'Title — one line', in the interview language"),
    numbers: z.array(z.string()).describe("Figures worth quoting, ONLY if they appear in the CV or prep material"),
    questions_to_ask: z.array(z.string()).describe("2–3 questions to ask them, in the interview language"),
  }),
  day_of: z.array(z.string()).describe("3–6 item checklist for the interview day (logistics, timezone, setup, last-30-minutes review)"),
  not_ready: z.array(z.string()).describe("Prep that is still missing and worth doing; empty if none"),
});
export type QuickPlan = z.infer<typeof quickPlanSchema>;
