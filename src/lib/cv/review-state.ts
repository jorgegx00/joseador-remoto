/**
 * State engine for the "review optimized CV" screen: one row per aligned section/role,
 * each with a status (AI version applied by default, original kept, user edit, removed),
 * plus undo/redo history and short "why did this change" explanations.
 * Everything here is pure — the reducer never mutates its input.
 */

import { alignCv, composeCv, weaveRows, type AlignedRow } from "./cv-sections";
import { containsSkill } from "./cv-claims";
import { diffWords } from "./word-diff";

export type RowStatus = "unchanged" | "ai" | "original" | "edited" | "removed";

export interface ReviewRow extends AlignedRow {
  status: RowStatus;
  /** User-edited body (status "edited"). */
  edited: string | null;
  /** A previous user edit set aside (by a refinement or by choosing AI/original); see "restoreEdit". */
  stashedEdit: string | null;
  reviewed: boolean;
  /** Heading line chosen by the user (full-markdown edits or edits of a kept-original row). */
  headingOverride: string | null;
}

export interface ReviewState {
  rows: ReviewRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function norm(s: string | null | undefined): string | null {
  return s == null ? null : s.replace(/\s+/g, " ").trim();
}

/** Whitespace-insensitive equality; null only equals null. */
export function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return norm(a) === norm(b);
}

/** True when the AI proposal differs from the original (body or heading, whitespace-insensitive). */
export function rowDiffers(row: AlignedRow): boolean {
  return !(sameText(row.original, row.proposed) && sameText(row.originalHeading, row.proposedHeading));
}

function toReviewRow(row: AlignedRow): ReviewRow {
  return {
    ...row,
    status: rowDiffers(row) ? "ai" : "unchanged",
    edited: null,
    stashedEdit: null,
    reviewed: false,
    headingOverride: null,
  };
}

/** The edit to set aside when leaving the "edited" status. */
function stashOf(row: ReviewRow): string | null {
  return row.status === "edited" && row.edited !== null ? row.edited : row.stashedEdit;
}

// ---------------------------------------------------------------------------
// Construction & final output
// ---------------------------------------------------------------------------

/**
 * Initial review state: "unchanged" rows where the proposal equals the original,
 * otherwise "ai" (AI version applied). Rows the AI dropped (proposed null) stay as "ai"
 * — omitted from the final CV — so the user can still keep the original.
 */
export function createReviewState(originalMd: string, proposedMd: string): ReviewState {
  return { rows: alignCv(originalMd, proposedMd).map(toReviewRow) };
}

export function rowFinalHeading(row: ReviewRow): string | null {
  switch (row.status) {
    case "removed":
      return null;
    case "original":
      return row.original === null ? null : row.originalHeading;
    case "edited":
      return row.headingOverride ?? row.proposedHeading ?? row.originalHeading;
    case "ai":
      return row.proposed === null ? null : (row.headingOverride ?? row.proposedHeading);
    case "unchanged":
      return row.proposed !== null ? row.proposedHeading : row.originalHeading;
  }
}

export function rowFinalBody(row: ReviewRow): string | null {
  switch (row.status) {
    case "edited":
      return row.edited;
    case "original":
      return row.original;
    case "ai":
      return row.proposed;
    case "unchanged":
      return row.proposed ?? row.original;
    case "removed":
      return null;
  }
}

/**
 * Final markdown. Absent rows are skipped; a section whose own final version is absent
 * but that still has present subsections keeps its heading so the structure holds.
 */
export function composeFinal(state: ReviewState): string {
  const rows = state.rows;
  const finals = rows.map((r) => ({ heading: rowFinalHeading(r), body: rowFinalBody(r) }));
  const parts = rows.map((row, i) => {
    const { heading, body } = finals[i];
    if (body !== null) return { headingLine: heading, body };
    const hasChild =
      row.kind !== "subsection" &&
      rows.some((c, j) => c.parentId === row.id && finals[j].body !== null);
    if (!hasChild) return { headingLine: null, body: null };
    return { headingLine: heading ?? row.proposedHeading ?? row.originalHeading, body: null };
  });
  return composeCv(parts);
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type ReviewAction =
  | { type: "keepOriginal"; id: string }
  | { type: "restoreAi"; id: string }
  | { type: "edit"; id: string; text: string }
  | { type: "restoreEdit"; id: string }
  | { type: "markReviewed"; id: string; reviewed?: boolean }
  | { type: "revertAll" }
  | { type: "restoreAllAi" }
  | { type: "mergeRefined"; draftMd: string }
  | { type: "applyFullMarkdown"; md: string };

/** Moves a row to the AI or original version (collapses to "unchanged" when they are equal). */
function choose(row: ReviewRow, target: "ai" | "original", markReviewed: boolean): ReviewRow {
  const status: RowStatus = rowDiffers(row) ? target : "unchanged";
  const reviewed = markReviewed ? true : row.reviewed;
  if (row.status === status && row.edited === null && row.headingOverride === null && row.reviewed === reviewed) {
    return row;
  }
  return {
    ...row,
    status,
    edited: null,
    headingOverride: null,
    stashedEdit: stashOf(row),
    reviewed,
  };
}

/**
 * Applies user text (and the heading it should carry) to a row: equal to the AI version →
 * "ai", equal to the original → "original", otherwise "edited".
 */
function resolveEdit(row: ReviewRow, text: string, heading: string | null): ReviewRow {
  const base = { ...row, reviewed: true };
  const headingOk = (h: string | null) => heading === null || sameText(heading, h);
  if (row.proposed !== null && sameText(text, row.proposed) && headingOk(row.proposedHeading)) {
    return { ...base, status: rowDiffers(row) ? "ai" : "unchanged", edited: null, headingOverride: null };
  }
  if (row.original !== null && sameText(text, row.original) && headingOk(row.originalHeading)) {
    return { ...base, status: rowDiffers(row) ? "original" : "unchanged", edited: null, headingOverride: null };
  }
  const defaultHeading = row.proposedHeading ?? row.originalHeading;
  return {
    ...base,
    status: "edited",
    edited: text,
    headingOverride: heading !== null && !sameText(heading, defaultHeading) ? heading : null,
  };
}

function updateRow(
  state: ReviewState,
  id: string,
  fn: (row: ReviewRow) => ReviewRow,
): ReviewState {
  const idx = state.rows.findIndex((r) => r.id === id);
  if (idx < 0) return state;
  const next = fn(state.rows[idx]);
  if (next === state.rows[idx]) return state;
  const rows = state.rows.slice();
  rows[idx] = next;
  return { rows };
}

/**
 * keepOriginal / restoreAi on a section that exists on only one side (AI-added or
 * AI-dropped) cascade to its subsections missing on that same side, so rejecting a new
 * "## Projects" also rejects its projects.
 */
function chooseWithCascade(state: ReviewState, id: string, target: "ai" | "original"): ReviewState {
  const parent = state.rows.find((r) => r.id === id);
  if (!parent) return state;
  const oneSided = parent.original === null || parent.proposed === null;
  let changed = false;
  const rows = state.rows.map((row) => {
    let next = row;
    if (row.id === id) next = choose(row, target, true);
    else if (
      oneSided &&
      parent.kind !== "subsection" &&
      row.parentId === id &&
      ((parent.original === null && row.original === null) ||
        (parent.proposed === null && row.proposed === null))
    ) {
      next = choose(row, target, true);
    }
    if (next !== row) changed = true;
    return next;
  });
  return changed ? { rows } : state;
}

function mapRows(state: ReviewState, fn: (row: ReviewRow) => ReviewRow): ReviewState {
  let changed = false;
  const rows = state.rows.map((row) => {
    const next = fn(row);
    if (next !== row) changed = true;
    return next;
  });
  return changed ? { rows } : state;
}

export function reviewReducer(
  state: ReviewState,
  action: ReviewAction,
  originalMd: string,
): ReviewState {
  switch (action.type) {
    case "keepOriginal":
      return chooseWithCascade(state, action.id, "original");
    case "restoreAi":
      return chooseWithCascade(state, action.id, "ai");
    case "edit":
      return updateRow(state, action.id, (row) => ({
        ...resolveEdit(row, action.text, rowFinalHeading(row)),
        stashedEdit: null,
      }));
    case "restoreEdit":
      return updateRow(state, action.id, (row) => {
        if (row.stashedEdit === null) return row;
        return {
          ...row,
          status: "edited",
          edited: row.stashedEdit,
          stashedEdit: row.status === "edited" ? row.edited : null,
          reviewed: true,
        };
      });
    case "markReviewed": {
      const reviewed = action.reviewed ?? true;
      return updateRow(state, action.id, (row) => (row.reviewed === reviewed ? row : { ...row, reviewed }));
    }
    case "revertAll":
      return mapRows(state, (row) =>
        row.status === "unchanged" && row.edited === null ? row : choose(row, "original", false),
      );
    case "restoreAllAi":
      return mapRows(state, (row) => (row.status === "unchanged" ? row : choose(row, "ai", false)));
    case "mergeRefined":
      return mergeRefined(state, action.draftMd, originalMd);
    case "applyFullMarkdown":
      return applyFullMarkdown(state, action.md, originalMd);
  }
}

/** Keeps the old row's review state but takes structure fields from the new alignment. */
function carry(old: ReviewRow, aligned: AlignedRow): ReviewRow {
  if (old.parentId === aligned.parentId && old.kind === aligned.kind && old.sectionType === aligned.sectionType) {
    return old;
  }
  return { ...old, parentId: aligned.parentId, kind: aligned.kind, sectionType: aligned.sectionType };
}

function headingUnchanged(aligned: AlignedRow, old: ReviewRow): boolean {
  if (aligned.proposed === null) return true;
  const current = rowFinalHeading(old) ?? old.headingOverride ?? old.proposedHeading ?? old.originalHeading;
  return sameText(aligned.proposedHeading, current);
}

/**
 * Merges a refined draft (composeFinal + LLM patches). Rows the LLM left untouched keep
 * their review state; rows it changed become the new AI proposal (unreviewed), stashing a
 * previous user edit. Rows absent from both the old final CV and the draft are kept.
 */
function mergeRefined(state: ReviewState, draftMd: string, originalMd: string): ReviewState {
  const aligned = alignCv(originalMd, draftMd);
  const oldById = new Map(state.rows.map((r) => [r.id, r]));
  const rows = aligned.map((nr): ReviewRow => {
    const old = oldById.get(nr.id);
    if (!old) return toReviewRow(nr);
    if (sameText(nr.proposed, rowFinalBody(old)) && headingUnchanged(nr, old)) return carry(old, nr);
    return {
      ...old,
      ...nr,
      status: rowDiffers(nr) ? "ai" : "unchanged",
      edited: null,
      headingOverride: null,
      stashedEdit: stashOf(old),
      reviewed: false,
    };
  });
  const ids = new Set(rows.map((r) => r.id));
  return {
    rows: weaveRows(rows, state.rows, (r) => !ids.has(r.id) && rowFinalBody(r) === null),
  };
}

/**
 * Applies a full-document markdown edit. Rows whose text matches the current final
 * version keep their state; changed rows become user edits; rows missing from `md`
 * become "removed"; new sections become user-added edited rows.
 */
function applyFullMarkdown(state: ReviewState, md: string, originalMd: string): ReviewState {
  const aligned = alignCv(originalMd, md);
  const oldById = new Map(state.rows.map((r) => [r.id, r]));
  const rows = aligned.map((nr): ReviewRow => {
    const old = oldById.get(nr.id);
    if (!old) {
      if (nr.proposed === null) return toReviewRow(nr);
      // A section the user wrote: neither the original nor the AI had it.
      return {
        ...nr,
        proposed: null,
        proposedHeading: null,
        status: "edited",
        edited: nr.proposed,
        stashedEdit: null,
        reviewed: true,
        headingOverride: nr.proposedHeading,
      };
    }
    const kept = carry(old, nr);
    const finalBody = rowFinalBody(old);
    if (nr.proposed === null) {
      if (finalBody === null) return kept;
      return {
        ...kept,
        status: "removed",
        edited: null,
        headingOverride: null,
        stashedEdit: stashOf(old),
        reviewed: true,
      };
    }
    if (sameText(nr.proposed, finalBody) && headingUnchanged(nr, old)) return kept;
    return resolveEdit(kept, nr.proposed, nr.proposedHeading);
  });
  const ids = new Set(rows.map((r) => r.id));
  const leftovers = new Map<string, ReviewRow>();
  for (const r of state.rows) {
    if (ids.has(r.id)) continue;
    leftovers.set(
      r.id,
      rowFinalBody(r) === null
        ? r
        : { ...r, status: "removed", edited: null, headingOverride: null, stashedEdit: stashOf(r), reviewed: true },
    );
  }
  const source = state.rows.map((r) => leftovers.get(r.id) ?? r);
  return { rows: weaveRows(rows, source, (r) => leftovers.has(r.id)) };
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export function historyInit<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function historyPush<T>(h: History<T>, next: T, cap = 50): History<T> {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  return { past: past.length > cap ? past.slice(past.length - cap) : past, present: next, future: [] };
}

export function historyUndo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
  };
}

export function historyRedo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
  };
}

// ---------------------------------------------------------------------------
// Explanations & progress
// ---------------------------------------------------------------------------

export type ChangeReason =
  | "keywords"
  | "reordered"
  | "reworded"
  | "shortened"
  | "expanded"
  | "translated"
  | "new_section"
  | "removed";

function contentLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*+•]|\d{1,2}[.)])\s+/, "").replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);
}

function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/** True when both texts share ≥2 lines and those shared lines appear in a different order. */
function isReordered(original: string, proposed: string): boolean {
  const a = contentLines(original);
  const b = contentLines(proposed);
  const common = a.filter((l) => b.includes(l));
  if (common.length < 2) return false;
  const orderInB = common.map((l) => b.indexOf(l));
  return orderInB.some((v, i) => i > 0 && v < orderInB[i - 1]);
}

/**
 * Short reasons for a row change, for the review UI. `jobKeywords` are the job's
 * keywords (e.g. from buildJobKeywords); `translated` is true when the proposal's
 * language differs from the original's.
 */
export function explainChange(
  original: string | null,
  proposed: string | null,
  jobKeywords: string[],
  translated: boolean,
): { reasons: ChangeReason[]; addedKeywords: string[] } {
  const addedIn = (text: string, base: string | null) => {
    const out: string[] = [];
    for (const k of jobKeywords) {
      if (!k?.trim() || out.includes(k)) continue;
      if (containsSkill(text, k) && (base === null || !containsSkill(base, k))) out.push(k);
    }
    return out;
  };

  if (original === null && proposed === null) return { reasons: [], addedKeywords: [] };
  if (original === null) return { reasons: ["new_section"], addedKeywords: addedIn(proposed!, null) };
  if (proposed === null) return { reasons: ["removed"], addedKeywords: [] };
  if (sameText(original, proposed)) return { reasons: [], addedKeywords: [] };

  const reasons: ChangeReason[] = [];
  const addedKeywords = addedIn(proposed, original);
  if (translated) reasons.push("translated");
  if (addedKeywords.length > 0) reasons.push("keywords");

  const reordered = isReordered(original, proposed);
  if (reordered) reasons.push("reordered");
  if (!translated) {
    const sameLineSet =
      contentLines(original).slice().sort().join("\n") === contentLines(proposed).slice().sort().join("\n");
    const deletesContent = diffWords(original, proposed).some(
      (op) => op.op === "delete" && /[\p{L}\p{N}]/u.test(op.text),
    );
    if (deletesContent && !(reordered && sameLineSet)) reasons.push("reworded");
  }

  const before = wordCount(original);
  const after = wordCount(proposed);
  if (before > 0 && after < before * 0.8) reasons.push("shortened");
  else if (after > before * 1.2 && after - before >= 3) reasons.push("expanded");

  if (reasons.length === 0) reasons.push("reworded");
  return { reasons, addedKeywords };
}

/** `changed` = rows where the AI proposal differs from the original; `reviewed` = those marked reviewed. */
export function reviewProgress(state: ReviewState): { changed: number; reviewed: number } {
  let changed = 0;
  let reviewed = 0;
  for (const row of state.rows) {
    if (!rowDiffers(row)) continue;
    changed++;
    if (row.reviewed) reviewed++;
  }
  return { changed, reviewed };
}
