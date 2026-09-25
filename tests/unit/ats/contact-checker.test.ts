import { describe, it, expect } from "vitest";
import { checkContact } from "@/lib/ats/contact-checker";
import { sampleParsedCv, sampleRawCvText, minimalParsedCv } from "../../fixtures/sample-cv";

describe("checkContact", () => {
  it("scores high when all contact info is present", () => {
    const result = checkContact(sampleRawCvText, sampleParsedCv);
    expect(result.score).toBeGreaterThanOrEqual(80);
    const criticalIssues = result.issues.filter(
      (i) => i.severity === "critical",
    );
    expect(criticalIssues.length).toBe(0);
  });

  it("flags missing email", () => {
    const textNoEmail = `Juan Perez
+1-809-555-1234
linkedin.com/in/juanperez

Summary
Experienced developer
`;
    const cv = { ...sampleParsedCv, email: "" };
    const result = checkContact(textNoEmail, cv);
    const hasEmailIssue = result.issues.some(
      (i) =>
        i.severity === "critical" &&
        i.message.toLowerCase().includes("email"),
    );
    expect(hasEmailIssue).toBe(true);
    expect(result.score).toBeLessThan(80);
  });

  it("flags missing phone", () => {
    const textNoPhone = `Juan Perez
juan@email.com
linkedin.com/in/juanperez

Summary
Experienced developer
`;
    const cv = { ...sampleParsedCv, phone: "" };
    const result = checkContact(textNoPhone, cv);
    const hasPhoneIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("phone"),
    );
    expect(hasPhoneIssue).toBe(true);
  });

  it("flags missing LinkedIn", () => {
    const textNoLinkedin = `Juan Perez
juan@email.com
+1-809-555-1234

Summary
Experienced developer
`;
    const cv = { ...sampleParsedCv, linkedin_url: "" };
    const result = checkContact(textNoLinkedin, cv);
    const hasLinkedinIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("linkedin"),
    );
    expect(hasLinkedinIssue).toBe(true);
  });

  it("accepts international phone formats", () => {
    const textIntlPhone = `Juan Perez
juan@email.com | +52-55-1234-5678
linkedin.com/in/juanperez

Summary
Developer
`;
    const cv = { ...sampleParsedCv, phone: "+52-55-1234-5678" };
    const result = checkContact(textIntlPhone, cv);
    // Phone should be detected, no critical phone issue
    const phoneCritical = result.issues.filter(
      (i) =>
        i.severity === "critical" &&
        i.message.toLowerCase().includes("phone"),
    );
    expect(phoneCritical.length).toBe(0);
  });

  it("flags contact info not at top of CV", () => {
    // Put email way below the top
    const lines = Array(20).fill("Some content line here");
    const text = lines.join("\n") + "\njuan.perez@email.com\n+1-809-555-1234\n";
    const cv = {
      ...sampleParsedCv,
      email: "juan.perez@email.com",
      phone: "+1-809-555-1234",
    };
    const result = checkContact(text, cv);
    const hasPlacementIssue = result.issues.some(
      (i) =>
        i.message.toLowerCase().includes("not found in the first 15 lines"),
    );
    expect(hasPlacementIssue).toBe(true);
  });

  it("handles empty parsed CV", () => {
    const result = checkContact("", minimalParsedCv);
    // Should flag everything missing
    const criticalIssues = result.issues.filter(
      (i) => i.severity === "critical",
    );
    expect(criticalIssues.length).toBeGreaterThanOrEqual(2); // at least name and email
    expect(result.score).toBeLessThan(60);
  });

  it("flags missing name", () => {
    const text = `juan@email.com
+1-809-555-1234
linkedin.com/in/juanperez
`;
    const cv = { ...sampleParsedCv, full_name: "" };
    const result = checkContact(text, cv);
    const hasNameIssue = result.issues.some(
      (i) =>
        i.severity === "critical" &&
        i.message.toLowerCase().includes("name"),
    );
    expect(hasNameIssue).toBe(true);
  });

  it("flags unprofessional email domains", () => {
    const text = `Juan Perez
juan@hotmail.com | +1-809-555-1234
linkedin.com/in/juanperez
`;
    const cv = { ...sampleParsedCv, email: "juan@hotmail.com" };
    const result = checkContact(text, cv);
    const hasUnprofessionalIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("hotmail"),
    );
    expect(hasUnprofessionalIssue).toBe(true);
  });

  it("detects email and phone from raw text even without parsed CV data", () => {
    const text = `Juan Perez
test.email@gmail.com | +1-809-555-9999
linkedin.com/in/juanperez

Summary
Developer
`;
    const cv = {
      ...sampleParsedCv,
      full_name: "Juan Perez",
      email: "",
      phone: "",
      linkedin_url: "",
    };
    const result = checkContact(text, cv);
    // Email and phone should be detected from text
    expect(result.details.hasEmail).toBe(true);
    expect(result.details.hasPhone).toBe(true);
  });
});
