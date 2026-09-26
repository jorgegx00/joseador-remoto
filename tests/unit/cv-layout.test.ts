import { describe, it, expect } from "vitest";
import { buildCvLines, findGutter, renderCvLines, type TextItem } from "../../sidecar/src/parsers/layout";
import { extractStructuredCv } from "../../sidecar/src/parsers/cv-extractor";
import { htmlToCvLines } from "../../sidecar/src/parsers/docx";
import type { CvLine } from "../../sidecar/src/types";
import resumeLines from "../fixtures/cv-layout/sample-resume.lines.json";

function item(str: string, x: number, y: number, opts: Partial<TextItem> = {}): TextItem {
  return { str, x, y, width: str.length * 5, fontSize: 10, bold: false, ...opts };
}

describe("buildCvLines", () => {
  it("orders lines top to bottom even when the header is drawn last", () => {
    const lines = buildCvLines([
      {
        width: 600,
        height: 800,
        items: [item("Experience", 30, 700, { fontSize: 11 }), item("Jane Doe", 30, 760, { fontSize: 16 })],
      },
    ]);
    expect(lines.map((l) => l.text)).toEqual(["Jane Doe", "Experience"]);
    expect(lines[0].size).toBeGreaterThan(1.3);
  });

  it("merges wrapped lines and marks indentation and bullets", () => {
    const long = "Configured the shared build cache so that every nightly pipeline could reuse"; // reaches the margin
    const lines = buildCvLines([
      {
        width: 600,
        height: 800,
        items: [
          item("Acme | Remote", 30, 700),
          item(long, 45, 688, { width: 520 }),
          item("artifacts.", 45, 676),
          item("• Built APIs.", 45, 664),
          item("Another bullet that is quite long and reaches the right margin of the page", 45, 652, { width: 520 }),
        ],
      },
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      "Acme | Remote",
      `${long} artifacts.`,
      "Built APIs.",
      "Another bullet that is quite long and reaches the right margin of the page",
    ]);
    expect(lines[1].indent).toBe(1);
    expect(lines[2].bullet).toBe(true);
  });

  it("reads a sidebar layout column by column", () => {
    const items: TextItem[] = [];
    for (let i = 0; i < 15; i++) {
      items.push(item(`Skill ${i}`, 20, 700 - i * 12, { width: 100 }));
      items.push(item(`Main column sentence number ${i} with enough text`, 220, 700 - i * 12, { width: 330 }));
    }
    expect(findGutter(items, 600)).not.toBeNull();
    const lines = buildCvLines([{ width: 600, height: 800, items }]);
    expect(lines[0].text).toBe("Skill 0");
    expect(lines[14].text).toBe("Skill 14");
    expect(lines[15].text).toMatch(/^Main column sentence number 0/);
  });

  it("drops page markers", () => {
    const lines = buildCvLines([
      { width: 600, height: 800, items: [item("Summary", 30, 700), item("-- 1 of 2 --", 280, 20)] },
    ]);
    expect(lines.map((l) => l.text)).toEqual(["Summary"]);
  });
});

describe("extractStructuredCv with layout", () => {
  const lines = resumeLines as CvLine[];
  const parsed = extractStructuredCv(renderCvLines(lines), lines);

  it("finds the name and contact details at the top", () => {
    expect(parsed.full_name).toBe("Daniela Ortiz Vega");
    expect(parsed.email).toBe("daniela@example.com");
    expect(parsed.location).toBe("Austin, TX");
  });

  it("splits Company | Location + Title | dates entries", () => {
    expect(parsed.experience).toHaveLength(7);
    expect(parsed.experience[0]).toMatchObject({
      title: "Senior Software Engineer",
      company: "Northwind Logistics",
      location: "Remote",
      start_date: "08/2024",
      end_date: null,
    });
    expect(parsed.experience[0].achievements).toHaveLength(4);
    expect(parsed.experience[0].achievements[2]).toMatch(/delivery data\.$/);
    expect(parsed.experience[1]).toMatchObject({ title: "Java Backend Developer", company: "Bluefin Retail" });
    expect(parsed.experience[1].achievements).toHaveLength(8);
    expect(parsed.experience[3]).toMatchObject({
      title: "Programmer Analyst & Lead",
      company: "Diario del Norte",
      location: "Monterrey, Mexico",
    });
    expect(parsed.experience[6]).toMatchObject({ title: "Junior Programmer", company: "Quartz Labs" });
  });

  it("parses education and a plain language list", () => {
    expect(parsed.education[0]).toMatchObject({
      institution: "Colegio Técnico San Marcos",
      location: "Monterrey, Mexico",
    });
    expect(parsed.languages.map((l) => l.name)).toEqual(["English", "Spanish", "Portuguese", "Italian"]);
    expect(parsed.skills.soft).toEqual([]);
    expect(parsed.skills.technical).toContain("C/C++");
  });
});

describe("htmlToCvLines", () => {
  it("maps headings, bold paragraphs, list items and table rows", () => {
    const lines = htmlToCvLines(
      "<h1>Jane Doe</h1><p><strong>Experience</strong></p><table><tr><td><p>Acme</p></td><td><p>2020 - 2022</p></td></tr></table><ul><li>Built &amp; shipped APIs</li></ul>",
    );
    expect(lines.map((l) => l.text)).toEqual(["Jane Doe", "Experience", "Acme | 2020 - 2022", "Built & shipped APIs"]);
    expect(lines[0].size).toBeGreaterThan(1.3);
    expect(lines[1].bold).toBe(true);
    expect(lines[3]).toMatchObject({ bullet: true, indent: 1 });
  });
});
