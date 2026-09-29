/**
 * Country registry for multi-market job hunting.
 *
 * Every country is keyed by its ISO 3166-1 alpha-2 code (uppercase, `GB` not `UK`).
 * Display names are never hand-maintained: they come from `Intl.DisplayNames` in the
 * UI locale. The alias vocabulary used to *detect* countries in job text is built
 * from `Intl.DisplayNames` in several languages plus the hand-curated extras below
 * (abbreviations, demonyms, cities).
 *
 * "Launch" markets carry full metadata (currency, locale, paper size, 13th salary,
 * cities). Every other ISO country is still recognised in job text so a posting
 * "remote, Greece only" is understood, but has only a minimal profile.
 */

/** All ISO 3166-1 alpha-2 codes currently assigned. */
export const ISO_COUNTRY_CODES: readonly string[] = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS " +
  "BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE " +
  "EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM " +
  "HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC " +
  "LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA " +
  "NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO " +
  "TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

export type PaperSize = "A4" | "LETTER";

export interface CountryProfile {
  code: string;
  /** ISO 4217 currency. */
  currency: string;
  /** Local currency symbol as written in postings, when it differs from Intl's default. */
  currencySymbols?: string[];
  /** BCP 47 locale used to format money/dates for this market. */
  locale: string;
  /** Main IANA timezone (first = default). */
  timezones: string[];
  paper: PaperSize;
  /** A statutory 13th-month salary exists (annual = monthly × 13). */
  thirteenthSalary: boolean;
  /**
   * Countries whose work authorization also covers this one (Puerto Rico → US).
   * Used to treat "authorized to work in the US" as satisfied by a PR market.
   */
  workAuthCoveredBy?: string[];
  /**
   * Extra aliases (normalized: lowercase, no diacritics) on top of the generated
   * multilingual country names. Ambiguous short codes don't belong here — see
   * {@link locationCodes}.
   */
  aliases: string[];
  /**
   * Case-sensitive codes trusted only in a *location* field ("Remote, US"): in prose
   * they collide with ordinary words ("DO", "IN", "US").
   */
  locationCodes: string[];
  /** Unambiguous city/area names (normalized). */
  cities: string[];
}

function profile(p: Partial<CountryProfile> & Pick<CountryProfile, "code" | "currency" | "locale">): CountryProfile {
  return {
    timezones: [],
    paper: "A4",
    thirteenthSalary: false,
    aliases: [],
    locationCodes: [p.code],
    cities: [],
    ...p,
  };
}

/**
 * Markets with full metadata. The DR entry mirrors the vocabulary of
 * src/lib/dr-filter.ts (which remains the authoritative classifier for DR residents).
 */
export const LAUNCH_COUNTRIES: Readonly<Record<string, CountryProfile>> = {
  DO: profile({
    code: "DO",
    currency: "DOP",
    currencySymbols: ["RD$"],
    locale: "es-DO",
    timezones: ["America/Santo_Domingo"],
    paper: "LETTER",
    thirteenthSalary: true,
    aliases: [
      "dominican republic", "republica dominicana", "rep. dominicana", "rep dominicana",
      "rep. dom.", "rep. dom", "rep dom", "r.d.", "d.r.", "dominicana", "dominican", "quisqueya",
    ],
    locationCodes: ["DR", "RD", "DO", "DOM", "SDQ"],
    cities: [
      "santo domingo", "distrito nacional", "santiago de los caballeros", "puerto plata",
      "san francisco de macoris", "punta cana", "bavaro", "higuey", "la romana", "san pedro de macoris",
    ],
  }),
  US: profile({
    code: "US",
    currency: "USD",
    currencySymbols: ["US$"],
    locale: "en-US",
    timezones: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"],
    paper: "LETTER",
    aliases: ["united states", "united states of america", "usa", "u.s.a", "u.s.", "ee.uu.", "eeuu", "estados unidos"],
    locationCodes: ["US", "USA"],
    cities: [
      "california", "new york", "texas", "georgia", "washington", "washington dc", "new mexico", "florida", "illinois", "massachusetts", "colorado", "oregon",
      "virginia", "north carolina", "pennsylvania", "ohio", "michigan", "arizona", "minnesota",
      "maryland", "new jersey", "connecticut", "utah", "tennessee", "indiana", "missouri", "wisconsin",
      "san francisco", "new york city", "nyc", "los angeles", "chicago", "seattle", "austin", "denver",
      "boston", "atlanta", "miami", "dallas", "houston", "phoenix", "san diego", "mountain view",
      "palo alto", "sunnyvale", "cupertino", "menlo park", "redmond", "raleigh", "charlotte",
      "nashville", "minneapolis", "detroit", "pittsburgh", "philadelphia", "salt lake city",
    ],
  }),
  PR: profile({
    code: "PR",
    currency: "USD",
    locale: "es-PR",
    timezones: ["America/Puerto_Rico"],
    paper: "LETTER",
    workAuthCoveredBy: ["US"],
    aliases: ["puerto rico", "borinquen", "boricua"],
    locationCodes: ["PR"],
    cities: ["san juan", "bayamon", "carolina", "ponce", "caguas", "mayaguez", "guaynabo"],
  }),
  CA: profile({
    code: "CA",
    currency: "CAD",
    currencySymbols: ["CA$", "C$"],
    locale: "en-CA",
    timezones: ["America/Toronto", "America/Vancouver"],
    paper: "LETTER",
    aliases: ["canada"],
    locationCodes: ["CAN"],
    cities: ["toronto", "vancouver", "montreal", "ottawa", "calgary", "edmonton", "waterloo", "ontario", "quebec", "british columbia", "alberta"],
  }),
  MX: profile({
    code: "MX",
    currency: "MXN",
    currencySymbols: ["MX$"],
    locale: "es-MX",
    timezones: ["America/Mexico_City"],
    paper: "LETTER",
    aliases: ["mexico", "mejico"],
    locationCodes: ["MX", "MEX"],
    cities: ["mexico city", "ciudad de mexico", "cdmx", "guadalajara", "monterrey", "puebla", "queretaro", "tijuana", "merida"],
  }),
  CO: profile({
    code: "CO",
    currency: "COP",
    locale: "es-CO",
    timezones: ["America/Bogota"],
    paper: "LETTER",
    aliases: ["colombia"],
    locationCodes: ["COL"],
    cities: ["bogota", "medellin", "cali", "barranquilla", "cartagena"],
  }),
  CL: profile({
    code: "CL",
    currency: "CLP",
    locale: "es-CL",
    timezones: ["America/Santiago"],
    paper: "LETTER",
    aliases: ["chile"],
    locationCodes: ["CL", "CHL"],
    // Bare "santiago" is ambiguous with Santiago de los Caballeros (DR); dr-filter
    // treats it as Chile, and so do we — "santiago de los caballeros" wins by length.
    cities: ["santiago", "santiago de chile", "valparaiso", "concepcion"],
  }),
  AR: profile({
    code: "AR",
    currency: "ARS",
    locale: "es-AR",
    timezones: ["America/Argentina/Buenos_Aires"],
    aliases: ["argentina"],
    locationCodes: ["ARG"],
    cities: ["buenos aires", "cordoba", "rosario", "mendoza"],
  }),
  BR: profile({
    code: "BR",
    currency: "BRL",
    currencySymbols: ["R$"],
    locale: "pt-BR",
    timezones: ["America/Sao_Paulo"],
    thirteenthSalary: true,
    aliases: ["brazil", "brasil"],
    locationCodes: ["BR", "BRA"],
    cities: ["sao paulo", "rio de janeiro", "belo horizonte", "curitiba", "porto alegre", "florianopolis", "recife", "campinas"],
  }),
  ES: profile({
    code: "ES",
    currency: "EUR",
    locale: "es-ES",
    timezones: ["Europe/Madrid"],
    aliases: ["spain", "espana"],
    locationCodes: ["ES", "ESP"],
    cities: ["madrid", "barcelona", "valencia", "seville", "sevilla", "malaga", "bilbao"],
  }),
  DE: profile({
    code: "DE",
    currency: "EUR",
    locale: "de-DE",
    timezones: ["Europe/Berlin"],
    aliases: ["germany", "deutschland", "alemania"],
    locationCodes: ["DEU"],
    cities: ["berlin", "munich", "munchen", "hamburg", "frankfurt", "cologne", "koln", "stuttgart", "dusseldorf"],
  }),
  GB: profile({
    code: "GB",
    currency: "GBP",
    locale: "en-GB",
    timezones: ["Europe/London"],
    aliases: ["united kingdom", "uk", "u.k.", "great britain", "britain", "england", "scotland", "wales", "northern ireland", "reino unido"],
    locationCodes: ["UK", "GB", "GBR"],
    cities: ["london", "manchester", "edinburgh", "glasgow", "cardiff", "belfast", "bristol", "leeds", "cambridge", "oxford"],
  }),
};

/** Extra detection vocabulary for non-launch countries (normalized). */
const EXTRA_ALIASES: Readonly<Record<string, string[]>> = {
  CR: ["costa rica"],
  PA: ["panama"],
  UY: ["uruguay"],
  PE: ["peru"],
  EC: ["ecuador"],
  NL: ["netherlands", "holland"],
  IE: ["ireland"],
  PT: ["portugal"],
  FR: ["france"],
  IT: ["italy"],
  PL: ["poland"],
  IN: ["india"],
  PH: ["philippines"],
  CZ: ["czech republic", "czechia"],
  TR: ["turkiye", "turkey"],
  AE: ["uae", "united arab emirates"],
  KR: ["south korea"],
  CI: ["ivory coast", "cote d'ivoire"],
  MK: ["north macedonia", "macedonia"],
};

/** Cities for non-launch countries that postings commonly name (normalized). */
const EXTRA_CITIES: Readonly<Record<string, string[]>> = {
  CR: ["san jose costa rica", "heredia"],
  PE: ["lima"],
  UY: ["montevideo"],
  EC: ["quito", "guayaquil"],
  PA: ["panama city", "ciudad de panama"],
  PY: ["asuncion"],
  BO: ["la paz"],
  VE: ["caracas"],
  SV: ["san salvador"],
  GT: ["guatemala city"],
  HN: ["tegucigalpa", "san pedro sula"],
  NI: ["managua"],
  JM: ["kingston"],
  NL: ["amsterdam", "rotterdam", "the hague", "utrecht", "eindhoven"],
  FR: ["paris", "lyon", "marseille", "toulouse"],
  IT: ["milan", "rome", "turin", "bologna", "florence", "naples"],
  IE: ["dublin"],
  PT: ["lisbon", "porto"],
  SE: ["stockholm", "gothenburg", "malmo"],
  NO: ["oslo"],
  DK: ["copenhagen", "aarhus"],
  FI: ["helsinki", "tampere"],
  CH: ["zurich", "geneva"],
  AT: ["vienna"],
  BE: ["brussels"],
  PL: ["warsaw", "krakow", "wroclaw", "gdansk"],
  CZ: ["prague"],
  RO: ["bucharest"],
  UA: ["kyiv"],
  HU: ["budapest"],
  GR: ["athens", "thessaloniki"],
  TR: ["istanbul", "ankara"],
  IN: ["bangalore", "bengaluru", "mumbai", "hyderabad", "pune", "delhi", "chennai", "noida", "gurgaon", "gurugram", "kolkata"],
  CN: ["beijing", "shanghai", "shenzhen"],
  JP: ["tokyo", "osaka"],
  KR: ["seoul", "busan"],
  SG: ["singapore"],
  AU: ["sydney", "melbourne", "brisbane", "perth"],
  NZ: ["auckland", "wellington"],
  PH: ["manila", "cebu"],
  VN: ["ho chi minh", "hanoi"],
  TH: ["bangkok"],
  ID: ["jakarta"],
  MY: ["kuala lumpur"],
  TW: ["taipei"],
  NG: ["lagos"],
  KE: ["nairobi"],
  ZA: ["cape town", "johannesburg"],
  EG: ["cairo"],
  IL: ["tel aviv", "haifa", "jerusalem"],
  AE: ["dubai", "abu dhabi"],
  SA: ["riyadh", "jeddah"],
  PK: ["karachi", "lahore", "islamabad"],
  BD: ["dhaka"],
  LK: ["colombo"],
};

/**
 * Country names that are also common words or first names. They are only trusted
 * in a location/head field, never in prose.
 */
export const SCOPED_ONLY_TERMS: ReadonlySet<string> = new Set([
  "jordan", "chad", "turkey", "guinea", "niger", "mali", "togo", "oman", "georgia", "dominica", "jersey",
]);

export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function isKnownCountry(code: string): boolean {
  return ISO_COUNTRY_CODES.includes(code);
}

/** Full profile for launch markets, a minimal one (USD/en/A4) for the rest. */
export function getCountryProfile(code: string): CountryProfile {
  return LAUNCH_COUNTRIES[code] ?? profile({ code, currency: "USD", locale: "en", locationCodes: [] });
}

const displayNameCache = new Map<string, Intl.DisplayNames | null>();

function displayNames(locale: string): Intl.DisplayNames | null {
  if (!displayNameCache.has(locale)) {
    try {
      displayNameCache.set(locale, new Intl.DisplayNames([locale], { type: "region" }));
    } catch {
      displayNameCache.set(locale, null);
    }
  }
  return displayNameCache.get(locale) ?? null;
}

/** Localized country name ("República Dominicana" for DO in `es`). Falls back to the code. */
export function countryName(code: string, uiLocale: string): string {
  try {
    return displayNames(uiLocale)?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Languages whose country names we recognise in postings. */
const DETECTION_LOCALES = ["en", "es", "pt", "de", "fr"];

export interface PlaceTerm {
  /** Normalized term. */
  term: string;
  country: string;
  kind: "name" | "city";
  /** Only trusted in the head/location, not prose. */
  scopedOnly: boolean;
}

let placeTermsCache: PlaceTerm[] | null = null;

/**
 * Every normalized term that names a country or one of its cities, longest first
 * so "santiago de los caballeros" is matched before "santiago".
 */
export function placeTerms(): PlaceTerm[] {
  if (placeTermsCache) return placeTermsCache;
  const seen = new Map<string, PlaceTerm>();
  const add = (term: string, country: string, kind: PlaceTerm["kind"]) => {
    const t = normalizeText(term).trim();
    if (t.length < 2 || seen.has(t)) return;
    seen.set(t, { term: t, country, kind, scopedOnly: SCOPED_ONLY_TERMS.has(t) });
  };

  for (const code of Object.keys(LAUNCH_COUNTRIES)) {
    const p = LAUNCH_COUNTRIES[code];
    p.aliases.forEach((a) => add(a, code, "name"));
    p.cities.forEach((c) => add(c, code, "city"));
  }
  for (const [code, list] of Object.entries(EXTRA_ALIASES)) list.forEach((a) => add(a, code, "name"));
  for (const [code, list] of Object.entries(EXTRA_CITIES)) list.forEach((c) => add(c, code, "city"));
  for (const locale of DETECTION_LOCALES) {
    const dn = displayNames(locale);
    if (!dn) continue;
    for (const code of ISO_COUNTRY_CODES) {
      let name: string | undefined;
      try {
        name = dn.of(code);
      } catch {
        name = undefined;
      }
      if (name && name !== code) add(name, code, "name");
    }
  }

  placeTermsCache = [...seen.values()].sort((a, b) => b.term.length - a.term.length);
  return placeTermsCache;
}

/** Case-sensitive location codes → country (e.g. "US" → US, "RD" → DO). */
export function locationCodeMap(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const p of Object.values(LAUNCH_COUNTRIES)) {
    for (const c of p.locationCodes) map.set(c, p.code);
  }
  return map;
}

/**
 * Resolve free text a user typed ("RD", "dominicana", "USA", "Brasil") to an ISO
 * code, for the country picker. Exact code match first, then aliases.
 */
export function resolveCountry(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (ISO_COUNTRY_CODES.includes(upper)) return upper;
  const code = locationCodeMap().get(upper);
  if (code) return code;
  const n = normalizeText(raw);
  const hit = placeTerms().find((p) => p.term === n && p.kind === "name");
  return hit?.country ?? null;
}

/**
 * Privacy-light guess of where the user lives, for pre-filling onboarding: the
 * OS timezone first, then the region subtag of the UI locales. No network, no IP.
 */
export function suggestResidence(timeZone?: string, locales: readonly string[] = []): string | null {
  if (timeZone) {
    for (const p of Object.values(LAUNCH_COUNTRIES)) {
      if (p.timezones.includes(timeZone)) return p.code;
    }
  }
  for (const locale of locales) {
    const region = /[-_]([A-Z]{2})\b/.exec(locale)?.[1];
    if (region && ISO_COUNTRY_CODES.includes(region)) return region;
  }
  return null;
}
