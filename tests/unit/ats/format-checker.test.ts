import { describe, it, expect } from "vitest";
import { checkFormat } from "@/lib/ats/format-checker";

describe("checkFormat", () => {
  it("scores high for clean text", () => {
    const text = `Juan Perez
juan@email.com

Summary
Experienced software developer with 5 years of experience.

Experience
Senior Software Engineer at ABC Tech
- Led development of microservices
- Managed team of 5 engineers

Education
Bachelor in Computer Science
`;
    const result = checkFormat(text, "docx");
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it("detects tab-separated table content", () => {
    const tabLines = Array(5)
      .fill("Col1\tCol2\tCol3\tCol4")
      .join("\n");
    const text = `Header\n${tabLines}\nFooter`;
    const result = checkFormat(text, "docx");
    expect(result.score).toBeLessThan(90);
    const hasTableIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("tab"),
    );
    expect(hasTableIssue).toBe(true);
  });

  it("detects pipe-delimited tables", () => {
    const pipeLines = Array(4)
      .fill("| Name | Role | Years | Skills |")
      .join("\n");
    const text = `Resume\n${pipeLines}\n`;
    const result = checkFormat(text, "docx");
    expect(result.score).toBeLessThan(90);
    const hasPipeIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("pipe"),
    );
    expect(hasPipeIssue).toBe(true);
  });

  it("flags image indicators", () => {
    const text = `Juan Perez
[image] profile photo
[logo] company logo
Summary
Experienced developer
`;
    const result = checkFormat(text, "docx");
    const hasImageIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("image"),
    );
    expect(hasImageIssue).toBe(true);
  });

  it("prefers docx over pdf (docx scores higher)", () => {
    const text = "Simple clean resume text with enough content to be valid.";
    const docxResult = checkFormat(text, "docx");
    const pdfResult = checkFormat(text, "pdf");
    expect(docxResult.score).toBeGreaterThanOrEqual(pdfResult.score);
  });

  it("penalizes unsupported file types heavily", () => {
    const text = "Simple resume content.";
    const result = checkFormat(text, "txt");
    const hasUnsupportedIssue = result.issues.some(
      (i) => i.severity === "critical" && i.message.includes("txt"),
    );
    expect(hasUnsupportedIssue).toBe(true);
    expect(result.score).toBeLessThan(85);
  });

  it("flags very long lines (200+ chars)", () => {
    const longLine = "a".repeat(250);
    const lines = [longLine, longLine, longLine, longLine, "short line"];
    const text = lines.join("\n");
    const result = checkFormat(text, "docx");
    const hasLongLineIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("200 characters"),
    );
    expect(hasLongLineIssue).toBe(true);
  });

  it("flags excessive special characters / decorators", () => {
    const decorators = "★☆●◆◇▪▫►▶◀◁";
    const text = Array(5)
      .fill(decorators)
      .join("\n");
    const result = checkFormat(text, "docx");
    const hasDecoratorIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("special unicode"),
    );
    expect(hasDecoratorIssue).toBe(true);
  });

  it("handles empty text", () => {
    const result = checkFormat("", "docx");
    // Should not crash and should flag sparse content
    expect(result.score).toBeLessThan(100);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("passes normal formatting without issues", () => {
    const lines = Array.from(
      { length: 25 },
      (_, i) => `Line ${i + 1}: Normal resume content with standard formatting and reasonable length.`,
    );
    const text = lines.join("\n");
    const result = checkFormat(text, "docx");
    // Should have no critical issues
    const criticalIssues = result.issues.filter(
      (i) => i.severity === "critical",
    );
    expect(criticalIssues.length).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it("detects multi-column layout (alternating short/long lines)", () => {
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) {
      if (i % 2 === 0) {
        lines.push("Short");
      } else {
        lines.push(
          "This is a much longer line that represents the main column content of a multi-column resume layout format",
        );
      }
    }
    const text = lines.join("\n");
    const result = checkFormat(text, "docx");
    const hasMultiColIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("multi-column"),
    );
    expect(hasMultiColIssue).toBe(true);
  });

  it("flags file extension indicators in text as image content", () => {
    const text = `Juan Perez
profile.jpg
company_logo.png
Summary
Developer with 5 years experience
`;
    const result = checkFormat(text, "docx");
    const hasImageIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("image"),
    );
    expect(hasImageIssue).toBe(true);
  });
});
