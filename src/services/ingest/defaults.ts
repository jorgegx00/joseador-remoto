/**
 * Built-in search breadth: the whole remote tech spectrum, English + Spanish.
 *
 * No "remote"/"latam" inside the query text — remoteness is enforced by API
 * filters (SerpApi ltype=1, Apify aiWorkArrangementFilter), and those words
 * rarely appear in titles, so including them only narrows results. DR
 * eligibility is a stored flag (is_dr_friendly), never an ingestion gate.
 */

export const DEFAULT_INGEST_QUERIES: readonly string[] = [
  // core software
  "software engineer",
  "frontend developer",
  "backend developer",
  "full stack developer",
  "web developer",
  // mobile
  "mobile developer",
  "ios developer",
  "android developer",
  "react native developer",
  "flutter developer",
  // data / ML / AI
  "data engineer",
  "data scientist",
  "data analyst",
  "machine learning engineer",
  "ai engineer",
  // devops / platform / cloud
  "devops engineer",
  "site reliability engineer",
  "platform engineer",
  "cloud engineer",
  // qa
  "qa engineer",
  "test automation engineer",
  // security
  "security engineer",
  "cybersecurity analyst",
  // embedded / games / blockchain
  "embedded software engineer",
  "game developer",
  "blockchain developer",
  // product & design
  "product designer",
  "ux designer",
  "software product manager",
  // data stores / architecture
  "database administrator",
  "solutions architect",
  // Spanish — Google matches query text against the posting's language, so
  // Spanish-language postings need Spanish queries. Broad role nouns cover
  // the specializations on Google's side.
  "desarrollador",
  "programador",
  "ingeniero de software",
  "desarrollador web",
  "desarrollador frontend",
  "desarrollador backend",
  "desarrollador full stack",
  "desarrollador móvil",
  "desarrollador ios",
  "desarrollador android",
  "ingeniero de datos",
  "científico de datos",
  "ingeniero devops",
  "analista qa",
  "ingeniero de seguridad",
  "diseñador ux",
];

/**
 * LinkedIn titleSearch terms (`:*` suffix = prefix match upstream). One actor
 * run covers ALL titles and cost is per result, so a long list is free.
 */
export const DEFAULT_APIFY_LINKEDIN_TITLES: readonly string[] = [
  "Software Engineer:*",
  "Software Developer:*",
  "Web Developer:*",
  "Frontend:*",
  "Front End:*",
  "Backend:*",
  "Back End:*",
  "Full Stack:*",
  "Mobile Developer:*",
  "iOS:*",
  "Android:*",
  "React Native:*",
  "Flutter:*",
  "Data Engineer:*",
  "Data Scientist:*",
  "Data Analyst:*",
  "Machine Learning:*",
  "ML Engineer:*",
  "AI Engineer:*",
  "DevOps:*",
  "Site Reliability:*",
  "SRE",
  "Platform Engineer:*",
  "Cloud Engineer:*",
  "QA:*",
  "Quality Assurance:*",
  "Test Engineer:*",
  "Automation Engineer:*",
  "Security Engineer:*",
  "Cybersecurity:*",
  "Security Analyst:*",
  "Embedded:*",
  "Firmware:*",
  "Game Developer:*",
  "Game Programmer:*",
  "Unity Developer:*",
  "Blockchain:*",
  "Smart Contract:*",
  "Solidity:*",
  "Product Designer:*",
  "UX Designer:*",
  "UI Designer:*",
  "Product Manager:*",
  "Database Administrator:*",
  "Solutions Architect:*",
  "Software Architect:*",
  // Spanish — broad prefixes catch the variants ("Desarrollador Frontend",
  // "Desarrollador Móvil", ...).
  "Desarrollador:*",
  "Desarrolladora:*",
  "Programador:*",
  "Programadora:*",
  "Ingeniero de Software:*",
  "Ingeniera de Software:*",
  "Ingeniero de Datos:*",
  "Científico de Datos:*",
  "Analista de Datos:*",
  "Diseñador UX:*",
  "Ciberseguridad:*",
];

/**
 * Defaults sized to the providers' free tiers (verified on the official
 * pricing pages 2026-06-12): SerpApi free = 250 searches/month (50/hour),
 * Apify free = $5/month credit (~$1.50 per 1k actor results).
 */
export const DEFAULT_CAPS = {
  serpapiDaily: 30,
  serpapiMonthly: 250,
  apifyDaily: 4,
  apifyMonthly: 30,
  apifyLinkedinLimit: 100,
  maxPagesPerQuery: 3,
} as const;
