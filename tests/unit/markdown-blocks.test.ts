import { describe, it, expect } from "vitest";
import {
  blocksToPlainText,
  markdownToPlainText,
  normalizeCvMarkdown,
  parseInline,
  parseMarkdownBlocks,
  runsToText,
  safeHref,
  type MdBlock,
} from "@/lib/cv/markdown-blocks";
import { formatCvAsMarkdown } from "@/lib/cv/formatCvAsMarkdown";
import { sampleParsedCv } from "../fixtures/sample-cv";

describe("parseMarkdownBlocks", () => {
  it("caps heading levels at 3", () => {
    const blocks = parseMarkdownBlocks("# One\n## Two\n### Three\n#### Four\n###### Six");
    expect(blocks.map((b) => (b.type === "heading" ? b.level : null))).toEqual([1, 2, 3, 3, 3]);
  });

  it("keeps a trailing # that belongs to the text (C#)", () => {
    const [h] = parseMarkdownBlocks("### Senior C#\n");
    expect(h).toMatchObject({ type: "heading" });
    expect(runsToText((h as Extract<MdBlock, { type: "heading" }>).runs)).toBe("Senior C#");
    const [closed] = parseMarkdownBlocks("## Skills ##\n");
    expect(runsToText((closed as Extract<MdBlock, { type: "heading" }>).runs)).toBe("Skills");
  });

  it("keeps hard line breaks inside paragraphs", () => {
    const [p] = parseMarkdownBlocks("a@b.com | 555-1234\nLinkedIn: linkedin.com/in/x\n\nNext");
    expect(p.type).toBe("paragraph");
    const lines = (p as Extract<MdBlock, { type: "paragraph" }>).lines.map(runsToText);
    expect(lines).toEqual(["a@b.com | 555-1234", "LinkedIn: linkedin.com/in/x"]);
  });

  it("parses nested list levels and ordered lists", () => {
    const blocks = parseMarkdownBlocks("- one\n  - nested\n- two\n\n1. first\n2. second");
    expect(blocks).toHaveLength(2);
    const [ul, ol] = blocks as Array<Extract<MdBlock, { type: "list" }>>;
    expect(ul.ordered).toBe(false);
    expect(ul.items.map((i) => [i.level, runsToText(i.runs)])).toEqual([
      [0, "one"],
      [1, "nested"],
      [0, "two"],
    ]);
    expect(ol.ordered).toBe(true);
    expect(ol.items.map((i) => runsToText(i.runs))).toEqual(["first", "second"]);
  });

  it("treats *2020 - Present* as italic text, not a list item", () => {
    const blocks = parseMarkdownBlocks("### Dev at X\n*2020 - Present* | Remote\n");
    expect(blocks[1].type).toBe("paragraph");
    const runs = (blocks[1] as Extract<MdBlock, { type: "paragraph" }>).lines[0];
    expect(runs[0]).toEqual({ text: "2020 - Present", italic: true });
    expect(runs[1]).toEqual({ text: " | Remote" });
  });

  it("promotes bold-only lines to headings only when there are no # headings", () => {
    expect(normalizeCvMarkdown("**Juan**\n\n**Experience**\ntext")).toBe(
      "# Juan\n\n## Experience\ntext\n",
    );
    expect(normalizeCvMarkdown("# Juan\n\n**Experience**\n")).toBe("# Juan\n\n**Experience**\n");
  });

  it("strips CRLF, chat markers and a wrapping code fence", () => {
    expect(normalizeCvMarkdown("<<<CV>>>\r\n```markdown\r\n# A\r\n```\r\n<<<END CV>>>")).toBe("# A\n");
  });
});

describe("parseInline", () => {
  it("parses bold, italic and bold-italic", () => {
    expect(parseInline("***x***")).toEqual([{ text: "x", bold: true, italic: true }]);
    expect(parseInline("**x**")).toEqual([{ text: "x", bold: true }]);
    expect(parseInline("*x*")).toEqual([{ text: "x", italic: true }]);
    expect(parseInline("_x_")).toEqual([{ text: "x", italic: true }]);
    expect(parseInline("a **b** c")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " c" },
    ]);
  });

  it("leaves snake_case words plain", () => {
    expect(parseInline("use snake_case_word here")).toEqual([{ text: "use snake_case_word here" }]);
  });

  it("honors backslash escapes", () => {
    expect(parseInline("5 \\* 3 \\*not italic\\*")).toEqual([{ text: "5 * 3 *not italic*" }]);
  });

  it("drops unsafe link targets", () => {
    const js = parseInline("[a](javascript:alert(1))");
    expect(js.every((r) => !r.href)).toBe(true);
    expect(runsToText(js)).toBe("a");
    const quoted = parseInline('[a](x" onmouseover="y)');
    expect(quoted.every((r) => !r.href)).toBe(true);
  });

  it("keeps safe links and bare URLs", () => {
    expect(parseInline("[site](https://juan.dev)")).toEqual([
      { text: "site", href: "https://juan.dev" },
    ]);
    expect(parseInline("see https://juan.dev.")).toEqual([
      { text: "see " },
      { text: "https://juan.dev", href: "https://juan.dev" },
      { text: "." },
    ]);
    expect(parseInline("[wiki](https://en.wikipedia.org/wiki/Foo_(bar))")[0].href).toBe(
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    );
  });
});

describe("safeHref", () => {
  it("normalizes bare domains, emails and rejects dangerous schemes", () => {
    expect(safeHref("linkedin.com/in/x")).toBe("https://linkedin.com/in/x");
    expect(safeHref("www.site.dev")).toBe("https://www.site.dev");
    expect(safeHref("juan@example.com")).toBe("mailto:juan@example.com");
    expect(safeHref("mailto:juan@example.com")).toBe("mailto:juan@example.com");
    expect(safeHref("https://x.com/a")).toBe("https://x.com/a");
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,hi")).toBeUndefined();
    expect(safeHref("file:///etc/passwd")).toBeUndefined();
    expect(safeHref('x" onmouseover="y')).toBeUndefined();
    expect(safeHref("")).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
  });
});

describe("blocksToPlainText / markdownToPlainText", () => {
  it("removes markdown syntax", () => {
    const text = markdownToPlainText(formatCvAsMarkdown(sampleParsedCv));
    expect(text).not.toMatch(/^#/m);
    expect(text).not.toContain("**");
    expect(text).toContain("Juan Perez");
    expect(text).toContain("Technical Skills: JavaScript");
    expect(text).toContain("- Reduced API response time");
    expect(text).toContain("January 2021 - Present | Santo Domingo, DR");
  });

  it("keeps link targets that differ from the label", () => {
    const blocks = parseMarkdownBlocks(
      "[LinkedIn](https://linkedin.com/in/x) | [x](https://x.com) | [juan.dev](https://www.juan.dev/)",
    );
    expect(blocksToPlainText(blocks)).toBe(
      "LinkedIn (https://linkedin.com/in/x) | x (https://x.com) | juan.dev\n",
    );
  });

  it("numbers ordered lists and indents nested items", () => {
    expect(markdownToPlainText("1. a\n2. b\n\n- c\n  - d")).toBe("1. a\n2. b\n\n- c\n  - d\n");
  });
});
