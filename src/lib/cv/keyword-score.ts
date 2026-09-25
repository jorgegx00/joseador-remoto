/**
 * Weighted job-keyword coverage of a CV (0-100), used to show "keyword match before →
 * after" for an optimized CV. Deterministic — no LLM involved.
 */

import type { Job } from "@/types/job";
import type { MatchAnalysis } from "@/types/llm";
import { extractKeywords } from "@/lib/ats/keyword-matcher";
import { getSynonyms, isTechTerm } from "@/lib/ats/tech-dictionary";
import { containsSkill, isAmbiguousWord } from "./cv-claims";
import { markdownToPlainText } from "./markdown-blocks";

export interface JobKeyword {
  keyword: string;
  weight: number;
}

const MAX_DESCRIPTION_KEYWORDS = 25;

const IMPORTANCE_WEIGHT: Record<string, number> = {
  critical: 3,
  important: 2,
  nice_to_have: 1,
};

function keywordKey(keyword: string): string {
  const syn = getSynonyms(keyword);
  return syn.size > 0 ? [...syn].sort()[0] : keyword.trim().toLowerCase();
}

/**
 * extractKeywords lowercases; recover the best-cased spelling from the description
 * ("Spring Boot" over "Spring boot"). `evidence` ≥ 1 when some occurrence is capitalized
 * mid-sentence or has inner capitals — needed for ambiguous words ("Go" vs "ready to go").
 */
function displayForm(keyword: string, text: string): { form: string; evidence: number } {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
  let best = keyword;
  let evidence = -1;
  for (const m of text.matchAll(re)) {
    const form = m[0].replace(/\s+/g, " ");
    const upper = (form.match(/\p{Lu}/gu) ?? []).length;
    const before = text.slice(0, m.index).replace(/[ \t]+$/, "");
    const sentenceStart =
      before === "" || /[.!?\n]$/.test(before) || /(?:^|\n)\s*(?:[-*+•]|\d{1,2}[.)])$/.test(before);
    const score = upper === 1 && /^\p{Lu}/u.test(form) && sentenceStart ? 0.5 : upper;
    if (score > evidence) {
      best = form;
      evidence = score;
    }
  }
  return { form: best, evidence };
}

/**
 * Job keywords with weights: `skills_required` → 2; analysis skills critical 3 /
 * important 2 / nice-to-have 1; tech terms (and repeated multi-word phrases) from the
 * description → 1 (top 25). Deduped case- and synonym-insensitively keeping the max
 * weight and the first spelling seen. Sorted by weight desc (stable).
 */
export function buildJobKeywords(
  job: Pick<Job, "title" | "description" | "skills_required">,
  analysis?: MatchAnalysis | null,
): JobKeyword[] {
  const byKey = new Map<string, JobKeyword>();
  const add = (raw: string | null | undefined, weight: number) => {
    const keyword = raw?.trim();
    if (!keyword) return;
    const key = keywordKey(keyword);
    const existing = byKey.get(key);
    if (existing) existing.weight = Math.max(existing.weight, weight);
    else byKey.set(key, { keyword, weight });
  };

  for (const skill of job.skills_required ?? []) add(skill, 2);
  for (const s of analysis?.skills_match ?? []) add(s?.skill, IMPORTANCE_WEIGHT[s?.importance] ?? 1);

  const description = job.description ?? "";
  let taken = 0;
  for (const kw of extractKeywords(description)) {
    if (taken >= MAX_DESCRIPTION_KEYWORDS) break;
    const k = kw.keyword;
    const relevant =
      isTechTerm(k) || getSynonyms(k).size > 0 || (k.includes(" ") && kw.frequency >= 2);
    if (!relevant) continue;
    const { form, evidence } = displayForm(k, description);
    if (!k.includes(" ") && isAmbiguousWord(k) && evidence < 1) continue;
    taken++;
    add(form, 1);
  }

  return [...byKey.values()]
    .map((k, i) => ({ k, i }))
    .sort((a, b) => b.k.weight - a.k.weight || a.i - b.i)
    .map(({ k }) => ({ ...k }));
}

/**
 * Weighted share (0-100) of `keywords` mentioned in the CV markdown (markdown stripped,
 * synonym-aware via containsSkill). No keywords → 100.
 */
export function keywordCoverage(
  md: string,
  keywords: JobKeyword[],
): { score: number; matched: string[]; missing: string[] } {
  if (keywords.length === 0) return { score: 100, matched: [], missing: [] };
  const plain = markdownToPlainText(md ?? "");
  const matched: string[] = [];
  const missing: string[] = [];
  let total = 0;
  let got = 0;
  for (const kw of keywords) {
    const weight = kw.weight > 0 ? kw.weight : 0;
    total += weight;
    if (containsSkill(plain, kw.keyword)) {
      got += weight;
      matched.push(kw.keyword);
    } else {
      missing.push(kw.keyword);
    }
  }
  const score = total > 0 ? Math.round((got / total) * 100) : 100;
  return { score: Math.max(0, Math.min(100, score)), matched, missing };
}
