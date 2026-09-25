import { describe, it, expect } from "vitest";
import { validateStructure } from "@/lib/ats/structure-validator";
import { sampleParsedCv, minimalParsedCv } from "../../fixtures/sample-cv";
import { sampleRawCvText } from "../../fixtures/sample-cv";

describe("validateStructure", () => {
  it("scores high when all required sections are present", () => {
    const result = validateStructure(sampleRawCvText, sampleParsedCv);
    expect(result.score).toBeGreaterThanOrEqual(70);
    // No critical issues for required sections
    const missingRequired = result.issues.filter(
      (i) =>
        i.severity === "critical" &&
        i.message.includes("Missing required section"),
    );
    expect(missingRequired.length).toBe(0);
  });

  it("flags missing Summary section", () => {
    const textWithoutSummary = `Juan Perez
juan@email.com

Experience
Software Engineer at ABC Tech
- Led development

Education
Bachelor in Computer Science

Skills
JavaScript, React
`;
    const cv = { ...sampleParsedCv, summary: "" };
    const result = validateStructure(textWithoutSummary, cv);
    const hasSummaryIssue = result.issues.some(
      (i) =>
        i.severity === "critical" &&
        i.message.toLowerCase().includes("summary"),
    );
    expect(hasSummaryIssue).toBe(true);
  });

  it("flags missing Experience section", () => {
    const textWithoutExperience = `Juan Perez

Summary
Experienced developer

Education
Bachelor in Computer Science

Skills
JavaScript, React
`;
    const cv = { ...sampleParsedCv, experience: [] };
    const result = validateStructure(textWithoutExperience, cv);
    const hasExpIssue = result.issues.some(
      (i) =>
        i.severity === "critical" &&
        i.message.toLowerCase().includes("experience"),
    );
    expect(hasExpIssue).toBe(true);
  });

  it("flags missing Education section", () => {
    const textWithoutEducation = `Juan Perez

Summary
Experienced developer

Experience
Software Engineer at ABC

Skills
JavaScript, React
`;
    const cv = { ...sampleParsedCv, education: [] };
    const result = validateStructure(textWithoutEducation, cv);
    const hasEduIssue = result.issues.some(
      (i) =>
        i.severity === "critical" &&
        i.message.toLowerCase().includes("education"),
    );
    expect(hasEduIssue).toBe(true);
  });

  it("recognizes Spanish section headers", () => {
    const spanishText = `Juan Perez
juan@email.com

Resumen
Desarrollador experimentado con 5 anos de experiencia.

Experiencia
Ingeniero de Software en ABC Tech

Educacion
Licenciatura en Informatica

Habilidades
JavaScript, React, Node.js
`;
    const result = validateStructure(spanishText, sampleParsedCv);
    // Spanish headers should be recognized, no critical missing sections
    const missingRequired = result.issues.filter(
      (i) =>
        i.severity === "critical" &&
        i.message.includes("Missing required section"),
    );
    expect(missingRequired.length).toBe(0);
  });

  it("validates section order", () => {
    // Put Skills before Experience (wrong order)
    const wrongOrderText = `Juan Perez

Summary
Developer with years of experience building applications

Skills
JavaScript, TypeScript, React, Node.js

Experience
Software Engineer at ABC
Led development of web apps

Education
Bachelor in Computer Science
`;
    const result = validateStructure(wrongOrderText, sampleParsedCv);
    const hasOrderIssue = result.issues.some(
      (i) =>
        i.message.toLowerCase().includes("order") ||
        i.message.toLowerCase().includes("section order"),
    );
    expect(hasOrderIssue).toBe(true);
  });

  it("checks experience entries completeness", () => {
    const cv = {
      ...sampleParsedCv,
      experience: [
        {
          company: "",
          location: "",
          title: "",
          start_date: "",
          end_date: null,
          description: "",
          achievements: [],
          technologies: [],
        },
      ],
    };
    const result = validateStructure(sampleRawCvText, cv);
    const hasIncompleteIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("missing"),
    );
    expect(hasIncompleteIssue).toBe(true);
  });

  it("suggests recommended sections (Certifications, Projects)", () => {
    const basicText = `Summary
Developer

Experience
Software Engineer

Education
Bachelor in CS

Skills
JavaScript
`;
    const cv = {
      ...sampleParsedCv,
      certifications: [],
      projects: [],
      languages: [],
    };
    const result = validateStructure(basicText, cv);
    const hasRecommendedIssue = result.issues.some(
      (i) =>
        i.severity === "info" &&
        i.message.includes("Recommended section missing"),
    );
    expect(hasRecommendedIssue).toBe(true);
  });

  it("handles empty CV", () => {
    const result = validateStructure("", minimalParsedCv);
    // Should flag all required sections as missing
    const criticalIssues = result.issues.filter(
      (i) => i.severity === "critical",
    );
    expect(criticalIssues.length).toBeGreaterThanOrEqual(4); // summary, experience, education, skills
    expect(result.score).toBeLessThan(50);
  });

  it("handles mixed English/Spanish headers", () => {
    const mixedText = `Juan Perez

Summary
Experienced developer

Experiencia
Ingeniero de Software

Education
Bachelor in CS

Habilidades
JavaScript, React
`;
    const result = validateStructure(mixedText, sampleParsedCv);
    // Both English and Spanish headers should be recognized
    const missingRequired = result.issues.filter(
      (i) =>
        i.severity === "critical" &&
        i.message.includes("Missing required section"),
    );
    expect(missingRequired.length).toBe(0);
  });

  it("flags short summary", () => {
    const cv = { ...sampleParsedCv, summary: "Developer." };
    const result = validateStructure(sampleRawCvText, cv);
    const hasShortSummary = result.issues.some(
      (i) => i.message.toLowerCase().includes("summary is very short"),
    );
    expect(hasShortSummary).toBe(true);
  });
});
