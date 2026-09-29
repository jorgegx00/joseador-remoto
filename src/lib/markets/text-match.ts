/**
 * Text-matching primitives shared by the DR classifier (src/lib/dr-filter.ts) and
 * the multi-market eligibility engine (src/lib/markets/eligibility.ts).
 *
 * All vocabularies are normalized (lowercase, no diacritics); callers normalize
 * the text with {@link normalize} first.
 */

export const REMOTE_KEYWORDS: readonly string[] = [
  "remote",
  "remoto",
  "remota",
  "anywhere",
  "distributed",
  "work from home",
  "telecommute",
  "worldwide",
  "global",
];

/**
 * Remote terms trusted in the head to override an on-site/hybrid mention. Narrower
 * than {@link REMOTE_KEYWORDS}: titles say "Distributed Systems" / "Global Payments".
 */
export const HEAD_REMOTE_TERMS: readonly string[] = [
  "remote",
  "remoto",
  "remota",
  "anywhere",
  "work from home",
  "telecommute",
  "worldwide",
];

/**
 * Unambiguous "we hire globally" phrases. Their presence (with no restriction)
 * lets us mark a job `global_remote` without spending an LLM call. Kept narrow
 * on purpose — bare "global"/"worldwide" adjectives are excluded because they
 * routinely describe the *company* ("global leader"), not the hiring scope; those
 * fall through to `ambiguous` for the LLM to judge.
 */
export const STRONG_GLOBAL_SIGNALS: readonly string[] = [
  "worldwide",
  "world wide",
  "anywhere in the world",
  "work from anywhere in the world",
  "from anywhere in the world",
  "globally distributed",
  "fully distributed",
  "hire globally",
  "hiring globally",
  "hire from anywhere",
  "hiring from anywhere",
  "work from any country",
  "from any country",
  "any country in the world",
  "no location requirement",
  "no geographic restriction",
  "location independent",
  "open to any location",
];

/**
 * Explicit US / non-LATAM *work-eligibility* restrictions that don't necessarily
 * name a city or state (so the location check would miss them). A match ⇒
 * `restricted`. Deliberately excludes time-zone / working-hours phrases — a US
 * time-zone requirement does NOT disqualify a LATAM-based candidate.
 */
export const US_RESTRICTION_PHRASES: readonly string[] = [
  "authorized to work in the united states",
  "authorized to work in the us",
  "authorization to work in the united states",
  "us work authorization",
  "u.s. work authorization",
  "work authorization in the united states",
  "must be based in the us",
  "must be based in the united states",
  "us-based only",
  "u.s.-based only",
  "based in the united states",
  "must reside in the united states",
  "must reside in the us",
  "must live in the united states",
  "us residents only",
  "u.s. residents only",
  "us citizens only",
  "u.s. citizens only",
  "must be a us citizen",
  "must be a u.s. citizen",
  "green card",
  "eligible to work in the us",
  "eligible to work in the united states",
  "north america only",
  "within north america",
  "across north america",
];

/** Bare on-site/hybrid terms — trusted in the location field and as title tags. */
export const ONSITE_HEAD_TERMS: readonly string[] = [
  "on-site",
  "onsite",
  "on site",
  "in-office",
  "in office",
  "office-based",
  "office based",
  "in-person",
  "in person",
  "hybrid",
  "presencial",
  "hibrido",
  "hibrida",
];

/**
 * On-site/hybrid phrasing in prose. Bare "hybrid"/"onsite" are NOT here: dev
 * postings say "hybrid apps", "hybrid cloud", "onsite interviews" all the time.
 */
export const ONSITE_BODY_PATTERNS: readonly RegExp[] = [
  /\b(?:on-?site|on site|in-office|in office|in-person|in person|hybrid|office-based)\s+(?:role|position|job|work|working|schedule|model|arrangement|setup|basis|requirement|policy|presence)\b/,
  /\b(?:role|position|job) is (?:a |an )?(?:fully |100% )?(?:on-?site|on site|hybrid|in-office|in office|in-person|in person|office-based)\b/,
  /\b(?:fully|100%) (?:on-?site|in-office|in office|in-person|presencial)\b/,
  /\b\d+(?:\s*-\s*\d+)?\s*(?:days?|x) (?:a|per|each|every|\/) ?week (?:in|at|from) (?:the|our|an?) (?:office|hq|headquarters|campus)\b/,
  /\b\d+(?:\s*-\s*\d+)?\s*days? (?:a|per|each|every) week (?:on-?site|in-office|in office|in person)\b/,
  /\bmust (?:be (?:willing|able) to )?relocate\b/,
  /\brelocation (?:is )?required\b/,
  /\bwilling(?:ness)? to relocate to\b/,
  /\b(?:must|able to|need to) commute\b/,
  /\bcommut(?:able|ing) distance\b/,
  /\b(?:must|required to|expected to) (?:work|report) (?:from|in|at|to) (?:the|our) (?:office|hq|headquarters)\b/,
  /\b(?:modalidad|esquema|trabajo|puesto) (?:100% )?(?:presencial|hibrid[oa])\b/,
];

/** Words that turn a following place into an exclusion ("LATAM excluding DR"). */
export const EXCLUSION_RE =
  /\b(?:excluding|exclude|excludes|except|excepting|other than|not (?:open|available|eligible|hiring)|outside(?: of)?|excepto|excluyendo|salvo|menos|no (?:incluye|aplica))\b[^.;!?\n]*$/;

/**
 * Phrases that scope eligibility to the place(s) named right after them. Group 0
 * ends where the place list starts.
 */
export const ELIGIBILITY_TRIGGERS: readonly RegExp[] = [
  /\b(?:based|located|residing|living|domiciled) (?:only )?in\b/g,
  /\bresidents? of\b/g,
  /\breside in\b/g,
  /\bopen (?:only )?to (?:candidates|applicants|people|professionals|talent|residents)? ?(?:based |located )?(?:in|from)\b/g,
  /\b(?:candidates|applicants) (?:must be |should be )?(?:based |located )?(?:in|from)\b/g,
  /\bhiring (?:only )?(?:in|from)\b/g,
  /\b(?:authorized|eligible|authorization|permit) to work in\b/g,
  /\bonly (?:in|from|for candidates in)\b/g,
  /\bresidir en\b/g,
  /\b(?:radicad|ubicad|domiciliad)[oa]s? en\b/g,
  /\bresidentes? en\b/g,
  /\b(?:solo|solamente|unicamente) (?:en|para|desde|a)?\b/g,
  /\bremot[oa] desde\b/g,
];

/** "based in X" preceded by one of these describes the company, not the candidate. */
export const COMPANY_SUBJECT_RE =
  /\b(?:company|we|we're|we are|our|headquartered|hq|office|offices|startup|firm|founded|team is|agency)\b[^.;!?\n]*$/;

/** A list following one of these is a set of examples, not a restriction. */
export const EXAMPLES_RE =
  /(?:^|[^a-z])(?:such as|e\.g\.?|including|includes|include|like|for example|for instance|incluyendo|incluye|como|por ejemplo|p\. ?ej\.?)(?=[^a-z]|$)/;

/** A list ending in one of these is open-ended — examples again. */
export const OPEN_ENDED_RE = /\b(?:etc|and more|and others|and other|among others|entre otros|y otros|y mas)\b/;

/** Lowercase and strip diacritics so "República" and "Republica" match alike. */
export function normalize(s: string): string {
  return stripDiacritics(s).toLowerCase();
}

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[a-zA-Z0-9]/.test(ch);
}

/** Every index where `term` occurs in `text` as a whole word/phrase. */
export function termIndices(text: string, term: string): number[] {
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const idx = text.indexOf(term, from);
    if (idx === -1) return out;
    const startsWord = isWordChar(term[0]);
    const endsWord = isWordChar(term[term.length - 1]);
    const okBefore = !startsWord || !isWordChar(text[idx - 1]);
    const okAfter = !endsWord || !isWordChar(text[idx + term.length]);
    if (okBefore && okAfter) out.push(idx);
    from = idx + 1;
  }
}

export function containsTerm(text: string, term: string): boolean {
  return termIndices(text, term).length > 0;
}

export function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((t) => containsTerm(text, t));
}

/** True when the place at `idx` sits inside an exclusion clause. */
export function isExcludedAt(text: string, idx: number): boolean {
  return EXCLUSION_RE.test(text.slice(Math.max(0, idx - 60), idx));
}

/** Occurrences of any term, split into included vs excluded mentions. */
export function scanMentions(text: string, terms: readonly string[]): { included: boolean; excluded: boolean } {
  let included = false;
  let excluded = false;
  for (const term of terms) {
    for (const idx of termIndices(text, term)) {
      if (isExcludedAt(text, idx)) excluded = true;
      else included = true;
    }
  }
  return { included, excluded };
}

/** Drop example lists ("LATAM, including Colombia and Mexico", "(Brazil, Chile, etc.)") from a span. */
export function stripExamples(span: string): string {
  // Open-ended parentheticals are examples wholesale; an open-ended list outside
  // parentheses leaves nothing we can trust as a restriction.
  let text = span.replace(/\([^)]*\)/g, (group) => (OPEN_ENDED_RE.test(group) ? " " : group));
  if (OPEN_ENDED_RE.test(text)) return "";
  const m = EXAMPLES_RE.exec(text);
  if (!m) return text;
  const close = text.indexOf(")", m.index);
  text = text.slice(0, m.index) + (close === -1 ? "" : text.slice(close + 1));
  return text;
}

/** On-site/hybrid signal in the location field, or as a title tag "(Hybrid)" / "- Onsite". */
export function hasOnsiteInHead(loc: string, title: string): boolean {
  if (containsAny(loc, ONSITE_HEAD_TERMS)) return true;
  return ONSITE_HEAD_TERMS.some((t) =>
    new RegExp(`(?:\\(|\\[|[-–|,/])\\s*(?:[a-z ]*,\\s*)?${t.replace(/[-]/g, "\\-")}(?![a-z])`).test(title),
  );
}

export function hasOnsiteInBody(body: string): boolean {
  return ONSITE_BODY_PATTERNS.some((re) => re.test(body));
}
