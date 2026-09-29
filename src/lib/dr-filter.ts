/**
 * Dominican Republic / LATAM eligibility filter.
 *
 * A cheap, synchronous, keyword-only classifier that assigns each job a
 * {@link DrEligibility} tier. It is deliberately *precision*-oriented: a bare
 * "remote"/"anywhere" posting with no supporting signal is NOT assumed friendly
 * (many such "anywhere" roles are really US-only) — it is marked `ambiguous` and
 * left for the optional LLM adjudicator (src/services/dr-adjudicate.ts) to resolve.
 *
 * Generic LATAM/Caribbean postings ARE friendly (the DR is part of LATAM) unless an
 * explicit narrowing signal says otherwise: the DR is excluded, the role is limited
 * to named countries/cities that don't include the DR, it's on-site/hybrid outside
 * the DR, or it carries a US/region work-eligibility requirement.
 *
 * Text is scoped: the "head" (title + location) states where the job is and is
 * authoritative; the description only narrows eligibility through explicit
 * eligibility phrases ("must be based in Colombia"), because descriptions routinely
 * mention HQs, offices and markets that say nothing about who they hire.
 *
 * Used at ingest (src/services/ingest/map.ts) and by the backfill routine
 * (src/services/dr-backfill.ts) to (re)compute eligibility without a re-scrape.
 *
 * IMPORTANT: a US *time-zone* requirement is NOT a disqualifier — many US-timezone
 * roles hire from LATAM — so timezone phrases must never appear in the restriction list.
 */

import type { DrEligibility } from "@/types";
import {
  REMOTE_KEYWORDS,
  HEAD_REMOTE_TERMS,
  STRONG_GLOBAL_SIGNALS,
  US_RESTRICTION_PHRASES,
  ELIGIBILITY_TRIGGERS,
  COMPANY_SUBJECT_RE,
  normalize,
  stripDiacritics,
  termIndices,
  containsTerm,
  containsAny,
  isExcludedAt,
  scanMentions,
  stripExamples,
  hasOnsiteInHead,
  hasOnsiteInBody,
} from "@/lib/markets/text-match";

export { normalize };

export interface DrFilterResult {
  friendly: boolean;
  reason: string;
  eligibility: DrEligibility;
}

// ---------------------------------------------------------------------------
// Vocabulary (all entries normalized: lowercase, no diacritics)
// ---------------------------------------------------------------------------

/**
 * Every way a posting names the Dominican Republic or one of its cities/areas.
 * Word-boundary matched against normalized text. Ambiguous city names that also
 * exist elsewhere (Santiago, La Vega, San Cristóbal, Moca, Baní) are deliberately
 * absent — they only count when one of these unambiguous aliases is also present.
 */
export const DR_ALIASES: readonly string[] = [
  "dominican republic",
  "republica dominicana",
  "rep. dominicana",
  "rep dominicana",
  "rep. dom.",
  "rep. dom",
  "rep dom",
  "r.d.",
  "d.r.",
  "dominicana",
  "dominican",
  "quisqueya",
  "santo domingo",
  "distrito nacional",
  "santiago de los caballeros",
  "puerto plata",
  "san francisco de macoris",
  "punta cana",
  "bavaro",
  "higuey",
  "la romana",
  "san pedro de macoris",
];

/**
 * Short DR codes. Case-sensitive and matched in the LOCATION field only — in prose
 * they collide with "Dr." / "do", and in titles "DR" often means disaster recovery.
 */
const DR_CODES: readonly string[] = ["DR", "RD", "DO", "DOM", "SDQ"];

/** LATAM/Caribbean region terms — the DR is part of every one of these. */
const LATAM_REGION_TERMS: readonly string[] = [
  "latam",
  "latin america",
  "latinoamerica",
  "latino america",
  "america latina",
  "caribbean",
  "caribe",
  "central america",
  "centroamerica",
];

/**
 * Broader regions that usually include LATAM but are too loose to trust in prose
 * ("customers across the Americas") — they only count in the head.
 */
const WEAK_REGION_TERMS: readonly string[] = ["americas", "western hemisphere", "nearshore"];

/** Non-DR LATAM countries → display name. */
const LATAM_COUNTRIES: ReadonlyMap<string, string> = new Map([
  ["colombia", "Colombia"],
  ["costa rica", "Costa Rica"],
  ["mexico", "Mexico"],
  ["brazil", "Brazil"],
  ["brasil", "Brazil"],
  ["argentina", "Argentina"],
  ["chile", "Chile"],
  ["uruguay", "Uruguay"],
  ["peru", "Peru"],
  ["ecuador", "Ecuador"],
  ["panama", "Panama"],
  ["el salvador", "El Salvador"],
  ["guatemala", "Guatemala"],
  ["honduras", "Honduras"],
  ["nicaragua", "Nicaragua"],
  ["paraguay", "Paraguay"],
  ["bolivia", "Bolivia"],
  ["venezuela", "Venezuela"],
  ["puerto rico", "Puerto Rico"],
  ["cuba", "Cuba"],
  ["jamaica", "Jamaica"],
  ["haiti", "Haiti"],
  ["trinidad and tobago", "Trinidad and Tobago"],
  ["bahamas", "Bahamas"],
  ["barbados", "Barbados"],
  ["belize", "Belize"],
  ["guyana", "Guyana"],
]);

/** Non-DR LATAM cities → display name. */
const LATAM_CITIES: ReadonlyMap<string, string> = new Map([
  ["bogota", "Bogotá"],
  ["medellin", "Medellín"],
  ["cali", "Cali"],
  ["barranquilla", "Barranquilla"],
  ["cartagena", "Cartagena"],
  ["buenos aires", "Buenos Aires"],
  ["cordoba", "Córdoba"],
  ["rosario", "Rosario"],
  ["mendoza", "Mendoza"],
  ["mexico city", "Mexico City"],
  ["ciudad de mexico", "Mexico City"],
  ["cdmx", "Mexico City"],
  ["guadalajara", "Guadalajara"],
  ["monterrey", "Monterrey"],
  ["puebla", "Puebla"],
  ["queretaro", "Querétaro"],
  ["tijuana", "Tijuana"],
  ["merida", "Mérida"],
  ["sao paulo", "São Paulo"],
  ["rio de janeiro", "Rio de Janeiro"],
  ["belo horizonte", "Belo Horizonte"],
  ["curitiba", "Curitiba"],
  ["porto alegre", "Porto Alegre"],
  ["florianopolis", "Florianópolis"],
  ["recife", "Recife"],
  ["campinas", "Campinas"],
  ["santiago", "Santiago"],
  ["lima", "Lima"],
  ["montevideo", "Montevideo"],
  ["quito", "Quito"],
  ["guayaquil", "Guayaquil"],
  ["panama city", "Panama City"],
  ["ciudad de panama", "Panama City"],
  ["asuncion", "Asunción"],
  ["la paz", "La Paz"],
  ["caracas", "Caracas"],
  ["san salvador", "San Salvador"],
  ["guatemala city", "Guatemala City"],
  ["tegucigalpa", "Tegucigalpa"],
  ["san pedro sula", "San Pedro Sula"],
  ["managua", "Managua"],
  ["heredia", "Heredia"],
  ["san juan", "San Juan"],
  ["kingston", "Kingston"],
]);

const NON_LATAM_INDICATORS: readonly string[] = [
  "united states",
  "usa",
  "u.s.a",
  "u.s.",
  "california",
  "new york",
  "texas",
  "florida",
  "washington",
  "illinois",
  "massachusetts",
  "colorado",
  "oregon",
  "georgia",
  "virginia",
  "north carolina",
  "pennsylvania",
  "ohio",
  "michigan",
  "arizona",
  "minnesota",
  "maryland",
  "new jersey",
  "connecticut",
  "utah",
  "tennessee",
  "indiana",
  "missouri",
  "wisconsin",
  "san francisco",
  "new york city",
  "nyc",
  "los angeles",
  "chicago",
  "seattle",
  "austin",
  "denver",
  "boston",
  "atlanta",
  "miami",
  "portland",
  "dallas",
  "houston",
  "phoenix",
  "san diego",
  "san jose",
  "mountain view",
  "palo alto",
  "sunnyvale",
  "cupertino",
  "menlo park",
  "redmond",
  "raleigh",
  "durham",
  "charlotte",
  "nashville",
  "minneapolis",
  "detroit",
  "pittsburgh",
  "philadelphia",
  "salt lake city",
  "kansas city",
  "canada",
  "toronto",
  "vancouver",
  "montreal",
  "ottawa",
  "calgary",
  "united kingdom",
  "uk",
  "england",
  "london",
  "manchester",
  "berlin",
  "germany",
  "france",
  "paris",
  "netherlands",
  "amsterdam",
  "spain",
  "madrid",
  "barcelona",
  "italy",
  "milan",
  "rome",
  "ireland",
  "dublin",
  "portugal",
  "lisbon",
  "sweden",
  "stockholm",
  "norway",
  "oslo",
  "denmark",
  "copenhagen",
  "finland",
  "helsinki",
  "switzerland",
  "zurich",
  "geneva",
  "austria",
  "vienna",
  "belgium",
  "brussels",
  "poland",
  "warsaw",
  "czech republic",
  "prague",
  "romania",
  "bucharest",
  "ukraine",
  "kyiv",
  "hungary",
  "budapest",
  "europe",
  "european union",
  "eu",
  "emea",
  "india",
  "bangalore",
  "mumbai",
  "hyderabad",
  "pune",
  "delhi",
  "chennai",
  "china",
  "beijing",
  "shanghai",
  "shenzhen",
  "japan",
  "tokyo",
  "south korea",
  "seoul",
  "singapore",
  "australia",
  "sydney",
  "melbourne",
  "new zealand",
  "auckland",
  "philippines",
  "manila",
  "vietnam",
  "ho chi minh",
  "hanoi",
  "thailand",
  "bangkok",
  "indonesia",
  "jakarta",
  "malaysia",
  "kuala lumpur",
  "taiwan",
  "taipei",
  "asia",
  "apac",
  "asia pacific",
  "africa",
  "nigeria",
  "lagos",
  "kenya",
  "nairobi",
  "south africa",
  "cape town",
  "johannesburg",
  "egypt",
  "cairo",
  "israel",
  "tel aviv",
  "dubai",
  "uae",
  "united arab emirates",
  "saudi arabia",
  "middle east",
];

/**
 * The rest of the world, so an unlisted place ("remote role based in Greece") can't
 * slip through as a bare "remote". Combined with {@link NON_LATAM_INDICATORS}.
 */
const WORLD_COUNTRIES: readonly string[] = [
  "afghanistan", "albania", "algeria", "andorra", "angola", "armenia", "azerbaijan",
  "bahrain", "bangladesh", "belarus", "benin", "bhutan", "bosnia", "botswana", "brunei",
  "bulgaria", "burkina faso", "burundi", "cambodia", "cameroon", "cape verde",
  "central african republic", "comoros", "congo", "croatia", "cyprus", "czechia",
  "djibouti", "eritrea", "estonia", "eswatini", "ethiopia", "fiji", "gabon", "gambia",
  "ghana", "greece", "iceland", "iran", "iraq", "ivory coast", "cote d'ivoire",
  "kazakhstan", "kosovo", "kuwait", "kyrgyzstan", "laos", "latvia", "lebanon", "lesotho",
  "liberia", "libya", "liechtenstein", "lithuania", "luxembourg", "madagascar", "malawi",
  "maldives", "malta", "mauritania", "mauritius", "moldova", "monaco", "mongolia",
  "montenegro", "morocco", "mozambique", "myanmar", "namibia", "nepal", "north macedonia",
  "macedonia", "pakistan", "palestine", "papua new guinea", "qatar", "russia", "rwanda",
  "san marino", "senegal", "serbia", "seychelles", "sierra leone", "slovakia", "slovenia",
  "somalia", "south sudan", "sudan", "sri lanka", "syria", "tajikistan", "tanzania",
  "tunisia", "turkiye", "turkmenistan", "uganda", "uzbekistan", "yemen", "zambia",
  "zimbabwe", "korea", "hong kong", "macau", "scotland", "wales", "northern ireland",
  "great britain", "britain",
];

/** Major non-LATAM tech cities not already in {@link NON_LATAM_INDICATORS}. */
const WORLD_CITIES: readonly string[] = [
  "athens", "thessaloniki", "chania", "crete", "istanbul", "ankara", "krakow", "wroclaw",
  "gdansk", "riga", "tallinn", "vilnius", "belgrade", "zagreb", "ljubljana", "bratislava",
  "munich", "hamburg", "frankfurt", "cologne", "stuttgart", "rotterdam", "the hague",
  "utrecht", "eindhoven", "edinburgh", "glasgow", "cardiff", "belfast", "bristol", "leeds",
  "oxford", "lyon", "marseille", "toulouse", "seville", "malaga", "porto", "turin",
  "bologna", "florence", "naples", "gothenburg", "malmo", "aarhus", "tampere", "accra",
  "casablanca", "tunis", "karachi", "lahore", "islamabad", "dhaka", "colombo", "kathmandu",
  "noida", "gurgaon", "gurugram", "kolkata", "ahmedabad", "kochi", "chandigarh", "jaipur",
  "cebu", "davao", "osaka", "kyoto", "busan", "perth", "brisbane", "adelaide", "canberra",
  "wellington", "doha", "riyadh", "jeddah", "abu dhabi", "muscat", "amman", "beirut",
  "haifa", "jerusalem", "tbilisi", "yerevan", "baku", "almaty", "tashkent",
];

/**
 * Country names that double as ordinary words or first names ("Jordan", "Chad",
 * "turkey") — only trusted in the head or right after an eligibility trigger.
 */
const SCOPED_ONLY_PLACES: readonly string[] = [
  "jordan", "chad", "turkey", "guinea", "niger", "mali", "togo", "oman",
];

/** Case-sensitive country codes trusted in the location field only ("Remote, US"). */
const NON_LATAM_LOCATION_CODES: readonly string[] = ["US", "USA", "UK", "GB", "EU"];

const NON_LATAM_PLACES: readonly string[] = [...NON_LATAM_INDICATORS, ...WORLD_COUNTRIES, ...WORLD_CITIES];

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

interface PlaceHits {
  countries: string[];
  cities: string[];
  /** Non-LATAM places (display names). */
  outside: string[];
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Non-excluded LATAM countries/cities named in `span` (display names, deduped). */
function findPlaces(span: string): PlaceHits {
  const text = stripExamples(span);
  const countries = new Set<string>();
  const cities = new Set<string>();
  for (const [term, display] of LATAM_COUNTRIES) {
    if (termIndices(text, term).some((i) => !isExcludedAt(text, i))) countries.add(display);
  }
  for (const [term, display] of LATAM_CITIES) {
    if (termIndices(text, term).some((i) => !isExcludedAt(text, i))) cities.add(display);
  }
  // A span that also names the LATAM region lists alternatives ("LATAM or Spain"),
  // so non-LATAM places in it don't narrow anything.
  const outside = new Set<string>();
  if (!containsAny(text, LATAM_REGION_TERMS)) {
    for (const term of [...NON_LATAM_PLACES, ...SCOPED_ONLY_PLACES]) {
      if (termIndices(text, term).some((i) => !isExcludedAt(text, i))) outside.add(titleCase(term));
    }
  }
  return { countries: [...countries], cities: [...cities], outside: [...outside] };
}

/**
 * LATAM places the description explicitly scopes eligibility to: the clause after
 * an eligibility trigger ("must be based in Colombia"), plus "<country> only".
 */
function findScopedBodyPlaces(body: string): PlaceHits {
  const countries = new Set<string>();
  const cities = new Set<string>();
  const outside = new Set<string>();
  const add = (hits: PlaceHits) => {
    hits.countries.forEach((c) => countries.add(c));
    hits.cities.forEach((c) => cities.add(c));
    hits.outside.forEach((c) => outside.add(c));
  };

  for (const trigger of ELIGIBILITY_TRIGGERS) {
    trigger.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = trigger.exec(body)) !== null) {
      const before = body.slice(Math.max(0, m.index - 40), m.index);
      if (/^(?:based|located)/.test(m[0]) && COMPANY_SUBJECT_RE.test(before)) continue;
      const rest = body.slice(m.index + m[0].length);
      const end = rest.search(/[.;!?\n]| but | while | and we /);
      const segment = rest.slice(0, Math.min(end === -1 ? rest.length : end, 100));
      add(findPlaces(segment));
    }
  }

  // "Colombia only" / "Brazil-based only" / "Greece residents only"
  const onlyAfter = (term: string) =>
    termIndices(body, term).some((idx) =>
      /^\s*[-–]?\s*(?:based\s+|residents?\s+|citizens?\s+)?only\b/.test(
        body.slice(idx + term.length, idx + term.length + 25),
      ),
    );
  for (const [term, display] of LATAM_COUNTRIES) {
    if (onlyAfter(term)) countries.add(display);
  }
  for (const term of [...NON_LATAM_PLACES, ...SCOPED_ONLY_PLACES]) {
    if (onlyAfter(term)) outside.add(titleCase(term));
  }

  return { countries: [...countries], cities: [...cities], outside: [...outside] };
}

function findDrCodeInLocation(rawLocation: string): { included: boolean; excluded: boolean } {
  const loc = stripDiacritics(rawLocation);
  const locLower = loc.toLowerCase();
  let included = false;
  let excluded = false;
  for (const code of DR_CODES) {
    for (const idx of termIndices(loc, code)) {
      if (isExcludedAt(locLower, idx)) excluded = true;
      else included = true;
    }
  }
  return { included, excluded };
}

function hasNonLatamCodeInLocation(rawLocation: string): boolean {
  const loc = stripDiacritics(rawLocation);
  return NON_LATAM_LOCATION_CODES.some((code) => containsTerm(loc, code));
}


function formatList(items: string[]): string {
  return items.slice(0, 4).join(", ") + (items.length > 4 ? ", …" : "");
}

function result(friendly: boolean, reason: string, eligibility: DrEligibility): DrFilterResult {
  return { friendly, reason, eligibility };
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

export function isDrFriendly(location: string, description: string, title = ""): DrFilterResult {
  const loc = normalize(location ?? "");
  const body = normalize(description ?? "");
  const titleN = normalize(title ?? "");
  // Title is a strong signal ("… (Remote, LATAM)", "Web Developer - LATAM") and is
  // frequently the ONLY place the region appears when location is a generic "Anywhere".
  const head = `${titleN} | ${loc}`;
  const combined = `${head} | ${body}`;

  // --- 1/2. DR named (or explicitly excluded) ---
  const drText = scanMentions(combined, DR_ALIASES);
  const drCode = findDrCodeInLocation(location ?? "");
  if (drText.included || drCode.included) {
    return result(true, "Explicitly mentions DR", "explicit_latam");
  }
  if (drText.excluded || drCode.excluded) {
    return result(false, "Excludes Dominican Republic", "restricted");
  }
  const caribbean = scanMentions(combined, ["caribbean", "caribe"]);
  if (caribbean.excluded && !caribbean.included) {
    return result(false, "Excludes the Caribbean", "restricted");
  }

  // --- 3. Explicit US/region work-eligibility restriction (not a timezone) ---
  if (US_RESTRICTION_PHRASES.some((p) => combined.includes(p))) {
    return result(false, "US/region work restriction", "restricted");
  }

  // --- 4. On-site / hybrid outside the DR ---
  const headRemote = containsAny(head, HEAD_REMOTE_TERMS);
  const headOnsite = hasOnsiteInHead(loc, titleN);
  const bodyOnsite = hasOnsiteInBody(body);
  if ((headOnsite || bodyOnsite) && !headRemote) {
    return result(false, "On-site/hybrid outside DR", "restricted");
  }
  // Head says remote but something says on-site/hybrid — never auto-approve.
  const onsiteConflict = headOnsite || bodyOnsite;

  // --- 5. Limited to named LATAM countries/cities that don't include the DR ---
  const headPlaces = findPlaces(head);
  const bodyPlaces = findScopedBodyPlaces(body);
  const countries = [...new Set([...headPlaces.countries, ...bodyPlaces.countries])];
  const cities = [...new Set([...headPlaces.cities, ...bodyPlaces.cities])];
  if (countries.length > 0) {
    return result(false, `Limited to: ${formatList(countries)}`, "restricted");
  }
  if (cities.length > 0) {
    return result(false, `City-specific: ${formatList(cities)}`, "restricted");
  }

  // --- 6. Non-LATAM location in the head (unless the head also names LATAM) ---
  const headRegion = containsAny(head, LATAM_REGION_TERMS) || containsAny(head, WEAK_REGION_TERMS);
  if (
    !headRegion &&
    (containsAny(head, NON_LATAM_PLACES) ||
      containsAny(head, SCOPED_ONLY_PLACES) ||
      hasNonLatamCodeInLocation(location ?? ""))
  ) {
    return result(false, "Outside LATAM", "restricted");
  }

  // --- 6b. Description scopes the role to a non-LATAM place ("remote role based in Greece") ---
  if (!headRegion && bodyPlaces.outside.length > 0) {
    return result(false, `Based outside LATAM: ${formatList(bodyPlaces.outside)}`, "restricted");
  }

  const downgrade = (r: DrFilterResult): DrFilterResult =>
    onsiteConflict ? result(false, "Remote listing mentions on-site/hybrid — needs review", "ambiguous") : r;

  // --- 7. Generic LATAM / Caribbean — the DR is part of it ---
  if (headRegion || containsAny(body, LATAM_REGION_TERMS)) {
    return downgrade(result(true, "LATAM/Caribbean region", "explicit_latam"));
  }

  // --- 8/9. Remote, and no place the role is scoped to ---
  if (containsAny(combined, REMOTE_KEYWORDS)) {
    // Scoped places already returned above, so any remaining description mention
    // is incidental ("our HQ is in Berlin") next to an explicit worldwide statement.
    if (STRONG_GLOBAL_SIGNALS.some((s) => combined.includes(s))) {
      return downgrade(result(true, "Global remote (no location restriction)", "global_remote"));
    }
    if (!containsAny(body, NON_LATAM_PLACES)) {
      // Bare "remote"/"anywhere" with nothing else to go on — often really US-only.
      // Keep it (never dropped) but leave it for the LLM adjudicator to resolve.
      return result(false, "Ambiguous remote — needs review", "ambiguous");
    }
  }

  // --- 10. Non-LATAM location mentioned only in the description ---
  if (containsAny(body, NON_LATAM_PLACES)) {
    return result(false, "Outside LATAM", "restricted");
  }

  // No remote signal and no location signal at all — genuinely unknown. Kept for review.
  return result(false, "Unable to determine location eligibility", "ambiguous");
}
