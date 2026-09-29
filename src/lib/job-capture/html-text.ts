/**
 * HTML → readable text for job descriptions from ATS APIs and JSON-LD, without a
 * DOM (works the same in the app and in tests). Output is text
 * only — nothing from the source is ever rendered as HTML.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  middot: "·",
  eacute: "é",
  aacute: "á",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  szlig: "ß",
  ccedil: "ç",
  atilde: "ã",
  otilde: "õ",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Zero-width and bidi control characters — a common way to hide injected text. */
export const INVISIBLE_CHARS = /[​-‏‪-‮⁠-⁤﻿]/g;

export function htmlToText(html: string): string {
  let s = html;
  // Greenhouse double-encodes its content ("&lt;p&gt;").
  if (!/<[a-z]/i.test(s) && /&lt;[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<h[1-6][^>]*>/gi, "\n\n## ")
    .replace(/<\/(h[1-6]|p|div|ul|ol|section|article|tr|table|blockquote)>/gi, "\n\n")
    .replace(/<\/(dt|dd)>/gi, "\n")
    // Inline markup vanishes without adding space ("<b>Go</b>." stays "Go.").
    .replace(/<\/?(b|i|u|em|strong|span|a|code|small|sup|sub|font|mark|abbr)\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s).replace(INVISIBLE_CHARS, "");
  return s
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/^## \s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
