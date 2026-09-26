import { describe, it, expect } from "vitest";
import type { z } from "zod";
import type { CvLayoutLine, ParsedCv } from "@/types/cv";
import { findDateRange } from "@/lib/cv/cv-claims";
import { buildParseLines, renderLines, sliceLines } from "@/lib/cv/llm-parse/lines";
import {
  heuristicSegmentation,
  normalizeSegmentation,
  segmentationProblems,
  segmentationWarnings,
  splitMergedEntries,
  type Segmentation,
} from "@/lib/cv/llm-parse/segment";
import { buildExperience, experienceProblems, type ExperienceEntry } from "@/lib/cv/llm-parse/extract";
import { parseLanguages, parseSkills } from "@/lib/cv/llm-parse/assemble";
import { parseCvWithLlm, type GenerateStructured } from "@/lib/cv/llm-parse";
import { StructuredOutputError } from "@/lib/llm/structured";
import resumeLines from "../fixtures/cv-layout/sample-resume.lines.json";

const layout = resumeLines as CvLayoutLine[];
const lines = buildParseLines("", layout);

const emptyCv: ParsedCv = {
  full_name: "",
  email: "",
  phone: "",
  location: "",
  linkedin_url: "",
  github_url: "",
  portfolio_url: "",
  summary: "",
  skills: { technical: [], soft: [] },
  experience: [],
  education: [],
  certifications: [],
  projects: [],
  languages: [],
};

describe("findDateRange", () => {
  it("keeps the CV's own format and detects current roles", () => {
    expect(findDateRange("Senior Engineer | 08/2024 - Present")).toEqual({
      text: "08/2024 - Present",
      start: "08/2024",
      end: null,
    });
    expect(findDateRange("Enero 2021 – Actualidad")).toMatchObject({ start: "Enero 2021", end: null });
    expect(findDateRange("Jan 2019 to Dec 2020")).toMatchObject({ start: "Jan 2019", end: "Dec 2020" });
    expect(findDateRange("Graduated 2019")).toMatchObject({ start: "2019", end: "2019" });
    expect(findDateRange("Led a team of 3 engineers")).toBeNull();
  });
});

describe("buildParseLines", () => {
  it("tags layout signals", () => {
    expect(lines[0]).toMatchObject({ n: 1, text: "Daniela Ortiz Vega", tags: ["BIG"] });
    const experience = lines.find((l) => l.text === "Experience");
    expect(experience?.tags).toContain("H");
    const dated = lines.find((l) => l.text.startsWith("Senior Software Engineer"));
    expect(dated?.tags).toContain("DATE");
    expect(renderLines(lines).split("\n")[0]).toBe("L01 [BIG] Daniela Ortiz Vega");
  });

  it("derives tags from markdown and joins hard-wrapped lines without layout", () => {
    const text = [
      "# Jane Doe",
      "## Experience",
      "### Backend Developer at Acme",
      "*03/2021 - Present*",
      "- Built payment APIs used by the checkout team across several",
      "  regions and currencies.",
    ].join("\n");
    const parsed = buildParseLines(text, null);
    expect(parsed.map((l) => l.text)).toEqual([
      "Jane Doe",
      "Experience",
      "Backend Developer at Acme",
      "03/2021 - Present",
      "Built payment APIs used by the checkout team across several regions and currencies.",
    ]);
    expect(parsed[1].tags).toContain("H");
    expect(parsed[4].tags).toContain("BULLET");
  });
});

describe("segmentation", () => {
  it("heuristic finds the sections and 7 jobs of the fixture", () => {
    const seg = heuristicSegmentation(lines);
    expect(seg.sections.map((s) => s.kind)).toEqual([
      "contact",
      "summary",
      "experience",
      "skills",
      "education",
      "languages",
    ]);
    expect(seg.sections[2].entries).toHaveLength(7);
    expect(segmentationProblems(seg, lines.length)).toEqual([]);
  });

  it("reports overlaps, bad ranges and missing entries", () => {
    const bad: Segmentation = {
      sections: [
        { kind: "contact", heading_line: null, start_line: 1, end_line: 5, entries: [] },
        { kind: "experience", heading_line: 4, start_line: 4, end_line: 90, entries: [] },
      ],
    };
    const problems = segmentationProblems(bad, lines.length);
    expect(problems.some((p) => p.includes("between 1 and"))).toBe(true);
    const overlapping: Segmentation = {
      sections: [
        { kind: "contact", heading_line: null, start_line: 1, end_line: 5, entries: [] },
        { kind: "experience", heading_line: 4, start_line: 4, end_line: 10, entries: [] },
      ],
    };
    const p2 = segmentationProblems(overlapping, lines.length);
    expect(p2.some((p) => p.includes("overlaps"))).toBe(true);
    expect(p2.some((p) => p.includes("split its lines"))).toBe(true);
  });

  it("splits entries that swallowed other dated jobs", () => {
    const seg = heuristicSegmentation(lines);
    const experience = seg.sections[2];
    const merged: Segmentation = {
      sections: seg.sections.map((s) =>
        s === experience
          ? {
              ...s,
              entries: [
                ...s.entries.slice(0, 4),
                { start_line: s.entries[4].start_line, end_line: s.entries[6].end_line },
              ],
            }
          : s,
      ),
    };
    expect(segmentationWarnings(merged, lines)).toHaveLength(1);
    const fixed = splitMergedEntries(merged, lines);
    expect(fixed.sections[2].entries).toEqual(experience.entries);
  });

  it("normalization closes gaps so every line belongs somewhere", () => {
    const seg = normalizeSegmentation(
      {
        sections: [
          {
            kind: "experience",
            heading_line: 6,
            start_line: 6,
            end_line: 20,
            entries: [
              { start_line: 8, end_line: 10 },
              { start_line: 13, end_line: 15 },
            ],
          },
        ],
      },
      lines,
    );
    expect(seg.sections[0]).toMatchObject({ kind: "contact", start_line: 1, end_line: 5 });
    expect(seg.sections[1].end_line).toBe(lines.length);
    expect(seg.sections[1].entries).toEqual([
      { start_line: 7, end_line: 12 },
      { start_line: 13, end_line: lines.length },
    ]);
  });
});

describe("experience extraction", () => {
  const entry = sliceLines(lines, 7, 12);
  const answer: ExperienceEntry = {
    title: "Senior Software Engineer",
    company: "Northwind Logistics",
    location: "Remote",
    dates: "08/2024 - Present",
    description_lines: [],
    achievement_lines: [9, 10, 11, 12],
    technologies: ["Java 21", "Spring Boot", "DynamoDB", "Kafka"],
  };

  it("accepts verbatim fields and rebuilds bullets from line numbers", () => {
    expect(experienceProblems(answer, entry)).toEqual([]);
    const exp = buildExperience(answer, entry);
    expect(exp).toMatchObject({ start_date: "08/2024", end_date: null, company: "Northwind Logistics" });
    expect(exp.achievements).toHaveLength(4);
    expect(exp.achievements[0]).toBe(lines[8].text);
    // Kafka is not in these lines: dropped instead of trusted.
    expect(exp.technologies).toEqual(["Java 21", "Spring Boot", "DynamoDB"]);
  });

  it("rejects paraphrased fields and ignores foreign line numbers", () => {
    const problems = experienceProblems({ ...answer, title: "Sr. Software Engineer" }, entry);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^title:/);
    const exp = buildExperience({ ...answer, achievement_lines: [3, 4] }, entry);
    expect(exp.achievements).toHaveLength(4);
  });

  it("keeps lines the model forgot to assign", () => {
    const exp = buildExperience({ ...answer, achievement_lines: [9] }, entry);
    expect(exp.achievements).toHaveLength(4);
  });
});

describe("deterministic sections", () => {
  it("splits skills keeping C/C++ and honouring soft labels", () => {
    const skills = parseSkills(
      buildParseLines("Java, C/C++, Spring Boot\nSoft skills: Leadership, Mentoring", null),
    );
    expect(skills.technical).toEqual(["Java", "C/C++", "Spring Boot"]);
    expect(skills.soft).toEqual(["Leadership", "Mentoring"]);
  });

  it("reads languages with and without levels", () => {
    const langs = parseLanguages(buildParseLines("English (Fluent), Spanish – Nativo, German B1", null));
    expect(langs.map((l) => [l.name, l.level])).toEqual([
      ["English", "fluent"],
      ["Spanish", "native"],
      ["German", "intermediate"],
    ]);
  });
});

/** Scripted model: answers each schema with the handler for its schemaName. */
function scriptedGenerate(handlers: Record<string, (prompt: string) => unknown>): GenerateStructured {
  return (async <S extends z.ZodType>(opts: {
    schema: S;
    schemaName: string;
    prompt: string;
    validate?: (value: z.infer<S>) => string[];
  }) => {
    const handler = handlers[opts.schemaName];
    if (!handler) throw new Error(`no handler for ${opts.schemaName}`);
    const value = opts.schema.parse(handler(opts.prompt)) as z.infer<S>;
    const problems = opts.validate?.(value) ?? [];
    if (problems.length) throw new StructuredOutputError(problems, value);
    return value;
  }) as GenerateStructured;
}

/** Line numbers present in an entry prompt ("L07 ..."). */
function promptLineNumbers(prompt: string): number[] {
  return [...prompt.matchAll(/^L(\d+)/gm)].map((m) => Number(m[1]));
}

describe("parseCvWithLlm", () => {
  const seg = heuristicSegmentation(lines);

  it("assembles a full ParsedCv from segment + entry answers", async () => {
    const progress: string[] = [];
    const { parsed, warnings } = await parseCvWithLlm(
      { rawText: "", layout, heuristic: emptyCv },
      {
        generate: scriptedGenerate({
          CvStructure: () => seg,
          CvContact: () => ({ full_name: "Daniela Ortiz Vega", location: "Austin, TX" }),
          CvJob: (prompt) => {
            const ns = promptLineNumbers(prompt);
            const [company, location] = lines[ns[0] - 1].text.split(" | ");
            const [title, dates] = lines[ns[1] - 1].text.split(" | ");
            return {
              title,
              company,
              location,
              dates,
              description_lines: [],
              achievement_lines: ns.slice(2),
              technologies: [],
            };
          },
          CvEducation: () => ({
            institution: "Colegio Técnico San Marcos",
            degree: "Technician",
            field: "Computer Systems",
            location: "Monterrey, Mexico",
            dates: "",
            honor_lines: [],
          }),
        }),
        onProgress: (p) => progress.push(p.step),
      },
    );
    expect(warnings).toEqual([]);
    expect(parsed.full_name).toBe("Daniela Ortiz Vega");
    expect(parsed.email).toBe("daniela@example.com");
    expect(parsed.experience).toHaveLength(7);
    expect(parsed.experience.map((e) => e.company)).toContain("Harbor Mutual Insurance");
    expect(parsed.experience[4]).toMatchObject({ title: "Junior Programmer", start_date: "11/2014", end_date: "12/2015" });
    expect(parsed.education[0].field).toBe("Computer Systems");
    expect(parsed.languages).toHaveLength(4);
    expect(parsed.skills.technical).toContain("Spring Boot");
    expect(parsed.summary).toMatch(/^Seasoned Backend Engineer/);
    expect(progress[0]).toBe("segmenting");
  });

  it("falls back to the heuristics when the model output is unusable", async () => {
    const heuristic: ParsedCv = {
      ...emptyCv,
      full_name: "Heuristic Name",
      experience: [
        {
          title: "Senior Software Engineer",
          company: "Northwind Logistics",
          location: "Remote",
          start_date: "08/2024",
          end_date: null,
          description: "",
          achievements: ["from heuristic"],
          technologies: [],
        },
      ],
    };
    const { parsed, warnings } = await parseCvWithLlm(
      { rawText: "", layout, heuristic },
      {
        generate: scriptedGenerate({
          CvStructure: () => ({ sections: [] }),
          CvContact: () => ({ full_name: "Somebody Else", location: "" }),
          CvJob: () => ({
            title: "Invented Title",
            company: "",
            location: "",
            dates: "",
            description_lines: [],
            achievement_lines: [],
            technologies: [],
          }),
          CvEducation: () => ({ institution: "", degree: "", field: "", location: "", dates: "", honor_lines: [] }),
        }),
      },
    );
    // Empty segmentation → heuristic segmentation; rejected entries → heuristic / raw lines.
    expect(warnings.length).toBeGreaterThan(0);
    expect(parsed.experience).toHaveLength(7);
    expect(parsed.experience[0].achievements).toEqual(["from heuristic"]);
    expect(parsed.full_name).toBe("Heuristic Name");
  });
});
