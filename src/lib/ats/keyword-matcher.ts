import type { CheckerResult, KeywordExtractionResult } from "./types";
import type { AtsIssue } from "@/types/ats";
import { STOP_WORDS } from "./types";
import { isTechTerm, TECH_SYNONYMS } from "./tech-dictionary";

// ---------------------------------------------------------------------------
// Tokenisation helpers
// ---------------------------------------------------------------------------

/** Split text into tokens — preserves multi-word tech terms as single tokens. */
function tokenize(text: string): string[] {
  // Normalise whitespace but keep original casing for later
  return text
    .replace(/[\r\n]+/g, " ")
    .split(/[\s,;:()\[\]{}"'!?]+/)
    .map((t) => t.replace(/^[.\-/]+|[.\-/]+$/g, "")) // trim leading/trailing dots/hyphens
    .filter((t) => t.length > 0);
}

/** Very small stemmer — strips common English suffixes. Good enough for matching. */
function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length < 5) return w;

  const suffixes = [
    "ization","isation","fulness","ousness","iveness",
    "ement","ation","ition","ness","ment","ence","ance","ible","able",
    "ting","ling","ying","less","eous","ious","ical","ized","ised",
    "ful","ous","ive","ize","ise","ing","ion","ity","ent","ant","ist",
    "ism","ure","ary","ory","ate","ify","ery","est","ial","ual",
    "nal","ble","tic","age","ial","dom",
    "ly","ed","er","al",
  ];

  for (const suf of suffixes) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      return w.slice(0, w.length - suf.length);
    }
  }
  return w;
}

// ---------------------------------------------------------------------------
// Bigram / trigram extraction for multi-word matches
// ---------------------------------------------------------------------------

function extractNgrams(tokens: string[], n: number): string[] {
  const result: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    result.push(tokens.slice(i, i + n).join(" "));
  }
  return result;
}

// ---------------------------------------------------------------------------
// extractKeywords — analyse a job description (or any text) and return
// the most important keywords sorted by relevance.
// ---------------------------------------------------------------------------

export function extractKeywords(text: string): KeywordExtractionResult[] {
  const tokens = tokenize(text);
  const lowerTokens = tokens.map((t) => t.toLowerCase());

  // ---- 1. Term frequency for unigrams ----
  const freq = new Map<string, number>();
  for (const t of lowerTokens) {
    if (t.length < 2) continue;
    if (STOP_WORDS.has(t)) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }

  // ---- 2. Bigrams ----
  // Build bigrams from the original text (not tokens), respecting sentence/list boundaries
  const sentences = text
    .replace(/[\r\n]+/g, " ")
    .split(/[,;:()\[\]{}"'!?\n\r|\/]/)
    .filter((s) => s.trim().length > 0);

  for (const sentence of sentences) {
    const sentTokens = tokenize(sentence).map((t) => t.toLowerCase());
    const sentBigrams = extractNgrams(sentTokens, 2);
    for (const bg of sentBigrams) {
      const parts = bg.split(" ");
      if (parts.some((p) => STOP_WORDS.has(p))) continue;
      if (parts.some((p) => p.length < 2)) continue;
      freq.set(bg, (freq.get(bg) ?? 0) + 1);
    }
  }

  // ---- 3. Trigrams ----
  for (const sentence of sentences) {
    const sentTokens = tokenize(sentence).map((t) => t.toLowerCase());
    const sentTrigrams = extractNgrams(sentTokens, 3);
    for (const tg of sentTrigrams) {
      const parts = tg.split(" ");
      if (parts.some((p) => STOP_WORDS.has(p))) continue;
      if (parts.some((p) => p.length < 2)) continue;
      // Only keep trigrams that appear 2+ times
      const count = (freq.get(tg) ?? 0) + 1;
      freq.set(tg, count);
    }
  }

  // ---- 4. Score each keyword ----
  const totalTokens = lowerTokens.length || 1;
  const results: KeywordExtractionResult[] = [];

  for (const [term, count] of freq) {
    if (count < 1) continue;
    // Skip very short single words unless they're tech terms
    if (term.length < 3 && !isTechTerm(term)) continue;
    // Skip trigrams that only appear once
    if (term.split(" ").length === 3 && count < 2) continue;

    let importance = (count / totalTokens) * 100; // base TF percentage

    // Boost multi-word terms (they're more specific)
    const wordCount = term.split(" ").length;
    if (wordCount === 2) importance *= 2.0;
    if (wordCount === 3) importance *= 2.5;

    // Boost tech terms significantly
    if (isTechTerm(term)) {
      importance *= 3.0;
    } else {
      // Check if any word in the term is a tech term
      const parts = term.split(" ");
      if (parts.some((p) => isTechTerm(p))) {
        importance *= 2.0;
      }
    }

    // Boost terms that appear in the first 20% of the text (likely in requirements)
    const firstChunkEnd = Math.floor(lowerTokens.length * 0.2);
    const firstChunkTokens = lowerTokens.slice(0, firstChunkEnd);
    if (firstChunkTokens.includes(term) || firstChunkTokens.some((_, i) => {
      if (wordCount === 1) return false;
      const slice = firstChunkTokens.slice(i, i + wordCount).join(" ");
      return slice === term;
    })) {
      importance *= 1.3;
    }

    results.push({
      keyword: term,
      frequency: count,
      importance: Math.round(importance * 100) / 100,
    });
  }

  // Sort by importance descending, take top 30
  results.sort((a, b) => b.importance - a.importance);
  return results.slice(0, 30);
}

// ---------------------------------------------------------------------------
// matchKeywords — compare CV text/skills against extracted keywords
// ---------------------------------------------------------------------------

export function matchKeywords(
  cvText: string,
  cvSkills: string[],
  keywords: KeywordExtractionResult[],
): {
  matched: Array<{ keyword: string; count: number; locations: string[] }>;
  missing: Array<{ keyword: string; importance: number }>;
  partial: Array<{ keyword: string; foundAs: string }>;
  score: number;
} {
  if (keywords.length === 0) {
    return { matched: [], missing: [], partial: [], score: 100 };
  }

  const cvLower = cvText.toLowerCase();
  const cvTokens = tokenize(cvText).map((t) => t.toLowerCase());
  const cvSkillsLower = cvSkills.map((s) => s.toLowerCase());
  const cvStemmed = new Set(cvTokens.map(stem));

  const matched: Array<{ keyword: string; count: number; locations: string[] }> = [];
  const missing: Array<{ keyword: string; importance: number }> = [];
  const partial: Array<{ keyword: string; foundAs: string }> = [];

  let totalWeight = 0;
  let matchedWeight = 0;

  for (const kw of keywords) {
    const kwLower = kw.keyword.toLowerCase();
    totalWeight += kw.importance;

    // ---- 1. Exact match (case-insensitive substring) ----
    const exactCount = countOccurrences(cvLower, kwLower);
    if (exactCount > 0) {
      matched.push({
        keyword: kw.keyword,
        count: exactCount,
        locations: findLocations(cvText, kwLower),
      });
      matchedWeight += kw.importance;
      continue;
    }

    // ---- 2. Synonym match ----
    const synonyms = TECH_SYNONYMS.get(kwLower);
    let synonymFound = false;
    if (synonyms) {
      for (const syn of synonyms) {
        if (syn === kwLower) continue;
        const synCount = countOccurrences(cvLower, syn);
        if (synCount > 0) {
          partial.push({ keyword: kw.keyword, foundAs: syn });
          matchedWeight += kw.importance * 0.85; // slightly less than exact
          synonymFound = true;
          break;
        }
      }
    }
    if (synonymFound) continue;

    // ---- 3. Check in CV skills array ----
    const skillMatch = cvSkillsLower.find(
      (s) => s === kwLower || s.includes(kwLower) || kwLower.includes(s),
    );
    if (skillMatch) {
      matched.push({
        keyword: kw.keyword,
        count: 1,
        locations: ["skills section"],
      });
      matchedWeight += kw.importance * 0.9;
      continue;
    }

    // ---- 4. Stemmed match ----
    const kwStemmed = stem(kwLower);
    if (kwStemmed.length >= 3 && cvStemmed.has(kwStemmed)) {
      // Find the actual word that matched after stemming
      const actualWord = cvTokens.find((t) => stem(t) === kwStemmed);
      if (actualWord && actualWord !== kwLower) {
        partial.push({ keyword: kw.keyword, foundAs: actualWord });
        matchedWeight += kw.importance * 0.7;
        continue;
      }
    }

    // ---- 5. Not found ----
    missing.push({ keyword: kw.keyword, importance: kw.importance });
  }

  const score = totalWeight > 0
    ? Math.round((matchedWeight / totalWeight) * 100)
    : 100;

  return { matched, missing, partial, score: Math.min(100, Math.max(0, score)) };
}

// ---------------------------------------------------------------------------
// Full checker entry point (produces CheckerResult for the orchestrator)
// ---------------------------------------------------------------------------

export function checkKeywords(
  cvText: string,
  cvSkills: string[],
  jobDescription?: string,
): CheckerResult {
  const issues: AtsIssue[] = [];

  // If no job description, we can only do a basic skills check
  if (!jobDescription) {
    const hasSkills = cvSkills.length > 0;
    const cvTokens = tokenize(cvText);
    const uniqueTokens = new Set(cvTokens.map((t) => t.toLowerCase()));
    const techCount = [...uniqueTokens].filter((t) => isTechTerm(t)).length;

    if (!hasSkills) {
      issues.push({
        check: "keyword_match",
        severity: "warning",
        message: "No skills listed in the CV. ATS systems rely heavily on skill keywords.",
        fix: "Add a dedicated Skills section listing your technical and soft skills.",
      });
    }

    if (techCount < 5) {
      issues.push({
        check: "keyword_match",
        severity: "info",
        message: `Only ${techCount} technology keywords detected in CV. Consider adding more.`,
        fix: "Include specific technologies, tools, and frameworks you have experience with.",
      });
    }

    const score = hasSkills
      ? Math.min(100, 60 + techCount * 3)
      : Math.min(100, 30 + techCount * 3);

    return {
      score: Math.min(100, score),
      issues,
      details: { techCount, skillsCount: cvSkills.length, mode: "no_job_description" },
    };
  }

  // Extract keywords from job description then match
  const keywords = extractKeywords(jobDescription);
  const result = matchKeywords(cvText, cvSkills, keywords);

  // Generate issues for missing high-importance keywords
  const sortedMissing = [...result.missing].sort((a, b) => b.importance - a.importance);
  for (const m of sortedMissing.slice(0, 5)) {
    issues.push({
      check: "keyword_match",
      severity: m.importance > 5 ? "critical" : "warning",
      message: `Missing keyword: "${m.keyword}" (importance: ${m.importance.toFixed(1)})`,
      fix: `Add "${m.keyword}" to your CV — in your skills, experience descriptions, or summary.`,
    });
  }

  if (result.missing.length > 5) {
    issues.push({
      check: "keyword_match",
      severity: "info",
      message: `${result.missing.length - 5} additional keywords from the job description are missing.`,
      fix: "Review the job description and incorporate relevant terms naturally into your CV.",
    });
  }

  // Warn about partial matches
  for (const p of result.partial.slice(0, 3)) {
    issues.push({
      check: "keyword_match",
      severity: "info",
      message: `"${p.keyword}" found as "${p.foundAs}" — consider using the exact term from the job description.`,
      fix: `Use "${p.keyword}" instead of or in addition to "${p.foundAs}".`,
    });
  }

  return {
    score: result.score,
    issues,
    details: {
      matched: result.matched,
      missing: result.missing,
      partial: result.partial,
      keywordsExtracted: keywords.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  const needleLower = needle.toLowerCase();
  const haystackLower = haystack.toLowerCase();
  while (true) {
    pos = haystackLower.indexOf(needleLower, pos);
    if (pos === -1) break;
    count++;
    pos += needleLower.length;
  }
  return count;
}

function findLocations(text: string, keyword: string): string[] {
  const lines = text.split("\n");
  const locations: string[] = [];
  const kwLower = keyword.toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(kwLower)) {
      // Try to identify the section
      const sectionLabel = identifySection(lines, i);
      if (sectionLabel && !locations.includes(sectionLabel)) {
        locations.push(sectionLabel);
      }
    }
  }
  return locations.length > 0 ? locations : ["body"];
}

function identifySection(lines: string[], lineIndex: number): string {
  // Walk backwards to find the nearest section header
  const sectionPatterns = [
    /^#{1,3}\s+(.+)/,
    /^(summary|experience|education|skills|projects|certifications|languages|contact|profile|objective|about)/i,
    /^(resumen|experiencia|educaci[oó]n|habilidades|proyectos|certificaciones|idiomas|contacto|perfil|objetivo)/i,
  ];

  for (let i = lineIndex; i >= 0; i--) {
    const line = lines[i].trim();
    for (const pat of sectionPatterns) {
      const match = line.match(pat);
      if (match) {
        return match[1] ? match[1].trim().toLowerCase() : line.toLowerCase();
      }
    }
    // ALL-CAPS lines often are section headers
    if (line.length > 2 && line.length < 40 && line === line.toUpperCase() && /[A-Z]/.test(line)) {
      return line.toLowerCase();
    }
  }
  return "body";
}
