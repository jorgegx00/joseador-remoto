import { describe, it, expect } from "vitest";
import {
  BANNED_PHRASES,
  buildGapBriefPrompt,
  buildMessageDraftPrompt,
  buildMockReportPrompt,
  buildMockTurnPrompt,
  buildRoundPackPrompt,
} from "@/lib/llm/prep-prompts";
import {
  gapBriefSchema,
  messageDraftSchema,
  mockReportSchema,
  mockTurnSchema,
  roundPackSchema,
} from "@/lib/llm/prep-schemas";
import { resolveMaterialLanguage } from "@/lib/llm/language";
import { sampleParsedCv } from "../fixtures/sample-cv";
import { sampleJob } from "../fixtures/sample-job";

describe("resolveMaterialLanguage", () => {
  it("prefers an explicit override", () => {
    expect(resolveMaterialLanguage(sampleJob, "en", "es")).toBe("es");
  });

  it("uses the job post's language over the UI language", () => {
    expect(
      resolveMaterialLanguage(
        { title: "Senior Engineer", description: "We are looking for an engineer to build and maintain our platform with the team." },
        "es",
      ),
    ).toBe("en");
    expect(
      resolveMaterialLanguage(
        { title: "Desarrollador", description: "Buscamos una persona para el equipo de desarrollo de la empresa con experiencia en APIs." },
        "en",
      ),
    ).toBe("es");
  });

  it("falls back to the UI language without a signal", () => {
    expect(resolveMaterialLanguage({ title: "React", description: "React, AWS" }, "es-DO")).toBe("es");
    expect(resolveMaterialLanguage(null, "en")).toBe("en");
  });
});

describe("prep prompts", () => {
  it("gap brief: grounding rules in system, tagged CV and job in prompt", () => {
    const { system, prompt } = buildGapBriefPrompt({ cv: sampleParsedCv, job: sampleJob, language: "es" });
    expect(system).toContain("Never invent numbers");
    expect(system).toContain("Spanish");
    for (const p of BANNED_PHRASES.slice(0, 3)) expect(system).toContain(p);
    expect(prompt).toContain("<job_post>");
    expect(prompt).toContain("<cv>");
    expect(prompt).toContain(sampleJob.title);
    expect(prompt).toContain(sampleParsedCv.full_name);
  });

  it("round pack: round guidance, stories, and study days fitted to the date", () => {
    const pair = buildRoundPackPrompt({
      cv: sampleParsedCv,
      job: sampleJob,
      interviewType: "system_design",
      daysUntil: 2,
      stories: [
        {
          id: "s1",
          cv_id: "c",
          experience_index: 0,
          title: "Migrated billing to events",
          situation: "s",
          task: "t",
          action: "a",
          result: "r",
          skills_demonstrated: ["Kafka"],
          is_user_edited: true,
          created_at: 0,
          updated_at: 0,
        },
      ],
      gapBrief: null,
      language: "en",
    });
    expect(pair.system).toContain("System design");
    expect(pair.system).toContain("2 day(s) at most");
    expect(pair.prompt).toContain("Migrated billing to events");

    const today = buildRoundPackPrompt({
      cv: sampleParsedCv,
      job: sampleJob,
      interviewType: "technical",
      daysUntil: 0,
      stories: [],
      gapBrief: null,
      language: "en",
    });
    expect(today.system).toContain("the interview is today");
    expect(today.prompt).toContain("(none written yet)");
  });

  it("mock turn: opening vs. coaching, and stops at the limit", () => {
    const opening = buildMockTurnPrompt({
      cv: sampleParsedCv,
      job: sampleJob,
      interviewType: "behavioral",
      language: "en",
      coachingLanguage: "es",
      transcript: [],
      current: null,
      totalQuestions: 4,
    });
    expect(opening.system).toContain("0 of 4");
    expect(opening.prompt).not.toContain("<current_answer>");

    const last = buildMockTurnPrompt({
      cv: sampleParsedCv,
      job: sampleJob,
      interviewType: "behavioral",
      language: "en",
      coachingLanguage: "es",
      transcript: [
        { question: "Q1", answer: "A1" },
        { question: "Q2", answer: "A2" },
        { question: "Q3", answer: "A3" },
      ],
      current: { question: "Q4", answer: "A4" },
      totalQuestions: 4,
    });
    expect(last.system).toContain("set next_question to null");
    expect(last.system).toContain("Spanish");
    expect(last.prompt).toContain("<current_answer>\nA4");
  });

  it("mock report and message drafts include their inputs", () => {
    const report = buildMockReportPrompt({
      cv: sampleParsedCv,
      job: sampleJob,
      interviewType: "technical",
      coachingLanguage: "en",
      transcript: [{ question: "Why us?", answer: "Because of the product." }],
    });
    expect(report.prompt).toContain("Because of the product.");

    const thanks = buildMessageDraftPrompt({
      kind: "thank_you",
      candidateName: "Juan Perez",
      cv: sampleParsedCv,
      job: sampleJob,
      language: "en",
      daysSinceApplied: 12,
      interview: { type: "technical", interviewerName: "Ana", interviewerRole: "EM", notes: "Talked about caching" },
    });
    expect(thanks.system).toContain("thank-you");
    expect(thanks.system).toContain("Sign as Juan Perez");
    expect(thanks.prompt).toContain("Talked about caching");
    expect(thanks.prompt).toContain("Interviewer: Ana, EM");
  });
});

describe("prep schemas", () => {
  it("accept well-formed model output", () => {
    expect(
      gapBriefSchema.safeParse({
        headline: "h",
        requirements: [{ requirement: "React", priority: "must", fit: "strong", cv_evidence: "Built X", how_to_address: "Say Y" }],
        talking_points: ["p"],
        remote_notes: [],
        needs_input: [{ question: "How many users?", why: "scale" }],
      }).success,
    ).toBe(true);
    expect(
      roundPackSchema.safeParse({
        focus: "f",
        likely_questions: [{ question: "q", why_asked: "w", answer_outline: ["a"], story: "" }],
        questions_to_ask: [{ question: "q", why: "w" }],
        study_plan: [{ day: 1, topic: "t", tasks: ["x"], why: "y" }],
        pitfalls: [],
        needs_input: [],
      }).success,
    ).toBe(true);
    expect(mockTurnSchema.safeParse({ coaching: null, next_question: { question: "q", intent: "i", is_follow_up: false } }).success).toBe(true);
    expect(mockTurnSchema.safeParse({ coaching: null, next_question: null }).success).toBe(true);
    expect(
      mockReportSchema.safeParse({
        summary: "s",
        strengths: [],
        recurring_gaps: [],
        stories_to_prepare: [{ title: "t", competency: "c", source: "s" }],
        review_topics: [],
      }).success,
    ).toBe(true);
    expect(messageDraftSchema.safeParse({ subject: "", body: "b" }).success).toBe(true);
  });

  it("reject invalid enums", () => {
    expect(
      gapBriefSchema.safeParse({
        headline: "h",
        requirements: [{ requirement: "x", priority: "must", fit: "great", cv_evidence: "", how_to_address: "" }],
        talking_points: [],
        remote_notes: [],
        needs_input: [],
      }).success,
    ).toBe(false);
  });
});
