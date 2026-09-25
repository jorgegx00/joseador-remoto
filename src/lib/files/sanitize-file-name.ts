/**
 * Makes a string safe to use as a file name on Windows, macOS and Linux while keeping it
 * human-readable (accents, "–" and "@" are preserved).
 */

const MAX_LENGTH = 150;
const INVALID_CHARS = /[<>:"/\\|?*]/g;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function replaceControlChars(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? "-" : ch;
  }
  return out;
}

function tidy(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/-(?:\s*-)+/g, "-")
    .replace(/^[\s-]+/, "")
    .replace(/[\s.-]+$/, "");
}

export function sanitizeFileName(name: string, ext?: string, fallback = "cv"): string {
  const cleanExt = replaceControlChars(ext ?? "")
    .replace(INVALID_CHARS, "")
    .replace(/\s+/g, "")
    .replace(/^\.+/, "");

  let base = replaceControlChars(String(name ?? "")).replace(INVALID_CHARS, "-");
  base = tidy(base);

  // Never double the extension ("cv.pdf" + "pdf" → "cv.pdf"), case-insensitively.
  if (cleanExt && base.toLowerCase().endsWith(`.${cleanExt.toLowerCase()}`)) {
    base = tidy(base.slice(0, -(cleanExt.length + 1)));
  }

  if (!base) base = tidy(replaceControlChars(fallback).replace(INVALID_CHARS, "-")) || "file";
  if (WINDOWS_RESERVED.test(base)) base = `_${base}`;

  const suffix = cleanExt ? `.${cleanExt}` : "";
  const maxBase = Math.max(1, MAX_LENGTH - suffix.length);
  const chars = Array.from(base);
  if (chars.length > maxBase) base = tidy(chars.slice(0, maxBase).join("")) || "_";

  return `${base}${suffix}`;
}
