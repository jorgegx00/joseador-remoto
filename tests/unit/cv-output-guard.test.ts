import { describe, it, expect } from "vitest";
import {
  findPlaceholderViolation,
  isRunaway,
  splitNotesAndCv,
  stripForbiddenPersonalData,
  extractCvDuringStream,
  applyPatches,
  stripNotesBlock,
  extractPatchSectionsDuringStream,
} from "@/lib/llm/cv-output-guard";

const SAMPLE_CV = `# Jorge Paniagua Rosario
jorge@example.com | (407) 555-1234

## Professional Summary

Original summary text here.

## Skills

**Technical Skills:** Java, Kotlin
**Soft Skills:** Communication

## Experience

### Senior Backend Engineer at Spotify
*2020-01 - Present*

- Built things.
- Did stuff.

### Backend Developer at Acme
*2018-01 - 2019-12*

- Wrote code.

## Education

### B.S. in Computer Science
*State University*
`;

describe("findPlaceholderViolation", () => {
  it("returns null for clean CV content", () => {
    const clean = "# Jorge Paniagua Rosario\njorge@example.com\n\n## Professional Summary\n\nReal content here.";
    expect(findPlaceholderViolation(clean.padEnd(150, " "))).toBeNull();
  });

  it("ignores violations under 100 chars (avoids partial-stream false positives)", () => {
    expect(findPlaceholderViolation("[Replace with name]")).toBeNull();
  });

  it("detects [Replace with X]", () => {
    const dirty = "x".repeat(120) + "\nLanguages: [Replace with any languages you speak]";
    expect(findPlaceholderViolation(dirty)).toBe("[Replace with ...]");
  });

  it("detects [Your X]", () => {
    const dirty = "x".repeat(120) + "\nGitHub: [Your GitHub URL]";
    expect(findPlaceholderViolation(dirty)).toBe("[Your ...]");
  });

  it("detects [Add your]", () => {
    const dirty = "x".repeat(120) + "\n[Add your portfolio link here]";
    expect(findPlaceholderViolation(dirty)).toBe("[Add ...]");
  });

  it("detects (TBD)", () => {
    const dirty = "x".repeat(120) + "\nDates: 2020 - (TBD)";
    expect(findPlaceholderViolation(dirty)).toBe("(TBD)");
  });

  it("detects John Doe", () => {
    const dirty = "x".repeat(120) + "\n# John Doe\njohn@example.com";
    expect(findPlaceholderViolation(dirty)).toBe("John Doe");
  });
});

describe("isRunaway", () => {
  it("flags content >3x baseline", () => {
    expect(isRunaway("x".repeat(3001), 1000)).toBe(true);
  });

  it("doesn't flag content roughly the same size", () => {
    expect(isRunaway("x".repeat(1500), 1000)).toBe(false);
  });

  it("flags content past absolute ceiling regardless of baseline", () => {
    expect(isRunaway("x".repeat(35_000), 100_000)).toBe(true);
  });

  it("doesn't flag tiny baselines (early stream protection)", () => {
    expect(isRunaway("x".repeat(500), 50)).toBe(false);
  });
});

describe("splitNotesAndCv", () => {
  it("parses well-formed response", () => {
    const input = `<<<NOTES>>>
Shortened the summary as requested.
<<<END NOTES>>>
<<<CV>>>
# Jorge Paniagua Rosario

## Professional Summary

Senior Backend Engineer.
<<<END CV>>>`;
    const result = splitNotesAndCv(input);
    expect(result.wellFormed).toBe(true);
    expect(result.notes).toBe("Shortened the summary as requested.");
    expect(result.cv).toContain("# Jorge Paniagua Rosario");
    expect(result.cv).not.toContain("<<<");
  });

  it("treats whole response as CV when markers are missing", () => {
    const input = "# Jorge\n\n## Summary\n\nText.";
    const result = splitNotesAndCv(input);
    expect(result.wellFormed).toBe(false);
    expect(result.notes).toBe("");
    expect(result.cv).toBe(input.trim());
  });

  it("recovers when only NOTES is missing", () => {
    const input = `<<<CV>>>
# Jorge
<<<END CV>>>`;
    const result = splitNotesAndCv(input);
    expect(result.wellFormed).toBe(false);
    expect(result.cv).toBe("# Jorge");
  });

  it("recovers when stream cuts off before END CV", () => {
    const input = `<<<NOTES>>>
ok
<<<END NOTES>>>
<<<CV>>>
# Jorge

## Summary`;
    const result = splitNotesAndCv(input);
    expect(result.notes).toBe("ok");
    expect(result.cv).toBe("# Jorge\n\n## Summary");
  });
});

describe("extractCvDuringStream", () => {
  it("returns empty before CV block opens", () => {
    expect(extractCvDuringStream("<<<NOTES>>>\nok")).toBe("");
  });

  it("returns CV portion mid-stream", () => {
    expect(extractCvDuringStream("<<<NOTES>>>\nok\n<<<END NOTES>>>\n<<<CV>>>\n# Jorge")).toBe("# Jorge");
  });

  it("returns CV without trailing END marker", () => {
    expect(extractCvDuringStream("<<<CV>>>\n# Jorge\n<<<END CV>>>")).toBe("# Jorge");
  });
});

describe("splitNotesAndCv with patches", () => {
  it("parses a single patch block", () => {
    const input = `<<<NOTES>>>
Shortened the summary.
<<<END NOTES>>>
<<<PATCH section="Professional Summary">>>
New shorter summary.
<<<END PATCH>>>`;
    const result = splitNotesAndCv(input);
    expect(result.notes).toBe("Shortened the summary.");
    expect(result.patches).toHaveLength(1);
    expect(result.patches[0]).toEqual({
      section: "Professional Summary",
      body: "New shorter summary.",
    });
    expect(result.cv).toBe("");
    expect(result.wellFormed).toBe(true);
  });

  it("parses multiple patch blocks", () => {
    const input = `<<<NOTES>>>
Two changes.
<<<END NOTES>>>
<<<PATCH section="Skills">>>
**Technical Skills:** Java, Kotlin, AWS
<<<END PATCH>>>
<<<PATCH section="Senior Backend Engineer at Spotify">>>
*2020-01 - Present*

- New bullet about AWS.
- Did stuff.
<<<END PATCH>>>`;
    const result = splitNotesAndCv(input);
    expect(result.patches).toHaveLength(2);
    expect(result.patches[0].section).toBe("Skills");
    expect(result.patches[1].section).toBe("Senior Backend Engineer at Spotify");
    expect(result.cv).toBe("");
  });

  it("falls back to CV block when no patches present", () => {
    const input = `<<<NOTES>>>
Full rewrite.
<<<END NOTES>>>
<<<CV>>>
# Jorge
## Summary
Text.
<<<END CV>>>`;
    const result = splitNotesAndCv(input);
    expect(result.patches).toHaveLength(0);
    expect(result.cv).toContain("# Jorge");
  });
});

describe("applyPatches", () => {
  it("replaces a top-level section body", () => {
    const { cv, missing } = applyPatches(SAMPLE_CV, [
      { section: "Professional Summary", body: "Brand new summary." },
    ]);
    expect(missing).toEqual([]);
    expect(cv).toContain("## Professional Summary");
    expect(cv).toContain("Brand new summary.");
    expect(cv).not.toContain("Original summary text here.");
    // Other sections preserved.
    expect(cv).toContain("**Technical Skills:** Java, Kotlin");
    expect(cv).toContain("Senior Backend Engineer at Spotify");
  });

  it("replaces a sub-section (### heading) without touching siblings", () => {
    const { cv, missing } = applyPatches(SAMPLE_CV, [
      {
        section: "Senior Backend Engineer at Spotify",
        body: "*2020-01 - Present*\n\n- Architected new platform.\n- Mentored team.",
      },
    ]);
    expect(missing).toEqual([]);
    expect(cv).toContain("Architected new platform.");
    expect(cv).not.toContain("- Built things.");
    // Sibling role preserved.
    expect(cv).toContain("Backend Developer at Acme");
    expect(cv).toContain("- Wrote code.");
    // Parent section heading preserved.
    expect(cv).toContain("## Experience");
  });

  it("section heading match is case-insensitive", () => {
    const { cv, missing } = applyPatches(SAMPLE_CV, [
      { section: "skills", body: "**Technical Skills:** New" },
    ]);
    expect(missing).toEqual([]);
    expect(cv).toContain("**Technical Skills:** New");
  });

  it("returns missing for sections that don't exist", () => {
    const { cv, missing } = applyPatches(SAMPLE_CV, [
      { section: "Made Up Section", body: "x" },
    ]);
    expect(missing).toEqual(["Made Up Section"]);
    expect(cv).toBe(SAMPLE_CV);
  });

  it("applies multiple patches sequentially", () => {
    const { cv, missing } = applyPatches(SAMPLE_CV, [
      { section: "Professional Summary", body: "S1" },
      { section: "Skills", body: "**Technical Skills:** S2" },
    ]);
    expect(missing).toEqual([]);
    expect(cv).toContain("S1");
    expect(cv).toContain("**Technical Skills:** S2");
  });

  it("preserves the heading line itself when replacing the body", () => {
    const { cv } = applyPatches(SAMPLE_CV, [
      { section: "Skills", body: "x" },
    ]);
    expect(cv.match(/^## Skills$/m)).not.toBeNull();
  });
});

describe("cv-output-guard — quoting, parent patches, NOTES", () => {
  it("parses a double-quoted section containing an apostrophe", () => {
    const res = splitNotesAndCv(
      `<<<NOTES>>>\nDone.\n<<<END NOTES>>>\n<<<PATCH section="Bachelor's in CS">>>\nbody\n<<<END PATCH>>>`,
    );
    expect(res.patches).toEqual([{ section: "Bachelor's in CS", body: "body" }]);
  });

  it("parses single and typographic quotes", () => {
    const res = splitNotesAndCv(
      `<<<PATCH section='Skills'>>>\na\n<<<END PATCH>>>\n<<<PATCH section=“Professional Summary”>>>\nb\n<<<END PATCH>>>`,
    );
    expect(res.patches.map((p) => p.section)).toEqual(["Skills", "Professional Summary"]);
  });

  it("patching a parent section without sub-headings keeps its roles", () => {
    const { cv, missing } = applyPatches(SAMPLE_CV, [
      { section: "Experience", body: "Intro paragraph." },
    ]);
    expect(missing).toEqual([]);
    expect(cv).toContain("Intro paragraph.");
    expect(cv).toContain("### Senior Backend Engineer at Spotify");
    expect(cv).toContain("### Backend Developer at Acme");
  });

  it("patching a parent section with sub-headings replaces the whole section", () => {
    const { cv } = applyPatches(SAMPLE_CV, [
      { section: "Experience", body: "### Only Role at X\n*2020 - Present*\n\n- One." },
    ]);
    expect(cv).toContain("### Only Role at X");
    expect(cv).not.toContain("Backend Developer at Acme");
    expect(cv).toContain("## Education");
  });

  it("matches headings ignoring emphasis, case and trailing colons", () => {
    const { missing } = applyPatches(SAMPLE_CV, [{ section: "**skills:**", body: "x" }]);
    expect(missing).toEqual([]);
  });

  it("stripNotesBlock removes closed and still-open NOTES", () => {
    expect(stripNotesBlock("<<<NOTES>>>\n(if applicable)\n<<<END NOTES>>>\nCV")).toBe("\nCV");
    expect(stripNotesBlock("<<<NOTES>>>\nstill writing (if applicable)")).toBe("");
    expect(findPlaceholderViolation(stripNotesBlock(`<<<NOTES>>>\n${"x".repeat(120)} (if applicable)\n<<<END NOTES>>>\n${"y".repeat(120)}`))).toBeNull();
  });

  it("extractPatchSectionsDuringStream lists opened patches", () => {
    expect(
      extractPatchSectionsDuringStream(`<<<PATCH section="Skills">>>\nx\n<<<END PATCH>>>\n<<<PATCH section="Summ`),
    ).toEqual(["Skills", "Summ"]);
  });
});


describe("stripForbiddenPersonalData", () => {
  const md = [
    "# Ana Pérez",
    "Santo Domingo, RD | ana@example.com | Cédula: 000-0000000-0",
    "**Fecha de nacimiento:** 01/01/1990",
    "Estado civil: Soltera",
    "",
    "## Experiencia",
    "- Built things",
  ].join("\n");

  it("removes personal fields a strict market forbids", () => {
    const { markdown, removed } = stripForbiddenPersonalData(md, {
      dateOfBirth: "omit",
      maritalStatus: "omit",
      nationalId: "omit",
    });
    expect(markdown).not.toMatch(/C[ée]dula|nacimiento|Estado civil/);
    expect(markdown).toContain("Santo Domingo, RD | ana@example.com");
    expect(markdown).toContain("## Experiencia");
    expect(removed).toHaveLength(3);
  });

  it("keeps if_requested fields when the job asks for them", () => {
    const { markdown } = stripForbiddenPersonalData(
      md,
      { dateOfBirth: "if_requested", maritalStatus: "if_requested", nationalId: "if_requested" },
      "Enviar CV con cédula y fecha de nacimiento",
    );
    expect(markdown).toContain("Cédula");
    expect(markdown).toContain("Fecha de nacimiento");
    expect(markdown).not.toContain("Estado civil");
  });

  it("keeps customary fields", () => {
    const { markdown } = stripForbiddenPersonalData(md, {
      dateOfBirth: "common",
      maritalStatus: "common",
      nationalId: "if_requested",
    });
    expect(markdown).toContain("Fecha de nacimiento");
    expect(markdown).not.toContain("Cédula");
  });
});
