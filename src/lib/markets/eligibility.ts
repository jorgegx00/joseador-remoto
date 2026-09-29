/**
 * Multi-market location eligibility.
 *
 * Two steps, so the expensive text scan runs once per job however many markets
 * the user targets:
 *  1. {@link extractLocationScope} reads title + location + description into a
 *     structured {@link LocationScope} (where the role is, who it hires, which work
 *     authorization it needs, remote/on-site).
 *  2. {@link assessMarket} judges that scope against one target market.
 *
 * The scoping rules follow src/lib/dr-filter.ts: the head (title + location) is
 * authoritative; the description only narrows eligibility through explicit
 * eligibility phrases ("must be based in Colombia"), because descriptions mention
 * HQs, offices and customer markets that say nothing about who is hired. A US
 * *time-zone* requirement is never a restriction.
 *
 * For users living in the Dominican Republic the hand-tuned DR classifier stays
 * authoritative for the DO / LATAM / CARIBBEAN / WORLDWIDE markets (see
 * {@link assessJobMarkets}), so existing behaviour is unchanged.
 */

import { isDrFriendly } from "@/lib/dr-filter";
import type {
  DrEligibility,
  LocationScope,
  MarketEligibility,
  MarketProfile,
  MarketVerdict,
  TargetMarket,
} from "@/types";
import {
  LAUNCH_COUNTRIES,
  countryName,
  isKnownCountry,
  getCountryProfile,
  locationCodeMap,
  placeTerms,
} from "./countries";
import { REGIONS, isRegionCode, regionContains, type RegionCode } from "./regions";
import {
  COMPANY_SUBJECT_RE,
  ELIGIBILITY_TRIGGERS,
  HEAD_REMOTE_TERMS,
  REMOTE_KEYWORDS,
  STRONG_GLOBAL_SIGNALS,
  US_RESTRICTION_PHRASES,
  containsAny,
  hasOnsiteInBody,
  hasOnsiteInHead,
  isExcludedAt,
  normalize,
  stripDiacritics,
  stripExamples,
  termIndices,
} from "./text-match";

/** Bump when the rules below change so stored verdicts are recomputed. */
export const ELIGIBILITY_RULES_VERSION = "1";

// ---------------------------------------------------------------------------
// Place detection
// ---------------------------------------------------------------------------

interface PlaceHits {
  countries: Set<string>;
  regions: Set<RegionCode>;
  excludedCountries: Set<string>;
  excludedRegions: Set<RegionCode>;
}

function emptyHits(): PlaceHits {
  return { countries: new Set(), regions: new Set(), excludedCountries: new Set(), excludedRegions: new Set() };
}

function mergeHits(into: PlaceHits, from: PlaceHits): void {
  from.countries.forEach((c) => into.countries.add(c));
  from.regions.forEach((r) => into.regions.add(r));
  from.excludedCountries.forEach((c) => into.excludedCountries.add(c));
  from.excludedRegions.forEach((r) => into.excludedRegions.add(r));
}

let regionTermsCache: Array<{ term: string; region: RegionCode; weak: boolean }> | null = null;

function regionTerms() {
  if (!regionTermsCache) {
    const list: Array<{ term: string; region: RegionCode; weak: boolean }> = [];
    for (const def of Object.values(REGIONS)) {
      def.terms.forEach((term) => list.push({ term, region: def.code, weak: false }));
      def.weakTerms?.forEach((term) => list.push({ term, region: def.code, weak: true }));
    }
    regionTermsCache = list.sort((a, b) => b.term.length - a.term.length);
  }
  return regionTermsCache;
}

type AnyTerm =
  | { term: string; kind: "region"; region: RegionCode; weak: boolean }
  | { term: string; kind: "place"; country: string; scopedOnly: boolean };

let allTermsCache: AnyTerm[] | null = null;

/** Region and place vocabularies merged, longest first. */
function allTerms(): AnyTerm[] {
  allTermsCache ??= [
    ...regionTerms().map((r) => ({ term: r.term, kind: "region" as const, region: r.region, weak: r.weak })),
    ...placeTerms().map((p) => ({ term: p.term, kind: "place" as const, country: p.country, scopedOnly: p.scopedOnly })),
  ].sort((a, b) => b.term.length - a.term.length);
  return allTermsCache;
}

/** Weak terms that span both Americas ("Remote – Americas" hires in the US/CA too). */
const BOTH_AMERICAS = new Set(["americas", "western hemisphere"]);

/**
 * Countries/regions named in a normalized span. Longer terms (of either kind)
 * claim their characters first, so "santiago de los caballeros" (DO) hides
 * "santiago" (CL) and "south africa" (ZA) hides the "africa" region.
 */
function findPlaces(span: string, opts: { head: boolean }): PlaceHits {
  const text = stripExamples(span);
  const hits = emptyHits();
  const claimed = new Uint8Array(text.length);
  const claim = (idx: number, len: number): boolean => {
    for (let i = idx; i < idx + len; i++) if (claimed[i]) return false;
    claimed.fill(1, idx, idx + len);
    return true;
  };

  for (const t of allTerms()) {
    if (t.kind === "region" ? t.weak && !opts.head : t.scopedOnly && !opts.head) continue;
    for (const idx of termIndices(text, t.term)) {
      if (!claim(idx, t.term.length)) continue;
      const excluded = isExcludedAt(text, idx);
      if (t.kind === "place") {
        (excluded ? hits.excludedCountries : hits.countries).add(t.country);
        continue;
      }
      const target = excluded ? hits.excludedRegions : hits.regions;
      target.add(t.region);
      if (BOTH_AMERICAS.has(t.term)) target.add("NA");
    }
  }
  return hits;
}

const US_STATE_CODES = new Set(
  ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM " +
    "NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC").split(" "),
);

/**
 * Case-sensitive codes in the raw location field ("Remote, US", "Santo Domingo, RD",
 * "Austin, TX"). A two-letter code after a comma that is a US state abbreviation
 * means the US ("Denver, CO" is Colorado, not Colombia).
 */
function findLocationCodes(rawLocation: string, namedCountries: ReadonlySet<string>): PlaceHits {
  const hits = emptyHits();
  const loc = stripDiacritics(rawLocation);
  const lower = loc.toLowerCase();
  const codes = locationCodeMap();
  const re = /(^|[^A-Za-z])([A-Z]{2,3})(?![A-Za-z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(loc)) !== null) {
    const code = m[2];
    const idx = m.index + m[1].length;
    const afterComma = /,\s*$/.test(loc.slice(0, idx));
    let country: string | undefined;
    if (afterComma && US_STATE_CODES.has(code)) {
      // "Toronto, ON" names Canada already; a state-looking code there isn't the US.
      if (namedCountries.size > 0 && !namedCountries.has("US")) continue;
      // "Remote, DE" / "Nuremberg, DE": Delaware or Germany? Without a US place
      // to settle it, keep both rather than wrongly restricting either reading.
      if (!namedCountries.has("US") && isKnownCountry(code)) {
        (isExcludedAt(lower, idx) ? hits.excludedCountries : hits.countries).add(code);
      }
      country = "US";
    } else {
      country = codes.get(code);
    }
    if (!country) {
      if (code === "EU") (isExcludedAt(lower, idx) ? hits.excludedRegions : hits.regions).add("EU");
      continue;
    }
    (isExcludedAt(lower, idx) ? hits.excludedCountries : hits.countries).add(country);
  }
  return hits;
}

/** Triggers beyond dr-filter's list (Spanish/Portuguese phrasing, "hiring across"). */
const EXTRA_TRIGGERS: readonly RegExp[] = [
  /\b(?:abiert[oa]|disponible) (?:a|para) (?:candidat[oa]s|profesionales|personas|talento)? ?(?:en|de|desde)\b/g,
  /\bcandidat[oa]s (?:que (?:residan|vivan|esten) )?(?:en|de|desde)\b/g,
  /\b(?:aberta?|disponivel) (?:a|para) (?:candidat[oa]s|profissionais|pessoas)? ?(?:no|na|em|de)\b/g,
  /\b(?:hiring|recruiting|hire) (?:across|throughout|within)\b/g,
];

/** Places the description explicitly scopes eligibility to, plus required work authorizations. */
function findScopedBodyPlaces(body: string): { places: PlaceHits; workAuth: Set<string> } {
  const places = emptyHits();
  const workAuth = new Set<string>();

  for (const trigger of [...ELIGIBILITY_TRIGGERS, ...EXTRA_TRIGGERS]) {
    trigger.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = trigger.exec(body)) !== null) {
      const before = body.slice(Math.max(0, m.index - 40), m.index);
      if (/^(?:based|located)/.test(m[0]) && COMPANY_SUBJECT_RE.test(before)) continue;
      const rest = body.slice(m.index + m[0].length);
      // "etc." inside an examples parenthetical doesn't end the clause.
      const end = rest.search(/(?<!\betc)[.;!?\n]| but | while | and we /);
      const segment = rest.slice(0, Math.min(end === -1 ? rest.length : end, 100));
      const hits = findPlaces(segment, { head: true });
      if (/work in$/.test(m[0])) {
        hits.countries.forEach((c) => workAuth.add(c));
        hits.regions.forEach((r) => REGIONS[r].countries.forEach((c) => workAuth.add(c)));
      } else {
        mergeHits(places, hits);
      }
    }
  }

  // "Colombia only" / "Brazil-based only" / "Greece residents only". Scans backwards
  // from each "only" so the cost doesn't grow with the size of the place vocabulary.
  for (const onlyIdx of termIndices(body, "only")) {
    const before = body.slice(Math.max(0, onlyIdx - 60), onlyIdx);
    const m = /(?:^|[^a-z])([a-z][a-z .'-]*?)\s*[-–]?\s*(based\s+|residents?\s+|citizens?\s+)?$/.exec(before);
    if (!m) continue;
    const words = m[1].trim();
    const p = placeTerms().find((t) => !t.scopedOnly && words.endsWith(t.term) && (words.length === t.term.length || words[words.length - t.term.length - 1] === " "));
    if (!p) continue;
    if (m[2] && /citizen/.test(m[2])) workAuth.add(p.country);
    else places.countries.add(p.country);
  }

  // Region right after a remote word: "remote (LATAM)", "remote - Europe", "remote in EMEA".
  for (const kw of ["remote", "remoto", "remota"]) {
    for (const idx of termIndices(body, kw)) {
      const window = body.slice(idx + kw.length, idx + kw.length + 25);
      const lead = /^\s*(?:\(|-|–|—|,|:|in|within|across|from|en|desde|dentro de)\s*/.exec(window);
      if (!lead) continue;
      const tail = window.slice(lead[0].length);
      for (const { term, region, weak } of regionTerms()) {
        if (!weak && termIndices(tail, term)[0] === 0) places.regions.add(region);
      }
    }
  }

  return { places, workAuth };
}

// ---------------------------------------------------------------------------
// Scope extraction
// ---------------------------------------------------------------------------

const NORTH_AMERICA_PHRASES = ["north america only", "within north america", "across north america"];

const VISA_YES_RE =
  /\b(?:visa sponsorship (?:is )?(?:available|provided|offered)|(?:we|will|can) sponsor(?: your)? (?:work )?visas?|sponsorship (?:is )?available|relocation and visa support)\b/;
const VISA_NO_RE =
  /\b(?:(?:no|not|unable to|cannot|can't|won't|will not|do not|does not|don't) (?:provide |offer |support )?(?:visa )?sponsor(?:ship)?|without (?:the need for )?(?:visa )?sponsorship|sponsorship is not available)\b/;

export function extractLocationScope(location: string, description: string, title = ""): LocationScope {
  const loc = normalize(location ?? "");
  const body = normalize(description ?? "");
  const titleN = normalize(title ?? "");
  const head = `${titleN} | ${loc}`;
  const combined = `${head} | ${body}`;

  const places = findPlaces(head, { head: true });
  mergeHits(places, findLocationCodes(location ?? "", findPlaces(loc, { head: true }).countries));
  const scoped = findScopedBodyPlaces(body);
  mergeHits(places, scoped.places);

  const workAuth = new Set(scoped.workAuth);
  for (const phrase of US_RESTRICTION_PHRASES) {
    if (!combined.includes(phrase)) continue;
    if (NORTH_AMERICA_PHRASES.includes(phrase)) places.regions.add("NA");
    else workAuth.add("US");
  }
  if (/\bright to work in the uk\b|\buk right to work\b/.test(combined)) workAuth.add("GB");

  const headRemote = containsAny(head, HEAD_REMOTE_TERMS);
  const headOnsite = hasOnsiteInHead(loc, titleN);
  const bodyOnsite = hasOnsiteInBody(body);
  const onsite = headOnsite || bodyOnsite;
  const hybrid = /\bhybrid\b|\bhibrid[oa]\b/.test(combined) && onsite;
  const remoteMentioned = containsAny(combined, REMOTE_KEYWORDS);
  const workplace = headRemote
    ? "remote"
    : onsite
      ? hybrid
        ? "hybrid"
        : "onsite"
      : remoteMentioned
        ? "remote"
        : "unknown";

  const visaSponsorship = VISA_NO_RE.test(body) ? "no" : VISA_YES_RE.test(body) ? "yes" : "unknown";

  const countries = [...places.countries].filter((c) => !places.excludedCountries.has(c)).sort();
  let regions = [...places.regions].filter((r) => !places.excludedRegions.has(r)).sort();
  // Countries inside the named region narrow it: "LATAM – Bogotá, Colombia" and
  // "Remote - LATAM (Mexico)" are about Colombia / Mexico, not all of LATAM.
  // "LATAM or Spain" keeps both, since Spain is outside LATAM.
  if (countries.length > 0 && countries.every((c) => regions.some((r) => regionContains(r, c)))) {
    regions = [];
  }

  return {
    workplace,
    countries,
    regions,
    excludedCountries: [...places.excludedCountries].sort(),
    excludedRegions: [...places.excludedRegions].sort(),
    workAuth: [...workAuth].sort(),
    global: remoteMentioned && STRONG_GLOBAL_SIGNALS.some((s) => combined.includes(s)),
    remoteMentioned,
    onsiteConflict: headRemote && onsite,
    visaSponsorship,
  };
}

// ---------------------------------------------------------------------------
// Market assessment
// ---------------------------------------------------------------------------

export interface AssessContext {
  residenceCountry: string;
  /** Citizenships + work authorizations the user holds. */
  authorizations: string[];
  /** UI locale for reason strings' place names. */
  uiLocale?: string;
}

function placeList(scope: LocationScope, locale: string): string {
  const names = [
    ...scope.countries.map((c) => countryName(c, locale)),
    ...scope.regions.map((r) => r),
  ];
  return names.slice(0, 4).join(", ") + (names.length > 4 ? ", …" : "");
}

function authCovers(required: string[], country: string, held: string[]): boolean {
  const covered = new Set([country, ...(getCountryProfile(country).workAuthCoveredBy ?? []), ...held]);
  for (const h of held) getCountryProfile(h).workAuthCoveredBy?.forEach((c) => covered.add(c));
  return required.some((r) => covered.has(r));
}

function v(verdict: MarketVerdict, reason: string): MarketEligibility {
  return { verdict, reason };
}

/**
 * Judge a job's scope against one target market.
 *
 * - Country market C: the role is located in or open to C (on-site in C counts).
 * - Region market R: the role hires across R, or includes the user's residence
 *   (when it is inside R). Remote-oriented: on-site elsewhere doesn't count.
 * - WORLDWIDE: remote roles the user can take from where they live.
 */
export function assessMarket(scope: LocationScope, market: TargetMarket, ctx: AssessContext): MarketEligibility {
  const locale = ctx.uiLocale ?? "en";
  const isRegion = isRegionCode(market);
  const home = ctx.residenceCountry;
  // The country whose residents we are asking about.
  const subject = isRegion ? (market === "WORLDWIDE" || regionContains(market, home) ? home : null) : market;
  const subjectName = subject ? countryName(subject, locale) : market;

  // 1. Explicit exclusion.
  if (subject && scope.excludedCountries.includes(subject)) return v("restricted", `Excludes ${subjectName}`);
  if (subject && scope.excludedRegions.some((r) => regionContains(r, subject))) {
    return v("restricted", `Excludes ${subjectName}`);
  }
  if (isRegion && scope.excludedRegions.includes(market as RegionCode)) return v("restricted", `Excludes ${market}`);

  // 2. Work authorization the market (or the user) doesn't have.
  if (scope.workAuth.length > 0) {
    const ok = subject ? authCovers(scope.workAuth, subject, ctx.authorizations) : false;
    if (!ok) {
      const names = scope.workAuth.slice(0, 3).map((c) => countryName(c, locale)).join(", ");
      return v("restricted", `Requires work authorization in ${names}`);
    }
  }

  // A required work authorization also says where the role hires: "remote, must be
  // authorized to work in the US" is a US role, so it counts as naming the US.
  const scopeCountries = [...new Set([...scope.countries, ...scope.workAuth])];
  const named = scopeCountries.length > 0 || scope.regions.length > 0;
  const includesSubject =
    !!subject &&
    (scopeCountries.includes(subject) ||
      (getCountryProfile(subject).workAuthCoveredBy ?? []).some((c) => scope.workAuth.includes(c)) ||
      scope.regions.some((r) => r !== "WORLDWIDE" && regionContains(r, subject)));
  const includesRegion =
    isRegion &&
    market !== "WORLDWIDE" &&
    scope.regions.some((r) => r === market || REGIONS[market as RegionCode].countries.every((c) => regionContains(r, c)));

  // 3. On-site / hybrid.
  if (scope.workplace === "onsite" || scope.workplace === "hybrid") {
    const label = scope.workplace === "hybrid" ? "Hybrid" : "On-site";
    const onsiteHere = !!subject && scope.countries.includes(subject);
    if (onsiteHere && (!isRegion || subject === home)) return v("explicit", `${label} in ${subjectName}`);
    if (named) return v("restricted", `${label} in ${placeList(scope, locale)}`);
    return v("ambiguous", `${label}, location unclear — needs review`);
  }

  const downgrade = (r: MarketEligibility): MarketEligibility =>
    scope.onsiteConflict ? v("ambiguous", "Remote listing mentions on-site/hybrid — needs review") : r;

  // 4. Named places decide.
  if (named) {
    if (includesSubject || includesRegion) {
      return downgrade(v("explicit", `Open to ${isRegion && !includesSubject ? market : subjectName}`));
    }
    return v("restricted", `Limited to: ${placeList(scope, locale)}`);
  }

  // 5. Worldwide statement.
  if (scope.global) return downgrade(v("global", "Global remote (no location restriction)"));

  // 6. Bare "remote" — often really US-only; leave for the LLM adjudicator.
  if (scope.remoteMentioned) return v("ambiguous", "Ambiguous remote — needs review");
  return v("ambiguous", "Unable to determine location eligibility");
}

const DR_TIER_TO_VERDICT: Record<DrEligibility, MarketVerdict> = {
  explicit_latam: "explicit",
  global_remote: "global",
  restricted: "restricted",
  ambiguous: "ambiguous",
};

/** Markets where, for a DR resident, the DR classifier's answer is the right one. */
const DR_DELEGATED_MARKETS = new Set(["DO", "LATAM", "CARIBBEAN", "WORLDWIDE"]);

export function isEligibleVerdict(verdict: MarketVerdict | null | undefined): boolean {
  return verdict === "explicit" || verdict === "global";
}

export interface JobMarketAssessment {
  scope: LocationScope;
  markets: Record<TargetMarket, MarketEligibility>;
  /** Eligible for at least one target market. */
  eligible: boolean;
  /** The most accessible verdict across markets (drives the badge). */
  best: MarketEligibility & { market: TargetMarket };
}

const VERDICT_RANK: Record<MarketVerdict, number> = { explicit: 0, global: 1, ambiguous: 2, restricted: 3 };

export function contextFromProfile(profile: MarketProfile, uiLocale?: string): AssessContext {
  return {
    residenceCountry: profile.residenceCountry,
    authorizations: [...new Set([profile.residenceCountry, ...profile.citizenships, ...profile.workAuthorizations])],
    uiLocale,
  };
}

/** Assess a job against every market in the profile. */
/**
 * True when the keyword rules found nothing decisive: no place, no worldwide
 * statement, no work-authorization requirement. These are the jobs worth an LLM call.
 */
export function isUninformativeScope(scope: LocationScope): boolean {
  return (
    scope.countries.length === 0 &&
    scope.regions.length === 0 &&
    scope.excludedCountries.length === 0 &&
    scope.excludedRegions.length === 0 &&
    scope.workAuth.length === 0 &&
    !scope.global &&
    !scope.onsiteConflict
  );
}

export function assessJobMarkets(
  job: { location: string; description: string; title: string },
  profile: MarketProfile,
  uiLocale?: string,
  /** A previously LLM-adjudicated scope; used only when the keyword scope is uninformative. */
  aiScope?: LocationScope | null,
): JobMarketAssessment {
  const keywordScope = extractLocationScope(job.location, job.description, job.title);
  const scope = aiScope?.ai && isUninformativeScope(keywordScope) ? aiScope : keywordScope;
  const ctx = contextFromProfile(profile, uiLocale);
  const drResident = profile.residenceCountry === "DO";
  const dr = drResident ? isDrFriendly(job.location, job.description, job.title) : null;

  const markets: Record<TargetMarket, MarketEligibility> = {};
  for (const market of profile.targetMarkets) {
    if (dr && DR_DELEGATED_MARKETS.has(market)) {
      markets[market] = { verdict: DR_TIER_TO_VERDICT[dr.eligibility], reason: dr.reason };
      continue;
    }
    const r = assessMarket(scope, market, ctx);
    markets[market] = scope.ai ? { ...r, reason: `AI: ${r.reason}` } : r;
  }

  const ranked = Object.entries(markets).sort(([, a], [, b]) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict]);
  const [bestMarket, bestResult] = ranked[0] ?? [profile.residenceCountry, v("ambiguous", "No target markets")];
  return {
    scope,
    markets,
    eligible: ranked.some(([, r]) => isEligibleVerdict(r.verdict)),
    best: { market: bestMarket, ...bestResult },
  };
}

/** Launch countries in UI order, for pickers. */
export function launchCountryCodes(): string[] {
  return Object.keys(LAUNCH_COUNTRIES);
}
