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
import type { InterviewPrep, InterviewType, Job, ParsedCv, StarStory } from "@/types";
import type { MessageKind } from "@/types";
import { formatCvForPrompt, formatJobForPrompt } from "./prompts";
import { LANGUAGE_NAME, type MaterialLanguage } from "./language";
import type { PromptPair } from "./cv-optimization-prompts";
import type { GapBrief, MockReport, RoundPack } from "./prep-schemas";

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

// ---------------------------------------------------------------------------
// Quick study plan (per scheduled interview): condenses all prep material into a
// day-by-day countdown.
// ---------------------------------------------------------------------------

/** Caps a section so a large prep module never blows the context window. */
function clip(text: string, max = 2500): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…(truncated)`;
}

export interface QuickPlanInput {
  cv: ParsedCv;
  job: Job;
  interviewType: InterviewType;
  /** Human-readable interview date/time in the candidate's timezone. */
  interviewAt: string;
  mode: "days" | "same_day";
  /** Allowed plan dates, YYYY-MM-DD, with a weekday label for the model. */
  dates: Array<{ date: string; weekday: string }>;
  minutesPerDay: number;
  stories: StarStory[];
  gapBrief: GapBrief | null;
  roundPack: RoundPack | null;
  interviewPrep: InterviewPrep | null;
  mockReport: MockReport | null;
  /** Other scheduled interviews (any application) on the plan dates. */
  otherRounds: Array<{ date: string; label: string }>;
  interviewerRole?: string;
  /** Language of the plan text (the candidate's UI language). */
  planLanguage: MaterialLanguage;
  /** Language of the interview (cheat sheet lines). */
  materialLanguage: MaterialLanguage;
}

function roundPackBlock(pack: RoundPack | null): string {
  if (!pack) return "";
  const lines = [
    `Focus: ${pack.focus}`,
    "Likely questions:",
    ...pack.likely_questions.map((q) => `- ${q.question}${q.story ? ` [story: ${q.story}]` : ""}`),
    "Questions to ask:",
    ...pack.questions_to_ask.map((q) => `- ${q.question}`),
    ...(pack.study_plan.length ? ["Study topics:", ...pack.study_plan.map((d) => `- ${d.topic}: ${d.why}`)] : []),
    ...(pack.pitfalls.length ? ["Pitfalls:", ...pack.pitfalls.map((p) => `- ${p}`)] : []),
  ];
  return `\n<round_pack>\n${clip(lines.join("\n"))}\n</round_pack>\n`;
}

function interviewPrepBlocks(prep: InterviewPrep | null): string {
  if (!prep) return "";
  const out: string[] = [];
  const pitch = [prep.pitch_casual, prep.pitch_formal, prep.pitch_technical].find((p) => p.trim());
  if (pitch) out.push(`<pitch>\n${clip(pitch, 1200)}\n</pitch>`);
  if (prep.strengths.length || prep.weaknesses.length) {
    const lines = [
      ...prep.strengths.map((s) => `+ ${s.strength}: ${s.example}`),
      ...prep.weaknesses.map((w) => `- ${w.weakness}: ${w.response}`),
    ];
    out.push(`<strengths_weaknesses>\n${clip(lines.join("\n"), 1500)}\n</strengths_weaknesses>`);
  }
  if (prep.custom_questions.length) {
    out.push(
      `<custom_questions>\n${clip(prep.custom_questions.map((q) => `- ${q.question}`).join("\n"), 1000)}\n</custom_questions>`,
    );
  }
  return out.length ? `\n${out.join("\n\n")}\n` : "";
}

function mockBlock(report: MockReport | null): string {
  if (!report) return "";
  const lines = [
    report.summary,
    ...report.recurring_gaps.map((g) => `Gap: ${g}`),
    ...report.stories_to_prepare.map((s) => `Story to prepare: ${s.title} (${s.competency})`),
    ...report.review_topics.map((t) => `Review: ${t}`),
  ];
  return `\n<mock_feedback>\n${clip(lines.join("\n"), 1200)}\n</mock_feedback>\n`;
}

export function buildQuickPlanPrompt(input: QuickPlanInput): PromptPair {
  const sameDay = input.mode === "same_day";
  const system = `You are an interview coach turning a candidate's full preparation material into a short, realistic countdown plan for ONE interview round.

## This round
${ROUND_GUIDANCE[input.interviewType]}${input.interviewerRole ? `\nInterviewer: ${input.interviewerRole}.` : ""}
Interview: ${input.interviewAt}.

${groundingRules()}

## How to plan
- Condense; do not repeat the material. Each task is something concrete the candidate does (rehearse, write, review, practice), naming the exact story, topic or question — and "source" says which material it uses: fit (<fit_analysis>), round_pack, stories, pitch, strengths, mock, job_post or cv.
- ${sameDay ? "The interview is TODAY: produce a single entry for the date in <plan_dates> — a focused block of about " + input.minutesPerDay + " minutes before the interview (quick review, pitch out loud once, logistics check). No new learning." : `Use exactly the dates in <plan_dates>, one entry each, in order. Tasks per day should add up to about ${input.minutesPerDay} minutes.`}
- Order by impact: for technical/system design rounds, must-have gaps first; for phone screens, pitch, motivation, salary expectations and remote logistics; for behavioral/hiring manager, STAR stories mapped to the post; for take-home, scope, time-box and delivery.
- ${sameDay ? "" : "The day before the interview is for rehearsal (pitch out loud, a mock interview, re-reading the cheat sheet), not new topics. "}If <other_rounds> lists another interview on a date, keep that date light (15–20 minutes at most).
- If practice material is missing (no stories, no mock), include tasks to create it and list it in not_ready.

## Languages
- Write headline, key_messages, focus, task titles/details, day_of and not_ready in ${LANGUAGE_NAME[input.planLanguage]}.
- Write cheat_sheet (opener, stories, questions_to_ask) in ${LANGUAGE_NAME[input.materialLanguage]}, the language of the interview.`;

  const dates = input.dates.map((d) => `- ${d.date} (${d.weekday})`).join("\n");
  const others = input.otherRounds.length
    ? `\n<other_rounds>\n${input.otherRounds.map((r) => `- ${r.date}: ${r.label}`).join("\n")}\n</other_rounds>\n`
    : "";
  const prompt = `<plan_dates>
${dates}
Minutes per day: ${input.minutesPerDay}
</plan_dates>
${others}
${jobBlock(input.job)}

${cvBlock(input.cv)}

${storiesBlock(input.stories)}
${gapBriefBlock(input.gapBrief)}${roundPackBlock(input.roundPack)}${interviewPrepBlocks(input.interviewPrep)}${mockBlock(input.mockReport)}
Build the countdown plan for the ${input.interviewType.replace("_", " ")} round.`;
  return { system, prompt };
}
