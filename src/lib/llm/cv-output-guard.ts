/**
 * Safety helpers for streamed CV output from the LLM.
 *
 * - `findPlaceholderViolation` scans accumulated content for known placeholder patterns
 *   (`[Replace with...]`, `[Your X]`, `(TBD)`, `John Doe`, etc.). If the LLM ever produces
 *   one we abort the stream — these patterns indicate the model is hallucinating instead
 *   of working from real CV data.
 *
 * - `splitNotesAndCv` parses the chat-refinement response, which is structured as:
 *
 *     <<<NOTES>>>
 *     ...assistant explanation / suggestions for the chat panel...
 *     <<<END NOTES>>>
 *     <<<CV>>>
 *     ...the updated CV markdown...
 *     <<<END CV>>>
 *
 *   Falls back gracefully if the model forgets the markers (treats whole text as the CV).
 */

const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\[\s*replace with\b/i, label: "[Replace with ...]" },
  { pattern: /\[\s*your\s+[a-z]/i, label: "[Your ...]" },
  { pattern: /\[\s*add\s+(?:your|a|an)\b/i, label: "[Add ...]" },
  { pattern: /\[\s*insert\s+/i, label: "[Insert ...]" },
  { pattern: /\[\s*tbd\s*\]/i, label: "[TBD]" },
  { pattern: /\[\s*example[: ]/i, label: "[Example: ...]" },
  { pattern: /\(\s*tbd\s*\)/i, label: "(TBD)" },
  { pattern: /\(\s*assumed\s*\)/i, label: "(assumed)" },
  { pattern: /\(\s*if applicable\s*\)/i, label: "(if applicable)" },
  { pattern: /\bjohn\s+doe\b/i, label: "John Doe" },
  { pattern: /\bjane\s+(?:smith|doe)\b/i, label: "Jane Smith / Jane Doe" },
  { pattern: /\bexample@(?:email|domain)\.com\b/i, label: "example@email.com" },
];

/**
 * Returns the label of the first placeholder pattern found, or null if the content is clean.
 * Skips checking until `minLength` chars have streamed (avoids false positives on partial markers);
 * pass 0 to check a complete short text.
 */
export function findPlaceholderViolation(content: string, minLength = 100): string | null {
  if (content.length < minLength) return null;
  for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
    if (pattern.test(content)) return label;
  }
  return null;
}

/**
 * Heuristic to detect runaway streams. Returns true when the LLM is clearly looping —
 * either because the output has grown well past a reasonable size relative to the input,
 * or because we exceeded an absolute ceiling.
 */
export function isRunaway(content: string, baselineLength: number): boolean {
  const ABSOLUTE_MAX = 32_000; // characters
  if (content.length > ABSOLUTE_MAX) return true;
  if (baselineLength > 200 && content.length > baselineLength * 3) return true;
  return false;
}

export interface CvPatch {
  /** Heading text to locate in the current CV (e.g. "Skills" or "Senior Engineer at Spotify"). Match is case-insensitive against any heading level. */
  section: string;
  /** Replacement body for that section (without the heading line itself). */
  body: string;
}

export interface ParsedRefinementResponse {
  /** The assistant message to surface in the chat panel. */
  notes: string;
  /** Section-scoped patches to apply to the current CV. Empty when the LLM emitted a full CV instead. */
  patches: CvPatch[];
  /** Full CV markdown to replace the current optimized CV. Empty when the LLM emitted patches instead. */
  cv: string;
  /** True when at least one of (full CV) or (one patch) is parseable. */
  wellFormed: boolean;
}

const NOTES_OPEN = /<<<\s*notes\s*>>>/i;
const NOTES_CLOSE = /<<<\s*end\s+notes\s*>>>/i;
const CV_OPEN = /<<<\s*cv\s*>>>/i;
const CV_CLOSE = /<<<\s*end\s+cv\s*>>>/i;
// Matches `<<<PATCH section="Skills">>>...<<<END PATCH>>>`. The section attribute may use
// double, single or typographic quotes; apostrophes inside a double-quoted value
// ("Bachelor's in CS") are fine. The body capture is lazily stopped at the first END
// PATCH, supporting multiple patches in one response. Groups: 1|2|3 = section, 4 = body.
const PATCH_BLOCK =
  /<<<\s*patch\s+section\s*=\s*(?:"([^"\n]+)"|'([^'\n]+)'|“([^”\n]+)”)\s*>>>([\s\S]*?)<<<\s*end\s+patch\s*>>>/gi;
const PATCH_OPEN_ANY = /<<<\s*patch\s+section\s*=\s*(?:"[^"\n]*"|'[^'\n]*'|“[^”\n]*”)\s*>>>/gi;

/**
 * Strips all marker tokens from a string, regardless of which ones are present.
 * Used to clean up partial streams (so the user doesn't see the markers in the diff while streaming).
 */
export function stripMarkers(content: string): string {
  return content
    .replace(NOTES_OPEN, "")
    .replace(NOTES_CLOSE, "")
    .replace(CV_OPEN, "")
    .replace(CV_CLOSE, "")
    .replace(PATCH_OPEN_ANY, "")
    .replace(/<<<\s*end\s+patch\s*>>>/gi, "")
    .trim();
}

/**
 * Removes the NOTES block (closed or still streaming) so content checks such as the
 * placeholder scan only look at CV text — an explanation mentioning "(if applicable)"
 * must not kill a refinement.
 */
export function stripNotesBlock(content: string): string {
  const open = content.match(NOTES_OPEN);
  if (!open) return content;
  const before = content.slice(0, open.index);
  const after = content.slice(open.index! + open[0].length);
  const close = after.match(NOTES_CLOSE);
  return before + (close ? after.slice(close.index! + close[0].length) : "");
}

/** Section names of the PATCH blocks opened so far in a (possibly partial) stream. */
export function extractPatchSectionsDuringStream(content: string): string[] {
  const names: string[] = [];
  const re = /<<<\s*patch\s+section\s*=\s*["'“]([^"'”\n>]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const name = m[1].trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * Extract just the CV portion from a (possibly partial) streaming response, for display
 * in the diff view while the LLM is still generating. If the CV block hasn't started yet,
 * returns an empty string.
 */
export function extractCvDuringStream(content: string): string {
  const cvOpenMatch = content.match(CV_OPEN);
  if (!cvOpenMatch) return "";
  const afterOpen = content.slice(cvOpenMatch.index! + cvOpenMatch[0].length);
  const closeMatch = afterOpen.match(CV_CLOSE);
  return (closeMatch ? afterOpen.slice(0, closeMatch.index) : afterOpen).trim();
}

export function splitNotesAndCv(content: string): ParsedRefinementResponse {
  const notesOpen = content.match(NOTES_OPEN);
  const notesClose = content.match(NOTES_CLOSE);
  const cvOpen = content.match(CV_OPEN);
  const cvClose = content.match(CV_CLOSE);

  let notes = "";
  if (notesOpen && notesClose && notesOpen.index! < notesClose.index!) {
    notes = content
      .slice(notesOpen.index! + notesOpen[0].length, notesClose.index)
      .trim();
  }

  const patches: CvPatch[] = [];
  // Reset regex state since it's stateful with the global flag.
  PATCH_BLOCK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATCH_BLOCK.exec(content)) !== null) {
    const section = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    const body = m[4].trim();
    if (section && body) patches.push({ section, body });
  }

  let cv = "";
  if (patches.length === 0) {
    if (cvOpen && cvClose && cvOpen.index! < cvClose.index!) {
      cv = content.slice(cvOpen.index! + cvOpen[0].length, cvClose.index).trim();
    } else if (cvOpen) {
      cv = content.slice(cvOpen.index! + cvOpen[0].length).trim();
    } else if (!notesOpen) {
      // Model ignored the format entirely; treat whole response as CV.
      cv = content.trim();
    }
  }

  // wellFormed = the LLM correctly produced markers as instructed. We tolerate
  // missing markers (treating the whole response as CV) but we surface this so the
  // caller can log a warning.
  const wellFormed =
    patches.length > 0 ||
    Boolean(notesOpen && notesClose && cvOpen && cvClose);

  return { notes, patches, cv, wellFormed };
}

/**
 * Apply section-scoped patches to a CV. Each patch identifies a section by its heading
 * text (case-, emphasis- and trailing-colon-insensitive; a unique prefix also matches).
 * The replaced range is the heading's body — everything from the line after the heading
 * up to the next heading at the same or higher level. When the target has child
 * headings (e.g. "Experience" with `###` roles) and the patch body contains no headings,
 * only the intro text before the first child is replaced, so the children survive.
 * Patches that don't match any heading are skipped and reported in `missing`.
 */
export function applyPatches(
  cv: string,
  patches: CvPatch[],
): { cv: string; missing: string[] } {
  const missing: string[] = [];
  let working = cv;
  for (const patch of patches) {
    const next = applyOnePatch(working, patch);
    if (next === null) {
      missing.push(patch.section);
    } else {
      working = next;
    }
  }
  return { cv: working, missing };
}

function normalizeHeadingForMatch(heading: string): string {
  return heading
    .replace(/^#+\s*/, "")
    .replace(/[*_`]/g, "")
    .replace(/[:：]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function applyOnePatch(cv: string, patch: CvPatch): string | null {
  const lines = cv.split("\n");
  const target = normalizeHeadingForMatch(patch.section);
  if (!target) return null;

  const headings: Array<{ index: number; level: number; norm: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) headings.push({ index: i, level: m[1].length, norm: normalizeHeadingForMatch(m[2]) });
  }

  let hit = headings.find((h) => h.norm === target);
  if (!hit && target.length >= 3) {
    const candidates = headings.filter((h) => h.norm.startsWith(target) || target.startsWith(h.norm));
    if (candidates.length === 1) hit = candidates[0];
  }
  if (!hit) return null;

  const startIdx = hit.index;
  const headingLevel = hit.level;
  let endIdx = lines.length;
  for (const h of headings) {
    if (h.index > startIdx && h.level <= headingLevel) {
      endIdx = h.index;
      break;
    }
  }

  // Patching a parent ("Experience") with a body that has no sub-headings would wipe
  // every role — replace only the intro text before the first child instead.
  const firstChild = headings.find(
    (h) => h.index > startIdx && h.index < endIdx && h.level > headingLevel,
  );
  if (firstChild && !/^#{1,6}\s+/m.test(patch.body)) {
    endIdx = firstChild.index;
  }

  const headingLine = lines[startIdx];
  const before = lines.slice(0, startIdx).join("\n").replace(/\s+$/, "");
  const after = lines.slice(endIdx).join("\n").replace(/^\s+/, "");
  const newBody = patch.body.trim();

  const parts: string[] = [];
  if (before) parts.push(before);
  parts.push(headingLine);
  if (newBody) parts.push(newBody);
  if (after) parts.push(after);
  return parts.join("\n\n").trim() + "\n";
}
