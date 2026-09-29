/**
 * Splits CV markdown into heading-delimited nodes and aligns an original CV with an
 * LLM-optimized proposal row by row (header, `##` sections, `###` roles/degrees), so the
 * review screen can show "original vs optimized" per row even when the proposal is
 * translated ("Experiencia" ↔ "Experience", "Ingeniero en X" ↔ "Engineer at X") or
 * adds / drops sections.
 */

import { normalizeCvMarkdown } from "./markdown-blocks";
import { canonicalSectionType, normalizeHeadingText, type CvSectionType } from "./section-aliases";
import { monthFromName, stripAccents } from "./cv-claims";
import { STOP_WORDS } from "@/lib/ats/types";

export type RowKind = "header" | "section" | "subsection";

export interface CvSectionNode {
  id: string;
  kind: RowKind;
  level: 1 | 2 | 3;
  /** Full heading line, e.g. "### Dev at Acme". Empty for the headingless fallback node. */
  headingLine: string;
  /** Heading text without the leading #s. */
  heading: string;
  /** Trimmed text until the next heading of any level. */
  body: string;
  /** Canonical type of the section; subsections carry their parent's type. */
  sectionType: CvSectionType | null;
  parentId: string | null;
}

export interface ParsedCvDoc {
  /** Text before the first heading (usually ""). */
  preamble: string;
  nodes: CvSectionNode[];
}

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Removes leading blank lines and trailing whitespace (keeps first-line indentation). */
function trimBlock(text: string): string {
  return text.replace(/^(?:[ \t]*\n)+/, "").trimEnd();
}

/**
 * Parses CV markdown into heading nodes. Only #, ## and ### are headings (deeper levels
 * count as ###). The first `#` before any `##` is the header (its body = contact lines);
 * later `#` headings are treated as sections. Ids: `${p}:h` header, `${p}:s${n}` n-th
 * section, `${p}:s${n}.${m}` m-th subsection within it, `${p}:x${m}` subsections before
 * any section. Without any heading the whole text becomes one headingless section node.
 */
export function parseCvSections(md: string, idPrefix: "o" | "p"): ParsedCvDoc {
  const text = normalizeCvMarkdown(md ?? "");
  const lines = text.split("\n");
  const nodes: CvSectionNode[] = [];
  const bodies: string[][] = [];
  const preamble: string[] = [];

  let sectionCount = 0;
  let subCount = 0;
  let orphanCount = 0;
  let currentSection: CvSectionNode | null = null;
  let headerSeen = false;
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const m = inFence ? null : line.match(HEADING_RE);
    if (!m) {
      (bodies.length ? bodies[bodies.length - 1] : preamble).push(line);
      continue;
    }
    const hashes = m[1].length;
    const heading = m[2].trim();
    let node: CvSectionNode;
    if (hashes === 1 && !headerSeen && !currentSection) {
      headerSeen = true;
      node = {
        id: `${idPrefix}:h`,
        kind: "header",
        level: 1,
        headingLine: line,
        heading,
        body: "",
        sectionType: null,
        parentId: null,
      };
    } else if (hashes <= 2) {
      sectionCount++;
      subCount = 0;
      node = {
        id: `${idPrefix}:s${sectionCount}`,
        kind: "section",
        level: hashes === 1 ? 1 : 2,
        headingLine: line,
        heading,
        body: "",
        sectionType: canonicalSectionType(heading),
        parentId: null,
      };
      currentSection = node;
    } else if (currentSection) {
      subCount++;
      node = {
        id: `${currentSection.id}.${subCount}`,
        kind: "subsection",
        level: 3,
        headingLine: line,
        heading,
        body: "",
        sectionType: currentSection.sectionType,
        parentId: currentSection.id,
      };
    } else {
      orphanCount++;
      node = {
        id: `${idPrefix}:x${orphanCount}`,
        kind: "subsection",
        level: 3,
        headingLine: line,
        heading,
        body: "",
        sectionType: null,
        parentId: null,
      };
    }
    nodes.push(node);
    bodies.push([]);
  }

  nodes.forEach((node, i) => {
    node.body = trimBlock(bodies[i].join("\n"));
  });
  const pre = trimBlock(preamble.join("\n"));

  if (nodes.length === 0) {
    if (!pre) return { preamble: "", nodes: [] };
    return {
      preamble: "",
      nodes: [
        {
          id: `${idPrefix}:s1`,
          kind: "section",
          level: 2,
          headingLine: "",
          heading: "",
          body: pre,
          sectionType: null,
          parentId: null,
        },
      ],
    };
  }
  return { preamble: pre, nodes };
}

export interface AlignedRow {
  id: string;
  kind: RowKind;
  parentId: string | null;
  sectionType: CvSectionType | null;
  /** Full heading lines; null when that side is absent or has no heading (preamble). */
  originalHeading: string | null;
  proposedHeading: string | null;
  /** Bodies; null = absent on that side. */
  original: string | null;
  proposed: string | null;
}

interface SectionGroup {
  node: CvSectionNode;
  children: CvSectionNode[];
}

interface DocTree {
  preamble: string;
  header: CvSectionNode | null;
  orphans: CvSectionNode[];
  sections: SectionGroup[];
}

function buildTree(doc: ParsedCvDoc): DocTree {
  const tree: DocTree = { preamble: doc.preamble, header: null, orphans: [], sections: [] };
  const byId = new Map<string, SectionGroup>();
  for (const node of doc.nodes) {
    if (node.kind === "header") tree.header = node;
    else if (node.kind === "section") {
      const group = { node, children: [] };
      tree.sections.push(group);
      byId.set(node.id, group);
    } else if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else tree.orphans.push(node);
  }
  return tree;
}

/** Id of the synthetic row holding text before the first heading. */
export function isPreambleRowId(id: string): boolean {
  return id === "o:pre" || id === "p:pre";
}

/**
 * Aligns original and proposed CV markdown into review rows.
 *
 * - header ↔ header;
 * - `##` sections by canonical type, then normalized heading, then position (within the gap
 *   between already-matched neighbours), then body similarity;
 * - `###` within matched sections by exact heading, date line ("*Jan 2021 - Present*" ≡
 *   "*Enero 2021 - Actualidad*"), company-token overlap, then position.
 *
 * Row ids: the original node id when the original side exists, else
 * `p:${normalizeHeadingText(heading)}#${occurrence}`. Rows follow the proposal order;
 * original-only rows are woven in after their original predecessor.
 */
export function alignCv(originalMd: string, proposedMd: string): AlignedRow[] {
  const oDoc = parseCvSections(originalMd, "o");
  const pDoc = parseCvSections(proposedMd, "p");
  const o = buildTree(oDoc);
  const p = buildTree(pDoc);

  const pairs = new Map<string, CvSectionNode>(); // proposed node id → original node
  if (o.header && p.header) pairs.set(p.header.id, o.header);
  matchNodes(o.orphans, p.orphans, false).forEach((oi, pi) => pairs.set(p.orphans[pi].id, o.orphans[oi]));
  const sectionPairs = matchNodes(
    o.sections.map((s) => s.node),
    p.sections.map((s) => s.node),
    true,
  );
  sectionPairs.forEach((oi, pi) => {
    pairs.set(p.sections[pi].node.id, o.sections[oi].node);
    const oKids = o.sections[oi].children;
    const pKids = p.sections[pi].children;
    matchNodes(oKids, pKids, false).forEach((ok, pk) => pairs.set(pKids[pk].id, oKids[ok]));
  });

  const occurrences = new Map<string, number>();
  const proposalOnlyId = (node: CvSectionNode) => {
    const key = normalizeHeadingText(node.heading);
    const n = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, n);
    return `p:${key}#${n}`;
  };

  const headingOf = (node: CvSectionNode | undefined | null) =>
    node && node.headingLine ? node.headingLine : null;

  const makeRow = (
    oNode: CvSectionNode | null,
    pNode: CvSectionNode | null,
    parent: AlignedRow | null,
  ): AlignedRow => {
    const any = (pNode ?? oNode)!;
    return {
      id: oNode ? oNode.id : proposalOnlyId(pNode!),
      kind: oNode?.kind === "header" || pNode?.kind === "header" ? "header" : any.kind,
      parentId: parent ? parent.id : null,
      sectionType:
        any.kind === "subsection"
          ? (parent?.sectionType ?? null)
          : (pNode?.sectionType ?? oNode?.sectionType ?? null),
      originalHeading: headingOf(oNode),
      proposedHeading: headingOf(pNode),
      original: oNode ? oNode.body : null,
      proposed: pNode ? pNode.body : null,
    };
  };

  // 1. Rows in proposal order.
  const primary: AlignedRow[] = [];
  const rowByOriginalId = new Map<string, AlignedRow>();
  const push = (row: AlignedRow, oNode: CvSectionNode | null) => {
    primary.push(row);
    if (oNode) rowByOriginalId.set(oNode.id, row);
    return row;
  };

  if (o.preamble || p.preamble) {
    const row: AlignedRow = {
      id: o.preamble ? "o:pre" : "p:pre",
      kind: "section",
      parentId: null,
      sectionType: null,
      originalHeading: null,
      proposedHeading: null,
      original: o.preamble || null,
      proposed: p.preamble || null,
    };
    primary.push(row);
    if (o.preamble) rowByOriginalId.set("o:pre", row);
  }
  if (p.header) push(makeRow(pairs.get(p.header.id) ?? null, p.header, null), pairs.get(p.header.id) ?? null);
  for (const node of p.orphans) push(makeRow(pairs.get(node.id) ?? null, node, null), pairs.get(node.id) ?? null);
  for (const group of p.sections) {
    const oSec = pairs.get(group.node.id) ?? null;
    const secRow = push(makeRow(oSec, group.node, null), oSec);
    for (const child of group.children) {
      const oChild = pairs.get(child.id) ?? null;
      push(makeRow(oChild, child, secRow), oChild);
    }
  }

  // 2. Original order, reusing matched rows and creating original-only rows.
  const originalOrder: AlignedRow[] = [];
  const extras = new Set<AlignedRow>();
  const fromOriginal = (node: CvSectionNode, parent: AlignedRow | null) => {
    let row = rowByOriginalId.get(node.id);
    if (!row) {
      row = makeRow(node, null, parent);
      extras.add(row);
    }
    originalOrder.push(row);
    return row;
  };
  const preambleRow = rowByOriginalId.get("o:pre");
  if (preambleRow) originalOrder.push(preambleRow);
  if (o.header) fromOriginal(o.header, null);
  for (const node of o.orphans) fromOriginal(node, null);
  for (const group of o.sections) {
    const secRow = fromOriginal(group.node, null);
    for (const child of group.children) fromOriginal(child, secRow);
  }

  return weaveRows(primary, originalOrder, (row) => extras.has(row));
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Pairs proposed nodes with original nodes. Returns Map<proposedIndex, originalIndex>.
 * `sections` selects the `##` strategy (type-driven); otherwise the `###` strategy.
 */
function matchNodes(
  oNodes: CvSectionNode[],
  pNodes: CvSectionNode[],
  sections: boolean,
): Map<number, number> {
  const pToO = new Map<number, number>();
  const oUsed = new Set<number>();
  const pair = (pi: number, oi: number) => {
    pToO.set(pi, oi);
    oUsed.add(oi);
  };
  const pass = (pred: (o: CvSectionNode, p: CvSectionNode) => boolean) => {
    pNodes.forEach((pn, pi) => {
      if (pToO.has(pi)) return;
      const oi = oNodes.findIndex((on, idx) => !oUsed.has(idx) && pred(on, pn));
      if (oi >= 0) pair(pi, oi);
    });
  };
  const oNorm = oNodes.map((n) => normalizeHeadingText(n.heading));
  const pNorm = pNodes.map((n) => normalizeHeadingText(n.heading));
  const sameHeading = (on: CvSectionNode, pn: CvSectionNode) =>
    oNorm[oNodes.indexOf(on)] === pNorm[pNodes.indexOf(pn)];

  /** Unmatched originals strictly between the originals matched to pi's neighbours. */
  const gapCandidates = (pi: number) => {
    let lo = -1;
    let hi = oNodes.length;
    for (let k = pi - 1; k >= 0; k--) {
      if (pToO.has(k)) {
        lo = pToO.get(k)!;
        break;
      }
    }
    for (let k = pi + 1; k < pNodes.length; k++) {
      if (pToO.has(k)) {
        hi = pToO.get(k)!;
        break;
      }
    }
    const out: number[] = [];
    for (let oi = lo + 1; oi < hi; oi++) if (!oUsed.has(oi)) out.push(oi);
    return out;
  };

  if (sections) {
    const typed = (on: CvSectionNode, pn: CvSectionNode) =>
      on.sectionType !== null && on.sectionType === pn.sectionType;
    pass((on, pn) => typed(on, pn) && sameHeading(on, pn));
    pass(typed);
    pass(sameHeading);
    // Different known types never pair ("Summary" is not a renamed "Education"). Two
    // unknown headings pair by position (likely a translation, "Volunteer" ↔ "Voluntariado");
    // a known + unknown pair needs similar content ("Tech Stack" ↔ "Skills").
    const compatible = (on: CvSectionNode, pn: CvSectionNode) =>
      (on.sectionType === null && pn.sectionType === null) ||
      ((on.sectionType === null || pn.sectionType === null) && similarity(on.body, pn.body) >= 0.2);
    // Positional: only the next unmatched original in the gap (never skip over another
    // unmatched section — that one was more likely dropped and this one added).
    pNodes.forEach((pn, pi) => {
      if (pToO.has(pi)) return;
      const oi = gapCandidates(pi)[0];
      if (oi !== undefined && compatible(oNodes[oi], pn)) pair(pi, oi);
    });
    pass(
      (on, pn) =>
        (on.sectionType === null || pn.sectionType === null) && similarity(on.body, pn.body) >= 0.3,
    );
    return pToO;
  }

  pass(sameHeading);
  pass((on, pn) => {
    const a = dateLine(on.body);
    return a !== null && a === dateLine(pn.body);
  });
  pass((on, pn) => {
    const a = dateKey(on.body);
    return a !== null && a === dateKey(pn.body);
  });
  // Best company-token overlap.
  pNodes.forEach((pn, pi) => {
    if (pToO.has(pi)) return;
    const pTokens = companyTokens(pn.heading);
    let best = -1;
    let bestScore = 0;
    oNodes.forEach((on, oi) => {
      if (oUsed.has(oi)) return;
      const score = overlap(companyTokens(on.heading), pTokens);
      if (score > bestScore) {
        best = oi;
        bestScore = score;
      }
    });
    if (best >= 0) pair(pi, best);
  });
  // Position: first within the gap, then any remaining in order.
  pNodes.forEach((_, pi) => {
    if (pToO.has(pi)) return;
    const oi = gapCandidates(pi)[0];
    if (oi !== undefined) pair(pi, oi);
  });
  pNodes.forEach((_, pi) => {
    if (pToO.has(pi)) return;
    const oi = oNodes.findIndex((__, idx) => !oUsed.has(idx));
    if (oi >= 0) pair(pi, oi);
  });
  return pToO;
}

const YEAR_RE = /\b(?:19|20)\d{2}\b/;

/** First line (within the first 4 non-empty lines) like "*Jan 2021 - Present* | City" with a year. */
function findDateLine(body: string): string | null {
  const lines = body.split("\n").filter((l) => l.trim());
  for (const line of lines.slice(0, 4)) {
    if (/(\*|_)[^*_]+\1/.test(line) && YEAR_RE.test(line)) return line;
  }
  return null;
}

function dateLine(body: string): string | null {
  const line = findDateLine(body);
  if (!line) return null;
  return line.replace(/[*_]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

const PRESENT_WORDS = new Set([
  "present", "current", "currently", "now", "today", "ongoing", "actualidad", "actual",
  "actualmente", "presente", "hoy", "fecha", "atual", "atualmente", "heute", "aktuell",
]);

/**
 * Language-independent key of a date line: "*January 2021 - Present*" and
 * "*Enero 2021 - Actualidad*" both → "2021-1|now".
 */
function dateKey(body: string): string | null {
  const line = findDateLine(body);
  if (!line) return null;
  const s = stripAccents(line).toLowerCase();
  const parts: string[] = [];
  let month: number | null = null;
  const re = /((?:19|20)\d{2})[-/.](\d{1,2})\b|\b(\d{1,2})[-/.]((?:19|20)\d{2})\b|\b((?:19|20)\d{2})\b|([a-z]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[1]) parts.push(`${m[1]}-${+m[2]}`);
    else if (m[4]) parts.push(`${m[4]}-${+m[3]}`);
    else if (m[5]) {
      parts.push(month ? `${m[5]}-${month}` : m[5]);
      month = null;
    } else if (m[6]) {
      const mo = monthFromName(m[6]);
      if (mo) month = mo;
      else if (PRESENT_WORDS.has(m[6])) parts.push("now");
    }
  }
  return parts.length ? parts.join("|") : null;
}

const COMPANY_NOISE = new Set(["inc", "llc", "ltd", "sa", "srl", "corp", "co", "gmbh", "sas", "the"]);

function companyTokens(heading: string): Set<string> {
  const norm = normalizeHeadingText(heading);
  const parts = norm.split(/\s+(?:at|en|@|para|with|con|na|no|bei)\s+|\s+@\s*/);
  const company = parts.length > 1 ? parts[parts.length - 1] : norm;
  return new Set(
    company
      .split(/[\s/&.,\-|]+/)
      .filter((t) => t.length >= 2 && !STOP_WORDS.has(t) && !COMPANY_NOISE.has(t)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

function wordSet(text: string): Set<string> {
  return new Set(
    stripAccents(text)
      .toLowerCase()
      .split(/[^\p{L}\p{N}+#.]+/u)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w)),
  );
}

/** Jaccard similarity of content words. */
function similarity(a: string, b: string): number {
  const sa = wordSet(a);
  const sb = wordSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  const inter = overlap(sa, sb);
  return inter / (sa.size + sb.size - inter || 1);
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

export interface RowShape {
  id: string;
  kind: RowKind;
  parentId: string | null;
}

/**
 * Inserts the `isExtra` rows of `sourceOrder` into `primary`, each right after its
 * predecessor in `sourceOrder`, respecting structure: a section goes after the whole block
 * (section + subsections) of its predecessor section, a subsection stays inside its
 * parent's block, the header goes first (after a preamble row).
 */
export function weaveRows<T extends RowShape>(
  primary: T[],
  sourceOrder: T[],
  isExtra: (row: T) => boolean,
): T[] {
  const out = [...primary];
  const indexOf = (id: string) => out.findIndex((r) => r.id === id);
  sourceOrder.forEach((row, i) => {
    if (!isExtra(row)) return;
    out.splice(insertionIndex(out, row, sourceOrder, i, indexOf), 0, row);
  });
  return out;
}

function blockEnd<T extends RowShape>(out: T[], k: number): number {
  let e = k + 1;
  while (e < out.length && out[e].kind === "subsection") e++;
  return e;
}

function afterHeaderIndex<T extends RowShape>(out: T[]): number {
  let k = 0;
  while (k < out.length && (isPreambleRowId(out[k].id) || out[k].kind === "header")) k++;
  return k;
}

function insertionIndex<T extends RowShape>(
  out: T[],
  row: T,
  sourceOrder: T[],
  i: number,
  indexOf: (id: string) => number,
): number {
  if (isPreambleRowId(row.id)) return 0;
  if (row.kind === "header") return out.length > 0 && isPreambleRowId(out[0].id) ? 1 : 0;

  if (row.kind === "subsection") {
    for (let j = i - 1; j >= 0; j--) {
      const prev = sourceOrder[j];
      const k = indexOf(prev.id);
      if (row.parentId !== null && prev.id === row.parentId) {
        if (k >= 0) return k + 1;
        break;
      }
      if (prev.kind === "subsection") {
        if (prev.parentId === row.parentId && k >= 0) return k + 1;
        continue;
      }
      // First orphan subsection: right after the header / preamble that preceded it.
      if (row.parentId === null && k >= 0) return k + 1;
      break;
    }
    if (row.parentId !== null) {
      const k = indexOf(row.parentId);
      if (k >= 0) return k + 1;
      return out.length;
    }
    return afterHeaderIndex(out);
  }

  for (let j = i - 1; j >= 0; j--) {
    const prev = sourceOrder[j];
    if (prev.kind === "subsection" || isPreambleRowId(prev.id)) continue;
    const k = indexOf(prev.id);
    if (k >= 0) return blockEnd(out, k);
  }
  let k = afterHeaderIndex(out);
  while (k < out.length && out[k].kind === "subsection") k++;
  return k;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Joins "heading\n\nbody" blocks with blank lines. Parts with neither heading nor body
 * are skipped; a heading without body is emitted alone. Ends with "\n" ("" when empty).
 */
export function composeCv(
  parts: Array<{ headingLine: string | null; body: string | null }>,
  preamble?: string,
): string {
  const blocks: string[] = [];
  if (preamble && preamble.trim()) blocks.push(trimBlock(preamble));
  for (const part of parts) {
    const heading = part.headingLine?.trim() || null;
    const body = part.body != null ? trimBlock(part.body) : "";
    if (!heading && !body) continue;
    blocks.push(heading && body ? `${heading}\n\n${body}` : (heading ?? body));
  }
  return blocks.length ? blocks.join("\n\n") + "\n" : "";
}
