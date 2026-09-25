/**
 * Deterministic tech taxonomy for jobs — derives programming language, framework,
 * and role/position tags from a job's free-text title + description so the report
 * can filter and group by them. No LLM, no schema change; computed on demand and
 * memoized by job id.
 *
 * The vocabulary below is a curated, canonical subset (seeded from
 * src/lib/ats/tech-dictionary.ts). It is intentionally smaller than the full ATS
 * term list: facets are only useful when they are few and meaningful.
 *
 * Roles are inferred from the TITLE only (high precision — a backend job's body
 * often mentions "collaborate with the frontend team"), with a framework-based
 * fallback. Languages/frameworks are matched across title + description.
 */

import type { Job } from "@/types";

export interface JobTags {
  languages: string[];
  frameworks: string[];
  roles: string[];
}

export type TaxonomyDimension = keyof JobTags;

export const ROLE_KEYS = [
  "backend",
  "frontend",
  "fullstack",
  "mobile",
  "qa",
  "devops",
  "data",
  "ml_ai",
  "security",
  "design",
  "pm",
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

// ---------------------------------------------------------------------------
// Canonical term → aliases. Displayed values are the canonical keys (proper
// nouns, shown verbatim — not translated).
// ---------------------------------------------------------------------------
const LANGUAGES: Record<string, string[]> = {
  JavaScript: ["javascript", "js"],
  TypeScript: ["typescript", "ts"],
  Python: ["python"],
  Java: ["java"],
  "C#": ["c#", "csharp", "c-sharp"],
  Go: ["golang", "go"],
  Ruby: ["ruby"],
  PHP: ["php"],
  Rust: ["rust"],
  Kotlin: ["kotlin"],
  Swift: ["swift"],
  Scala: ["scala"],
  "C++": ["c++", "cpp"],
  "Objective-C": ["objective-c", "objectivec"],
  Elixir: ["elixir"],
  Dart: ["dart"],
  Perl: ["perl"],
  Clojure: ["clojure"],
  Haskell: ["haskell"],
  SQL: ["sql"],
};

const FRAMEWORKS: Record<string, string[]> = {
  React: ["react", "reactjs", "react.js"],
  "React Native": ["react native", "react-native", "reactnative"],
  Angular: ["angular", "angularjs"],
  Vue: ["vue", "vue.js", "vuejs"],
  Svelte: ["svelte", "sveltekit"],
  "Next.js": ["next.js", "nextjs"],
  "Node.js": ["node.js", "nodejs", "node"],
  Express: ["express", "express.js", "expressjs"],
  NestJS: ["nestjs", "nest.js"],
  Django: ["django"],
  Flask: ["flask"],
  FastAPI: ["fastapi"],
  Spring: ["spring", "spring boot", "springboot"],
  ".NET": [".net", "dotnet", "asp.net", "aspnet", "blazor"],
  Rails: ["rails", "ruby on rails"],
  Laravel: ["laravel"],
  Symfony: ["symfony"],
  Flutter: ["flutter"],
  GraphQL: ["graphql"],
};

// Role keyword → aliases matched in the TITLE.
const ROLE_TITLE_KEYWORDS: Record<RoleKey, string[]> = {
  backend: ["backend", "back-end", "back end", "server-side", "server side"],
  frontend: ["frontend", "front-end", "front end", "ui engineer"],
  fullstack: ["fullstack", "full-stack", "full stack"],
  mobile: ["mobile", "ios", "android", "react native", "flutter"],
  qa: ["qa", "quality assurance", "sdet", "test engineer", "automation engineer", "tester", "test automation"],
  devops: ["devops", "sre", "site reliability", "platform engineer", "infrastructure", "cloud engineer"],
  data: ["data engineer", "data analyst", "analytics engineer", "etl", "data platform"],
  ml_ai: ["machine learning", "ml engineer", "ai engineer", "deep learning", "nlp", "computer vision", "data scientist", "mlops"],
  security: ["security", "appsec", "infosec", "penetration", "cybersecurity"],
  design: ["designer", "ux", "ui/ux", "product design"],
  pm: ["product manager", "product owner", "program manager"],
};

// Which frameworks imply which role, used only when the title states no role.
const FRAMEWORK_ROLE: Record<string, RoleKey> = {
  React: "frontend",
  Angular: "frontend",
  Vue: "frontend",
  Svelte: "frontend",
  "Next.js": "frontend",
  "Node.js": "backend",
  Express: "backend",
  NestJS: "backend",
  Django: "backend",
  Flask: "backend",
  FastAPI: "backend",
  Spring: "backend",
  ".NET": "backend",
  Rails: "backend",
  Laravel: "backend",
  Symfony: "backend",
  "React Native": "mobile",
  Flutter: "mobile",
};

// ---------------------------------------------------------------------------
// Token-boundary matching. The boundary is asymmetric on purpose:
//  - lookbehind includes "." so "js" does NOT match inside "node.js" (preceded by "."),
//  - lookahead excludes "." so a term ending a sentence ("TypeScript.") still matches.
// Both exclude [a-z0-9+#] so "go" won't match inside "django"/"golang" and "java"
// won't match inside "javascript".
// ---------------------------------------------------------------------------
function compileMatchers(dict: Record<string, string[]>): Array<{ canonical: string; regexes: RegExp[] }> {
  return Object.entries(dict).map(([canonical, aliases]) => ({
    canonical,
    regexes: aliases.map((alias) => {
      const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?<![a-z0-9+#.])${esc}(?![a-z0-9+#])`);
    }),
  }));
}

const LANGUAGE_MATCHERS = compileMatchers(LANGUAGES);
const FRAMEWORK_MATCHERS = compileMatchers(FRAMEWORKS);
const ROLE_MATCHERS = compileMatchers(ROLE_TITLE_KEYWORDS as Record<string, string[]>);

function matchCanonicals(
  text: string,
  matchers: Array<{ canonical: string; regexes: RegExp[] }>,
): string[] {
  const found: string[] = [];
  for (const { canonical, regexes } of matchers) {
    if (regexes.some((re) => re.test(text))) found.push(canonical);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Derivation (memoized by job id — tags are deterministic from content)
// ---------------------------------------------------------------------------
const cache = new Map<string, JobTags>();

export function deriveJobTags(job: Job): JobTags {
  const cached = cache.get(job.id);
  if (cached) return cached;

  const title = (job.title ?? "").toLowerCase();
  const skills = (job.skills_required ?? []).join(" ").toLowerCase();
  const body = `${title} ${(job.description ?? "").toLowerCase()} ${skills}`;

  const languages = matchCanonicals(body, LANGUAGE_MATCHERS);
  const frameworks = matchCanonicals(body, FRAMEWORK_MATCHERS);

  // Roles: title keywords first (precise), then framework-based fallback.
  const roles = new Set(matchCanonicals(title, ROLE_MATCHERS));
  if (roles.size === 0) {
    const titleFrameworks = matchCanonicals(title, FRAMEWORK_MATCHERS);
    for (const fw of titleFrameworks) {
      const role = FRAMEWORK_ROLE[fw];
      if (role) roles.add(role);
    }
    // A title carrying both a frontend and a backend framework reads as fullstack.
    if (roles.has("frontend") && roles.has("backend")) {
      roles.clear();
      roles.add("fullstack");
    }
  }

  const tags: JobTags = { languages, frameworks, roles: Array.from(roles) };
  cache.set(job.id, tags);
  return tags;
}

/** Clear the memoization cache (e.g. after jobs are re-fetched with updated content). */
export function clearTaxonomyCache(): void {
  cache.clear();
}

/**
 * True when a job satisfies the selected tag filters: OR within each dimension,
 * AND across dimensions. Empty selections impose no constraint.
 */
export function jobMatchesTagFilters(
  job: Job,
  selected: { languages: string[]; frameworks: string[]; roles: string[] },
): boolean {
  const tags = deriveJobTags(job);
  const dimOk = (sel: string[], have: string[]) =>
    sel.length === 0 || sel.some((s) => have.includes(s));
  return (
    dimOk(selected.languages, tags.languages) &&
    dimOk(selected.frameworks, tags.frameworks) &&
    dimOk(selected.roles, tags.roles)
  );
}

/** Count how many of `jobs` carry each tag in the given dimension, descending. */
export function collectTagFacets(jobs: Job[], dimension: TaxonomyDimension): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    for (const tag of deriveJobTags(job)[dimension]) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
