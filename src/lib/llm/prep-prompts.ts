/**
 * Prompts for interview prep grounded in the candidate's CV and the job post:
 * gap brief, per-round prep pack, mock interview turns + report, and follow-up /
 * thank-you drafts.
 *
 * All builders return `{ system, prompt }`: rules in the system message, data in the
 * user prompt wrapped in tags the rules refer to (same style as cv-optimization-prompts).
 *
 * Policy — the most common complaint about AI prep tools is generic output, so:
 * - Every statement about the candidate must be traceable to <cv>; every statement
 *   about the role to <job_post>.
 * - Numbers, employers, scopes and outcomes are never invented. Missing facts become
 *   `needs_input` questions for the candidate.
 * - No filler or cliché phrases; short and specific beats long and polished.
 * - Candidate-facing wording uses the material language (usually the job post's);
 *   coaching aimed at the candidate may use their UI language.
 */
import type { InterviewType, Job, ParsedCv, StarStory } from "@/types";
import type { MessageKind } from "@/types";
import { formatCvForPrompt, formatJobForPrompt } from "./prompts";
import { LANGUAGE_NAME, type MaterialLanguage } from "./language";
import type { PromptPair } from "./cv-optimization-prompts";
import type { GapBrief } from "./prep-schemas";

export const BANNED_PHRASES = [
  "I am excited to",
  "I'm thrilled",
  "passionate about",
  "leverage",
  "synergy",
  "dynamic team",
  "fast-paced environment",
  "hit the ground running",
  "I believe I would be a great fit",
  "hope this email finds you well",
  "team player",
  "think outside the box",
];

export function groundingRules(): string {
  return `## Grounding rules (non-negotiable)
- Everything you say about the candidate must come from <cv> (or <stories> / <candidate_notes> when given). Refer to concrete roles, projects and achievements by name.
- Everything you say about the role must come from <job_post>. Do not assume company facts that are not there.
- Never invent numbers, percentages, team sizes, employers, titles, dates or outcomes. If an answer would be stronger with a fact the CV lacks, add a question to needs_input instead.
- Be honest about gaps. Do not claim experience the candidate lacks; suggest how to frame adjacent experience or a learning plan.
- Be specific and concise. Avoid these phrases and their equivalents in any language: ${BANNED_PHRASES.map((p) => `"${p}"`).join(", ")}.
- No generic advice that would apply to any candidate for any job ("research the company", "be yourself").`;
}

const ROUND_GUIDANCE: Record<InterviewType, string> = {
  phone_screen:
    "Recruiter / phone screen: motivation for this role and company, a 60-second career summary, salary expectations, notice period, work authorization and remote logistics (timezone overlap, country, contractor vs employee), English fluency. Keep technical depth light.",
  technical:
    "Technical interview: the core technologies and problems in the job post, depth on projects from the CV that use them, debugging / trade-off reasoning, possibly live coding. Prioritize must-have skills where the CV is weak.",
  system_design:
    "System design: designing systems at the scale and domain implied by the job post, trade-offs, data modeling, reliability, and drawing on systems the candidate actually built (from the CV).",
  behavioral:
    "Behavioral / culture fit: STAR stories on ownership, conflict, failure, collaboration across timezones, feedback, and the values or ways of working the job post mentions.",
  hiring_manager:
    "Hiring manager: impact and scope in past roles, how the candidate works with a team and stakeholders, why this role now, what they'd do in the first 90 days, and fit with the team described in the post.",
  final:
    "Final / panel round: a mix of deeper follow-ups on earlier topics, values and motivation, questions for leadership, and closing (expectations, timeline, remaining concerns).",
  take_home:
    "Take-home assignment: clarifying scope and assumptions, time-boxing, what reviewers look for (tests, README, trade-offs, commit history), and how to present it in the follow-up discussion.",
};

function cvBlock(cv: ParsedCv): string {
  return `<cv>\n${formatCvForPrompt(cv)}\n</cv>`;
}

function jobBlock(job: Job): string {
  return `<job_post>\n${formatJobForPrompt(job)}\n</job_post>`;
}

function storiesBlock(stories: StarStory[]): string {
  if (stories.length === 0) return "<stories>\n(none written yet)\n</stories>";
  const lines = stories.map(
    (s) =>
      `- "${s.title}" — S: ${s.situation} | T: ${s.task} | A: ${s.action} | R: ${s.result}` +
      (s.skills_demonstrated.length ? ` | skills: ${s.skills_demonstrated.join(", ")}` : ""),
  );
  return `<stories>\n${lines.join("\n")}\n</stories>`;
}

function gapBriefBlock(brief: GapBrief | null): string {
  if (!brief) return "";
  const reqs = brief.requirements
    .map((r) => `- [${r.priority}/${r.fit}] ${r.requirement}${r.cv_evidence ? ` — evidence: ${r.cv_evidence}` : ""}`)
    .join("\n");
  return `\n<fit_analysis>\n${brief.headline}\n${reqs}\n</fit_analysis>\n`;
}

// ---------------------------------------------------------------------------
// Gap brief (per application)
// ---------------------------------------------------------------------------

export function buildGapBriefPrompt(input: { cv: ParsedCv; job: Job; language: MaterialLanguage }): PromptPair {
  const system = `You are a candid career coach preparing a candidate for a specific remote job. You map each important requirement of the job post to evidence in the candidate's CV and say plainly where they are strong, partial or missing.

${groundingRules()}

## Output
- Write every text field in ${LANGUAGE_NAME[input.language]}.
- requirements: 8–14 items, must-haves first. "strong" needs direct evidence; "partial" means related or shallower evidence; "missing" means none.
- how_to_address: for strong/partial, how to present the evidence in an interview; for missing, an honest framing (adjacent experience, learning plan) — never a bluff.
- remote_notes: only questions a remote candidate should clarify for THIS post (timezone overlap, eligible countries, contractor vs employee/EOR, pay currency). Empty if the post answers them all.`;
  const prompt = `${jobBlock(input.job)}

${cvBlock(input.cv)}

Produce the fit analysis.`;
  return { system, prompt };
}

// ---------------------------------------------------------------------------
// Round prep pack (per interview)
// ---------------------------------------------------------------------------

export interface RoundPackInput {
  cv: ParsedCv;
  job: Job;
  interviewType: InterviewType;
  /** Whole days until the interview (0 = today); null when unknown. */
  daysUntil: number | null;
  stories: StarStory[];
  gapBrief: GapBrief | null;
  interviewerRole?: string;
  notes?: string;
  language: MaterialLanguage;
}

export function buildRoundPackPrompt(input: RoundPackInput): PromptPair {
  const studyDays =
    input.daysUntil === null ? 3 : Math.max(1, Math.min(input.daysUntil, 5));
  const system = `You are an interview coach preparing a candidate for one specific interview round.

## This round
${ROUND_GUIDANCE[input.interviewType]}${input.interviewerRole ? `\nInterviewer: ${input.interviewerRole}.` : ""}

${groundingRules()}

## Output
- Write every text field in ${LANGUAGE_NAME[input.language]}.
- likely_questions: questions THIS company would plausibly ask for THIS role in this round type — tie each to a requirement or signal from <job_post>. answer_outline bullets must use the candidate's real experience from <cv>. In "story", name one of the <stories> titles when one fits, otherwise the CV role/project to draw from, otherwise "".
- questions_to_ask: specific to the post (team, product, stack, remote setup, success in the first months) — not generic.
- study_plan: ${studyDays} day(s) at most${input.daysUntil === 0 ? " (the interview is today: one short same-day refresh)" : ""}; focus on must-have requirements where the candidate is partial or missing. Empty for rounds that need no study.
- pitfalls: mistakes this candidate in particular could make given their CV and this post.`;
  const prompt = `${jobBlock(input.job)}

${cvBlock(input.cv)}

${storiesBlock(input.stories)}
${gapBriefBlock(input.gapBrief)}${input.notes ? `\n<candidate_notes>\n${input.notes}\n</candidate_notes>\n` : ""}
Build the prep pack for the ${input.interviewType.replace("_", " ")} round.`;
  return { system, prompt };
}

// ---------------------------------------------------------------------------
// Mock interview
// ---------------------------------------------------------------------------

export interface MockTranscriptTurn {
  question: string;
  answer: string;
}

export interface MockTurnInput {
  cv: ParsedCv;
  job: Job;
  interviewType: InterviewType;
  /** Language the interviewer speaks and the candidate answers in. */
  language: MaterialLanguage;
  /** Language for coaching notes addressed to the candidate. */
  coachingLanguage: MaterialLanguage;
  /** Completed turns before the current one. */
  transcript: MockTranscriptTurn[];
  /** The question being answered and the candidate's answer; null to start. */
  current: MockTranscriptTurn | null;
  totalQuestions: number;
}

export function buildMockTurnPrompt(input: MockTurnInput): PromptPair {
  const asked = input.transcript.length + (input.current ? 1 : 0);
  const remaining = input.totalQuestions - asked;
  const system = `You play two roles in a realistic practice interview for the job in <job_post>.

1. INTERVIEWER for a ${input.interviewType.replace("_", " ")} round. ${ROUND_GUIDANCE[input.interviewType]}
   Ask one question at a time, in ${LANGUAGE_NAME[input.language]}, the way a real interviewer at this company would. Use the candidate's CV to ask about their actual experience. Ask a short follow-up (is_follow_up = true) when the last answer was vague, lacked a concrete example, or had no result — at most one follow-up per topic. Do not repeat topics already covered in <transcript>.
2. COACH: when <current_answer> is present, give brief coaching on it in ${LANGUAGE_NAME[input.coachingLanguage]} (except stronger_opening, which is in ${LANGUAGE_NAME[input.language]}). Judge content, not polish: did they use a concrete example, state a result, connect to what the job needs? Never give scores. Point to a real CV fact they could have used.

${groundingRules()}

## Pacing
${asked} of ${input.totalQuestions} questions asked so far. ${remaining > 0 ? "Ask the next question." : "Do not ask another question: set next_question to null."}
When there is no <current_answer>, set coaching to null and ask the opening question.`;
  const transcript = input.transcript.length
    ? input.transcript.map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`).join("\n\n")
    : "(empty)";
  const prompt = `${jobBlock(input.job)}

${cvBlock(input.cv)}

<transcript>
${transcript}
</transcript>
${
  input.current
    ? `\n<current_question>\n${input.current.question}\n</current_question>\n\n<current_answer>\n${input.current.answer}\n</current_answer>\n`
    : ""
}`;
  return { system, prompt };
}

export function buildMockReportPrompt(input: {
  cv: ParsedCv;
  job: Job;
  interviewType: InterviewType;
  coachingLanguage: MaterialLanguage;
  transcript: MockTranscriptTurn[];
}): PromptPair {
  const system = `You are an interview coach reviewing a finished practice ${input.interviewType.replace("_", " ")} interview for the job in <job_post>.

${groundingRules()}

## Output
- Write in ${LANGUAGE_NAME[input.coachingLanguage]}.
- Be honest and encouraging; no scores or grades.
- Base every point on what the candidate actually said in <transcript>.
- stories_to_prepare: stories that were missing or weak in the answers, sourced from real roles/projects in <cv>.`;
  const transcript = input.transcript
    .map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`)
    .join("\n\n");
  const prompt = `${jobBlock(input.job)}

${cvBlock(input.cv)}

<transcript>
${transcript}
</transcript>`;
  return { system, prompt };
}

// ---------------------------------------------------------------------------
// Follow-up / thank-you drafts
// ---------------------------------------------------------------------------

export interface MessageDraftInput {
  kind: MessageKind;
  candidateName: string;
  cv: ParsedCv | null;
  job: Job;
  language: MaterialLanguage;
  daysSinceApplied: number | null;
  interview?: {
    type: InterviewType;
    interviewerName: string;
    interviewerRole: string;
    /** The candidate's own notes / feedback about how the round went. */
    notes: string;
  } | null;
}

const MESSAGE_GUIDANCE: Record<MessageKind, string> = {
  follow_up:
    "A polite follow-up on an application with no reply yet. 60–110 words. Restate interest in the specific role in one line, add ONE concrete, relevant fact from the CV that matches a must-have in the post, and ask about next steps or timeline. No guilt-tripping, no apologizing for following up.",
  thank_you:
    "A thank-you note sent within 24 hours after an interview. 70–120 words. Address the interviewer by first name when known. Reference one or two specific topics from <interview_notes> when available (never invent what was discussed). Briefly reinforce fit with one CV fact related to those topics. Close by saying you look forward to next steps.",
  withdraw:
    "A courteous message withdrawing from the process. 40–80 words. Thank them, withdraw clearly, no detailed reasons needed, leave the door open.",
  accept:
    "A warm, professional message accepting an offer. 50–100 words. Confirm acceptance and ask about next steps (contract, start date, onboarding).",
};

export function buildMessageDraftPrompt(input: MessageDraftInput): PromptPair {
  const system = `You write short, human messages a job candidate sends to a company. ${MESSAGE_GUIDANCE[input.kind]}

${groundingRules()}

## Output
- Write in ${LANGUAGE_NAME[input.language]}, in a natural, direct tone — like a competent professional writing a quick email, not a template.
- Sign as ${input.candidateName || "the candidate"}.
- Do not use placeholders like [Name] except for the interviewer's name when it is unknown; in that case use a neutral greeting instead.`;
  const interview = input.interview
    ? `\n<interview>\nRound: ${input.interview.type.replace("_", " ")}\nInterviewer: ${input.interview.interviewerName || "(unknown)"}${input.interview.interviewerRole ? `, ${input.interview.interviewerRole}` : ""}\n</interview>\n\n<interview_notes>\n${input.interview.notes || "(none)"}\n</interview_notes>\n`
    : "";
  const prompt = `${jobBlock(input.job)}

${input.cv ? cvBlock(input.cv) : ""}
${interview}${input.daysSinceApplied !== null ? `\nDays since applying: ${input.daysSinceApplied}\n` : ""}
Write the ${input.kind.replace("_", " ")} message.`;
  return { system, prompt };
}
