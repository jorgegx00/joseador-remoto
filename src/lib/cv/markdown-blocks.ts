/**
 * Minimal markdown tokenizer for CV documents.
 *
 * One block/inline model feeds every renderer — the in-app preview (React), the PDF and
 * DOCX exporters, and the plain-text view used by the ATS checks — so they all agree on
 * what the CV looks like. Deliberately small: CVs only use headings, paragraphs, bullet
 * lists, bold/italic and links. Never produces HTML strings.
 */

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Only set for links that passed `safeHref`. */
  href?: string;
}

export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; runs: InlineRun[] }
  /** Each entry of `lines` is one source line — CVs rely on hard line breaks (contact lines). */
  | { type: "paragraph"; lines: InlineRun[][] }
  | { type: "list"; ordered: boolean; items: Array<{ level: 0 | 1; runs: InlineRun[] }> }
  | { type: "rule" };

const MARKER_LINE = /^\s*<<<\s*(?:end\s+)?(?:cv|notes|patch\b[^>]*)\s*>>>\s*$/i;
// A closing "#" sequence must be preceded by whitespace, so "## Skills in C#" keeps its "#".
const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const LIST_ITEM = /^(\s*)([-*+•]|\d{1,2}[.)])\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BOLD_ONLY_LINE = /^\s*\*\*([^*]{2,80}?)\*\*:?\s*$/;

/**
 * Cleans up LLM/markdown noise before parsing: BOM, CRLF, chat markers, a code fence
 * wrapping the whole document, trailing spaces. When the document has no `#` headings at
 * all, bold-only lines ("**Experience**") are promoted to `##` headings so the structure
 * is still recoverable.
 */
export function normalizeCvMarkdown(md: string): string {
  let text = md.replace(/\r\n?/g, "\n");

  const lines = text.split("\n").filter((line) => !MARKER_LINE.test(line));
  text = lines.join("\n").trim();

  // Unwrap ```markdown ... ``` around the whole document.
  const fenced = text.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fenced) text = fenced[1].trim();

  let out = text.split("\n").map((line) => line.replace(/\s+$/, ""));

  const hasHeadings = out.some((line) => HEADING.test(line));
  if (!hasHeadings) {
    let first = true;
    out = out.map((line) => {
      const m = line.match(BOLD_ONLY_LINE);
      if (!m) return line;
      const heading = m[1].trim();
      const promoted = first ? `# ${heading}` : `## ${heading}`;
      first = false;
      return promoted;
    });
  }

  return out.join("\n") + "\n";
}

export function parseMarkdownBlocks(md: string): MdBlock[] {
  const lines = normalizeCvMarkdown(md).split("\n");
  const blocks: MdBlock[] = [];
  let paragraph: InlineRun[][] | null = null;
  let list: Extract<MdBlock, { type: "list" }> | null = null;
  let inFence = false;

  const flush = () => {
    if (paragraph && paragraph.length > 0) blocks.push({ type: "paragraph", lines: paragraph });
    if (list && list.items.length > 0) blocks.push(list);
    paragraph = null;
    list = null;
  };

  for (const raw of lines) {
    // Inner code fences: render their content as plain paragraph lines.
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (!raw.trim()) {
        flush();
        continue;
      }
      if (list) flush();
      paragraph ??= [];
      paragraph.push([{ text: raw.trim() }]);
      continue;
    }

    if (!raw.trim()) {
      flush();
      continue;
    }

    const heading = raw.match(HEADING);
    if (heading) {
      flush();
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, runs: parseInline(heading[2]) });
      continue;
    }

    if (RULE.test(raw)) {
      flush();
      blocks.push({ type: "rule" });
      continue;
    }

    const item = raw.match(LIST_ITEM);
    // "*2020 - Present*" is italic text, not a bullet: LIST_ITEM requires whitespace after the marker.
    if (item) {
      if (paragraph) {
        blocks.push({ type: "paragraph", lines: paragraph });
        paragraph = null;
      }
      const ordered = /\d/.test(item[2]);
      if (!list || list.ordered !== ordered) {
        if (list && list.items.length > 0) blocks.push(list);
        list = { type: "list", ordered, items: [] };
      }
      const indent = item[1].replace(/\t/g, "  ").length;
      list.items.push({ level: indent >= 2 ? 1 : 0, runs: parseInline(item[3].trim()) });
      continue;
    }

    const quote = raw.replace(/^\s*>\s?/, "");
    // Indented continuation of the previous bullet.
    if (list && /^\s{2,}\S/.test(raw) && list.items.length > 0) {
      const last = list.items[list.items.length - 1];
      last.runs = [...last.runs, { text: " " }, ...parseInline(quote.trim())];
      continue;
    }
    if (list) {
      blocks.push(list);
      list = null;
    }
    paragraph ??= [];
    paragraph.push(parseInline(quote.trim()));
  }
  flush();
  return blocks;
}

// Order matters: escapes, links, bold+italic, bold, italic, code, bare URLs.
const INLINE_TOKEN = new RegExp(
  [
    String.raw`\\([\\*_\x60\[\]()#+\-.!])`, // 1: escaped char
    // 2,3: [text](url) — one level of balanced parens so "alert(1)" is captured whole.
    String.raw`\[([^\]]+)\]\(\s*<?((?:[^()\s<>]|\([^()\s<>]*\))+)>?\s*\)`,
    String.raw`\*\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*\*`, // 4: ***bold italic***
    String.raw`\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*`, // 5: **bold**
    String.raw`__(?=\S)([\s\S]+?)(?<=\S)__`, // 6: __bold__
    String.raw`\*(?=[^\s*])([^*]+?)(?<=\S)\*`, // 7: *italic*
    String.raw`(?<![\p{L}\p{N}_])_(?=\S)([^_]+?)(?<=\S)_(?![\p{L}\p{N}_])`, // 8: _italic_
    String.raw`\x60([^\x60]+)\x60`, // 9: `code`
    String.raw`(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])`, // 10: bare URL
  ].join("|"),
  "gu",
);

/** Parses inline markdown into styled runs. Unknown/unsafe links degrade to plain text. */
export function parseInline(text: string, inherited: Omit<InlineRun, "text"> = {}): InlineRun[] {
  const runs: InlineRun[] = [];
  const push = (run: InlineRun) => {
    if (!run.text) return;
    const prev = runs[runs.length - 1];
    if (
      prev &&
      !!prev.bold === !!run.bold &&
      !!prev.italic === !!run.italic &&
      prev.href === run.href
    ) {
      prev.text += run.text;
    } else {
      runs.push(run);
    }
  };

  let last = 0;
  INLINE_TOKEN.lastIndex = 0;
  const re = new RegExp(INLINE_TOKEN.source, INLINE_TOKEN.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) push({ ...inherited, text: text.slice(last, m.index) });
    if (m[1] !== undefined) {
      push({ ...inherited, text: m[1] });
    } else if (m[2] !== undefined) {
      const href = safeHref(m[3]);
      for (const run of parseInline(m[2], inherited)) push(href ? { ...run, href } : run);
    } else if (m[4] !== undefined) {
      for (const run of parseInline(m[4], { ...inherited, bold: true, italic: true })) push(run);
    } else if (m[5] !== undefined || m[6] !== undefined) {
      for (const run of parseInline(m[5] ?? m[6], { ...inherited, bold: true })) push(run);
    } else if (m[7] !== undefined || m[8] !== undefined) {
      for (const run of parseInline(m[7] ?? m[8], { ...inherited, italic: true })) push(run);
    } else if (m[9] !== undefined) {
      push({ ...inherited, text: m[9] });
    } else if (m[10] !== undefined) {
      const href = safeHref(m[10]);
      push(href ? { ...inherited, text: m[10], href } : { ...inherited, text: m[10] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) push({ ...inherited, text: text.slice(last) });
  return runs;
}

/**
 * Returns a safe absolute URL for http(s)/mailto links, or undefined. Bare domains
 * ("linkedin.com/in/x", "www.site.dev") become https URLs; bare emails become mailto.
 * Anything else (javascript:, data:, file:, relative paths, quotes) is rejected.
 */
export function safeHref(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed || /[\s"'<>`\\]/.test(trimmed)) return undefined;
  if (/^https?:\/\/[^/]+\.[^/]+/i.test(trimmed)) return trimmed;
  if (/^mailto:[^@]+@[^@]+\.[a-z]{2,}$/i.test(trimmed)) return trimmed;
  if (/^[^@/:]+@[^@/:]+\.[a-z]{2,}$/i.test(trimmed)) return `mailto:${trimmed}`;
  if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/?#][^\s]*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return undefined;
}

export function runsToText(runs: InlineRun[]): string {
  return runs.map((r) => r.text).join("");
}

/**
 * Plain-text rendering (no markdown syntax). Links whose label differs from the URL keep
 * the URL in parentheses so contact checks can still find it.
 */
export function blocksToPlainText(blocks: MdBlock[]): string {
  // "https://www.x.dev/" and "x.dev" are the same link target for display purposes.
  const bareUrl = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/^mailto:/, "")
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");
  const runsPlain = (runs: InlineRun[]) =>
    runs
      .map((r) => {
        if (!r.href) return r.text;
        const bare = bareUrl(r.href);
        const text = bareUrl(r.text);
        return text === bare || text.includes(bare) ? r.text : `${r.text} (${r.href})`;
      })
      .join("");

  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        parts.push(runsPlain(block.runs));
        break;
      case "paragraph":
        parts.push(block.lines.map(runsPlain).join("\n"));
        break;
      case "list":
        parts.push(
          block.items
            .map((item, i) => {
              const bullet = block.ordered ? `${i + 1}.` : "-";
              return `${item.level === 1 ? "  " : ""}${bullet} ${runsPlain(item.runs)}`;
            })
            .join("\n"),
        );
        break;
      case "rule":
        break;
    }
  }
  return parts.join("\n\n").trim() + "\n";
}

export function markdownToPlainText(md: string): string {
  return blocksToPlainText(parseMarkdownBlocks(md));
}
