import { describe, it, expect } from "vitest";
import { checkSpelling } from "@/lib/ats/spell-checker";

describe("checkSpelling", () => {
  it("scores high for clean text", () => {
    const text = `Experienced software developer with expertise in building scalable applications.
Led a team of engineers to deliver projects on time and within budget.
Strong background in cloud infrastructure and database management.`;
    const result = checkSpelling(text);
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it("does NOT flag tech terms as misspellings", () => {
    const text = `kubernetes postgresql graphql typescript javascript react nextjs redis mongodb nginx webpack vite docker terraform ansible`;
    const result = checkSpelling(text);
    // Tech terms should not be flagged
    const techErrors = result.issues.filter(
      (i) =>
        i.message.toLowerCase().includes("kubernetes") ||
        i.message.toLowerCase().includes("postgresql") ||
        i.message.toLowerCase().includes("graphql"),
    );
    expect(techErrors.length).toBe(0);
  });

  it("detects common misspellings", () => {
    const text = `I have extensive experiance with teh latest technologies.
My work on enviroment configuration was well received.`;
    const result = checkSpelling(text);
    const hasSpellingIssue = result.issues.some(
      (i) =>
        i.message.toLowerCase().includes("teh") ||
        i.message.toLowerCase().includes("experiance") ||
        i.message.toLowerCase().includes("enviroment"),
    );
    expect(hasSpellingIssue).toBe(true);
    expect(result.score).toBeLessThan(100);
  });

  it("detects doubled words", () => {
    const text = `I have have experience with React.
The the project was successful.`;
    const result = checkSpelling(text);
    const hasDoubledIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("doubled"),
    );
    expect(hasDoubledIssue).toBe(true);
  });

  it("handles short text", () => {
    const text = "React developer";
    const result = checkSpelling(text);
    // Should not crash on very short text
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("handles text with only tech terms", () => {
    const text = "React TypeScript Node PostgreSQL Docker Kubernetes Redis GraphQL";
    const result = checkSpelling(text);
    // Should pass cleanly - no spelling issues
    const spellingErrors = result.issues.filter(
      (i) => i.message.includes("misspelling"),
    );
    expect(spellingErrors.length).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it("does not flag URLs and emails", () => {
    const text = `Contact: user@example.com
Portfolio: https://mysite.dev/portfolio
GitHub: github.com/username`;
    const result = checkSpelling(text);
    // URLs and emails should not trigger spelling errors
    const urlErrors = result.issues.filter(
      (i) =>
        i.message.includes("mysite") ||
        i.message.includes("github") ||
        i.message.includes("example"),
    );
    expect(urlErrors.length).toBe(0);
  });

  it("does not flag ALL-CAPS acronyms", () => {
    const text = `Experience with REST API design and CI CD pipelines.
Worked with AWS SQS SNS and DynamoDB services.`;
    const result = checkSpelling(text);
    const acronymErrors = result.issues.filter(
      (i) =>
        i.message.includes("\"REST\"") ||
        i.message.includes("\"API\"") ||
        i.message.includes("\"SQS\""),
    );
    expect(acronymErrors.length).toBe(0);
  });

  it("handles empty text", () => {
    const result = checkSpelling("");
    expect(result.score).toBe(100);
    expect(result.issues.length).toBe(0);
  });

  it("provides suggestions for known typos", () => {
    const text = "I have strong managment and developement skills";
    const result = checkSpelling(text);
    const hasSuggestion = result.issues.some(
      (i) => i.fix.toLowerCase().includes("replace"),
    );
    expect(hasSuggestion).toBe(true);
  });
});
