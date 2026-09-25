import { describe, it, expect } from "vitest";
import { sanitizeFileName } from "@/lib/files/sanitize-file-name";

describe("sanitizeFileName", () => {
  it("replaces reserved characters and collapses dashes/whitespace", () => {
    expect(sanitizeFileName('a<b>c:d"e/f\\g|h?i*j', "pdf")).toBe("a-b-c-d-e-f-g-h-i-j.pdf");
    expect(sanitizeFileName("Juan   Perez  -  CV", "pdf")).toBe("Juan Perez - CV.pdf");
    expect(sanitizeFileName("a // b", "md")).toBe("a - b.md");
    expect(sanitizeFileName("a -- b", "md")).toBe("a - b.md");
  });

  it("replaces control characters", () => {
    const withControls = `a${String.fromCharCode(0)}b${String.fromCharCode(9)}c${String.fromCharCode(31)}d`;
    expect(sanitizeFileName(withControls, "txt")).toBe("a-b-c-d.txt");
    expect(sanitizeFileName(`x${String.fromCharCode(127)}`, "txt")).toBe("x.txt");
  });

  it("trims spaces and trailing dots", () => {
    expect(sanitizeFileName("  report...  ", "pdf")).toBe("report.pdf");
    expect(sanitizeFileName("Acme Inc.", "docx")).toBe("Acme Inc.docx");
  });

  it("prefixes Windows reserved names", () => {
    expect(sanitizeFileName("CON", "pdf")).toBe("_CON.pdf");
    expect(sanitizeFileName("nul", "pdf")).toBe("_nul.pdf");
    expect(sanitizeFileName("com1", "md")).toBe("_com1.md");
    expect(sanitizeFileName("LPT9", "md")).toBe("_LPT9.md");
    expect(sanitizeFileName("nul.txt")).toBe("_nul.txt");
    expect(sanitizeFileName("nul.txt", "txt")).toBe("_nul.txt");
    expect(sanitizeFileName("console", "pdf")).toBe("console.pdf");
    expect(sanitizeFileName("com10", "pdf")).toBe("com10.pdf");
  });

  it("keeps accents, en dash and @", () => {
    expect(sanitizeFileName("José Núñez – CV @ Acmé", "pdf")).toBe("José Núñez – CV @ Acmé.pdf");
  });

  it("does not double the extension (case-insensitive)", () => {
    expect(sanitizeFileName("cv.pdf", "pdf")).toBe("cv.pdf");
    expect(sanitizeFileName("cv.PDF", "pdf")).toBe("cv.pdf");
    expect(sanitizeFileName("cv.docx", "pdf")).toBe("cv.docx.pdf");
    expect(sanitizeFileName("cv", ".pdf")).toBe("cv.pdf");
    expect(sanitizeFileName("notes.md")).toBe("notes.md");
  });

  it("falls back when empty", () => {
    expect(sanitizeFileName("", "pdf")).toBe("cv.pdf");
    expect(sanitizeFileName("   ", "pdf")).toBe("cv.pdf");
    expect(sanitizeFileName("???", "docx")).toBe("cv.docx");
    expect(sanitizeFileName("", "pdf", "CV")).toBe("CV.pdf");
    expect(sanitizeFileName("")).toBe("cv");
  });

  it("caps the total length at 150 including the extension", () => {
    const long = "x".repeat(400);
    const out = sanitizeFileName(long, "docx");
    expect(out.length).toBe(150);
    expect(out.endsWith(".docx")).toBe(true);
    expect(sanitizeFileName("y".repeat(400)).length).toBe(150);
    // Truncation never leaves a trailing space/dot before the extension.
    const spaced = `${"a".repeat(145)} . b`;
    expect(sanitizeFileName(spaced, "pdf")).toBe(`${"a".repeat(145)}.pdf`);
  });
});
