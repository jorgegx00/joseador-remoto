import type { CheckerResult } from "./types";
import type { AtsIssue } from "@/types/ats";
import { isTechTerm, COMMON_ENGLISH_WORDS, COMMON_SPANISH_WORDS, HR_TERMS } from "./tech-dictionary";

// ---------------------------------------------------------------------------
// Spell checker — conservative, avoids false positives
// ---------------------------------------------------------------------------

/** Known common misspellings → corrections */
const COMMON_TYPOS: Record<string, string> = {
  "teh": "the", "hte": "the", "taht": "that", "thier": "their",
  "recieve": "receive", "acheive": "achieve", "acheived": "achieved",
  "occured": "occurred", "occurence": "occurrence", "occurance": "occurrence",
  "seperate": "separate", "definately": "definitely", "definitly": "definitely",
  "accomodate": "accommodate", "acommodate": "accommodate",
  "occurr": "occur", "commited": "committed", "commitee": "committee",
  "enviroment": "environment", "enviromental": "environmental",
  "goverment": "government", "govenment": "government",
  "managment": "management", "manageing": "managing",
  "developement": "development", "devlopment": "development",
  "responsable": "responsible", "responsibilty": "responsibility",
  "maintanance": "maintenance", "maintainance": "maintenance",
  "performace": "performance", "preformance": "performance",
  "experiance": "experience", "experiece": "experience",
  "knowlege": "knowledge", "knowlede": "knowledge",
  "implmentation": "implementation", "implemntation": "implementation",
  "communicaiton": "communication", "communiction": "communication",
  "organiztion": "organization", "organistion": "organization",
  "proficiency": "proficiency", "proficency": "proficiency",
  "tecnology": "technology", "technolgy": "technology",
  "anaylsis": "analysis", "analsis": "analysis",
  "efficent": "efficient", "eficient": "efficient",
  "relavent": "relevant", "relevent": "relevant",
  "neccessary": "necessary", "necesary": "necessary",
  "succesful": "successful", "successfull": "successful",
  "proffesional": "professional", "profesional": "professional",
  "independant": "independent", "independnet": "independent",
  "colaborate": "collaborate", "colloborate": "collaborate",
  "adress": "address", "adddress": "address",
  "bussiness": "business", "busines": "business",
  "calender": "calendar", "calander": "calendar",
  "colum": "column", "collumn": "column",
  "completly": "completely", "compleatly": "completely",
  "consistant": "consistent", "consistnet": "consistent",
  "critcal": "critical", "criticle": "critical",
  "decison": "decision", "descision": "decision",
  "diffrent": "different", "diferent": "different",
  "excellant": "excellent", "excelent": "excellent",
  "immediat": "immediate", "imediately": "immediately",
  "langauge": "language", "langugage": "language",
  "liason": "liaison", "liasion": "liaison",
  "millenial": "millennial",
  "occurrrence": "occurrence",
  "oppertunity": "opportunity", "oportunity": "opportunity",
  "paralel": "parallel", "parrallel": "parallel",
  "publically": "publicly",
  "reccomend": "recommend", "recomend": "recommend",
  "refered": "referred", "reffered": "referred",
  "requirment": "requirement", "requirments": "requirements",
  "strenght": "strength", "stength": "strength",
  "throught": "through", "thoughout": "throughout",
  "untill": "until", "untl": "until",
  "widley": "widely", "wiedly": "widely",
};

/** Compute Levenshtein edit distance between two strings. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Limit computation for very long words
  if (Math.abs(a.length - b.length) > 3) return Math.abs(a.length - b.length);

  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/** Try to find suggestions for a misspelled word. Returns up to 3. */
function findSuggestions(word: string): string[] {
  const lower = word.toLowerCase();

  // Check known typos first
  if (COMMON_TYPOS[lower]) {
    return [COMMON_TYPOS[lower]];
  }

  // For short words, don't bother with edit-distance search (too noisy)
  if (lower.length < 4) return [];

  // Only search a subset of common words to keep it fast
  const candidates: Array<{ word: string; distance: number }> = [];
  const maxDist = lower.length <= 5 ? 1 : 2;

  for (const dictWord of COMMON_ENGLISH_WORDS) {
    // Quick length filter
    if (Math.abs(dictWord.length - lower.length) > maxDist) continue;
    // Quick first-letter filter (most typos keep the first letter)
    if (dictWord[0] !== lower[0] && dictWord[1] !== lower[0]) continue;

    const dist = editDistance(lower, dictWord);
    if (dist > 0 && dist <= maxDist) {
      candidates.push({ word: dictWord, distance: dist });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, 3).map((c) => c.word);
}

// ---------------------------------------------------------------------------
// Derived-form detection — avoids false positives on valid derived words
// ---------------------------------------------------------------------------

/** Check if a word is likely a valid derived form of a known dictionary word. */
function isLikelyDerivedForm(lower: string, dict: Set<string>): boolean {
  // Direct suffix stripping: try multiple candidate stems for each suffix
  const checks: Array<{ suffix: string; stems: string[] }> = [
    // Past tense / past participle "-ed"
    { suffix: "ed", stems: [lower.slice(0, -2), lower.slice(0, -2) + "e", lower.slice(0, -1)] },
    // "-ted" double consonant (e.g. "committed" -> "commit")
    { suffix: "ted", stems: [lower.slice(0, -3)] },
    // "-ded" (e.g. "added" -> "add")
    { suffix: "ded", stems: [lower.slice(0, -3)] },
    // "-ned" (e.g. "planned" -> "plan")
    { suffix: "ned", stems: [lower.slice(0, -3)] },
    // "-red" (e.g. "occurred" -> "occur")
    { suffix: "red", stems: [lower.slice(0, -3)] },
    // "-ied" (e.g. "studied" -> "study")
    { suffix: "ied", stems: [lower.slice(0, -3) + "y"] },
    // Present participle "-ing"
    { suffix: "ing", stems: [lower.slice(0, -3), lower.slice(0, -3) + "e"] },
    // "-ting" (e.g. "running" -> "run")
    { suffix: "ting", stems: [lower.slice(0, -4)] },
    // "-ning" (e.g. "planning" -> "plan")
    { suffix: "ning", stems: [lower.slice(0, -4)] },
    // "-ying" (e.g. "studying" -> "study")
    { suffix: "ying", stems: [lower.slice(0, -4) + "y"] },
    // "-ly"
    { suffix: "ly", stems: [lower.slice(0, -2), lower.slice(0, -2) + "e"] },
    // "-er" (comparative or agent noun)
    { suffix: "er", stems: [lower.slice(0, -2), lower.slice(0, -2) + "e", lower.slice(0, -1)] },
    // "-est"
    { suffix: "est", stems: [lower.slice(0, -3), lower.slice(0, -3) + "e"] },
    // "-tion"
    { suffix: "tion", stems: [lower.slice(0, -4) + "te", lower.slice(0, -4) + "t", lower.slice(0, -4)] },
    // "-sion"
    { suffix: "sion", stems: [lower.slice(0, -4) + "de", lower.slice(0, -4) + "d", lower.slice(0, -4) + "t"] },
    // "-ment"
    { suffix: "ment", stems: [lower.slice(0, -4), lower.slice(0, -4) + "e"] },
    // "-ness"
    { suffix: "ness", stems: [lower.slice(0, -4), lower.slice(0, -4) + "e"] },
    // "-ity"
    { suffix: "ity", stems: [lower.slice(0, -3), lower.slice(0, -3) + "e"] },
    // "-able" / "-ible"
    { suffix: "able", stems: [lower.slice(0, -4), lower.slice(0, -4) + "e", lower.slice(0, -4) + "ate"] },
    { suffix: "ible", stems: [lower.slice(0, -4), lower.slice(0, -4) + "e"] },
    // "-ful" / "-less"
    { suffix: "ful", stems: [lower.slice(0, -3), lower.slice(0, -3) + "e"] },
    { suffix: "less", stems: [lower.slice(0, -4), lower.slice(0, -4) + "e"] },
    // "-ous" / "-ive" / "-al"
    { suffix: "ous", stems: [lower.slice(0, -3), lower.slice(0, -3) + "e", lower.slice(0, -3) + "y"] },
    { suffix: "ive", stems: [lower.slice(0, -3), lower.slice(0, -3) + "e"] },
    { suffix: "al", stems: [lower.slice(0, -2), lower.slice(0, -2) + "e"] },
    // "-ize" / "-ise"
    { suffix: "ize", stems: [lower.slice(0, -3), lower.slice(0, -3) + "e"] },
    { suffix: "ise", stems: [lower.slice(0, -3), lower.slice(0, -3) + "e"] },
    // Plurals
    { suffix: "ies", stems: [lower.slice(0, -3) + "y"] },
    { suffix: "es", stems: [lower.slice(0, -2), lower.slice(0, -2) + "e"] },
    { suffix: "s", stems: [lower.slice(0, -1)] },
  ];

  for (const { suffix, stems } of checks) {
    if (!lower.endsWith(suffix)) continue;
    for (const stem of stems) {
      if (stem.length >= 2 && dict.has(stem)) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// checkSpelling
// ---------------------------------------------------------------------------

export function checkSpelling(rawText: string): CheckerResult {
  const issues: AtsIssue[] = [];
  let score = 100;
  const details: Record<string, unknown> = {};

  const lines = rawText.split("\n");
  const errors: Array<{ word: string; suggestions: string[]; line: number }> = [];
  const doubledWords: Array<{ word: string; line: number }> = [];

  // Build combined dictionary for quick lookup
  const allKnownWords = new Set<string>([
    ...COMMON_ENGLISH_WORDS,
    ...COMMON_SPANISH_WORDS,
    ...HR_TERMS,
  ]);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    // Tokenize
    const tokens = line.split(/[\s,;:()\[\]{}"'!?]+/).filter(Boolean);

    // ---- Doubled word detection ----
    for (let i = 1; i < tokens.length; i++) {
      if (
        tokens[i].toLowerCase() === tokens[i - 1].toLowerCase() &&
        tokens[i].length > 1
      ) {
        doubledWords.push({ word: tokens[i], line: lineIdx + 1 });
      }
    }

    // ---- Spell check individual words ----
    for (const rawToken of tokens) {
      // Strip leading/trailing punctuation
      const token = rawToken.replace(/^[.\-/#+@&*]+|[.\-/#+@&*]+$/g, "");
      if (token.length < 3) continue;

      const lower = token.toLowerCase();

      // Skip conditions — be very conservative
      // 1. Known dictionary word
      if (allKnownWords.has(lower)) continue;
      // 2. Tech term
      if (isTechTerm(token)) continue;
      // 3. Number or contains digits
      if (/\d/.test(token)) continue;
      // 4. URL or email fragment
      if (/[@:/.]/.test(rawToken)) continue;
      // 5. ALL CAPS (likely acronym)
      if (token === token.toUpperCase() && token.length <= 8) continue;
      // 6. Capitalized word mid-sentence or start of line (likely proper noun)
      if (token[0] === token[0].toUpperCase() && token.length > 1) continue;
      // 7. Possessives or contractions
      if (rawToken.includes("'") || rawToken.includes("'")) continue;
      // 8. Hyphenated compound — check parts individually
      if (token.includes("-")) {
        const parts = token.split("-");
        if (parts.every((p) => p.length < 2 || allKnownWords.has(p.toLowerCase()) || isTechTerm(p))) {
          continue;
        }
      }
      // 9. Common word endings that suggest valid word
      if (isLikelyDerivedForm(lower, allKnownWords)) continue;

      // At this point, only flag if we have a known typo match OR the word
      // is very close to a known word (edit distance 1)
      const knownTypo = COMMON_TYPOS[lower];
      if (knownTypo) {
        errors.push({
          word: token,
          suggestions: [knownTypo],
          line: lineIdx + 1,
        });
        continue;
      }

      // Only attempt edit-distance for words that look like they could be
      // English (basic Latin chars, reasonable length)
      if (/^[a-z]+$/i.test(token) && token.length >= 4 && token.length <= 20) {
        const suggestions = findSuggestions(token);
        if (suggestions.length > 0) {
          // Only flag if edit distance is 1 (very likely typo)
          const dist = editDistance(lower, suggestions[0]);
          if (dist === 1) {
            errors.push({
              word: token,
              suggestions,
              line: lineIdx + 1,
            });
          }
        }
      }
    }
  }

  // ---- Score calculation ----
  // Doubled words
  if (doubledWords.length > 0) {
    for (const dw of doubledWords.slice(0, 3)) {
      issues.push({
        check: "spelling_grammar",
        severity: "warning",
        message: `Doubled word "${dw.word} ${dw.word}" on line ${dw.line}.`,
        fix: `Remove the duplicate "${dw.word}".`,
      });
    }
    if (doubledWords.length > 3) {
      issues.push({
        check: "spelling_grammar",
        severity: "warning",
        message: `${doubledWords.length - 3} additional doubled words found.`,
        fix: "Review your CV for repeated words.",
      });
    }
    score -= Math.min(15, doubledWords.length * 5);
  }

  // Spelling errors
  if (errors.length > 0) {
    for (const err of errors.slice(0, 5)) {
      const sugText = err.suggestions.length > 0
        ? ` Did you mean: "${err.suggestions[0]}"?`
        : "";
      issues.push({
        check: "spelling_grammar",
        severity: "warning",
        message: `Possible misspelling: "${err.word}" (line ${err.line}).${sugText}`,
        fix: err.suggestions.length > 0
          ? `Replace "${err.word}" with "${err.suggestions[0]}".`
          : `Check the spelling of "${err.word}".`,
      });
    }
    if (errors.length > 5) {
      issues.push({
        check: "spelling_grammar",
        severity: "info",
        message: `${errors.length - 5} additional potential spelling issues found.`,
        fix: "Run a spell checker on your CV to catch remaining errors.",
      });
    }
    score -= Math.min(30, errors.length * 5);
  }

  if (errors.length === 0 && doubledWords.length === 0) {
    details.status = "clean";
  }

  details.errorsFound = errors.length;
  details.doubledWordsFound = doubledWords.length;
  details.errors = errors.slice(0, 10).map((e) => ({
    word: e.word,
    suggestions: e.suggestions,
    line: e.line,
  }));

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    details,
  };
}
