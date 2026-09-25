/**
 * Heuristic role classification from the job title. Drives both the report
 * filter (non-tech roles are excluded) and the per-job "perfiles recomendados"
 * line. Precedence matters: specific buckets (QA, PM, Full Stack, Mobile)
 * must win over the broad Backend/Frontend keyword nets.
 */

export type RoleCategory =
  | "Backend"
  | "Frontend"
  | "Full Stack"
  | "Mobile"
  | "QA"
  | "PM"
  | "DevOps"
  | "Data"
  | "Otros (tech)";

const RULES: ReadonlyArray<[RoleCategory, RegExp]> = [
  ["QA", /\bqa\b|quality assurance|\btester\b|test (engineer|analyst|automation)|\bsdet\b|automation (engineer|tester)/],
  ["PM", /project manager|product manager|product owner|scrum master|delivery manager|program manager|engineering manager|\bpmo\b/],
  ["DevOps", /devops|\bsre\b|site reliability|platform engineer|cloud (engineer|architect)|infrastructure engineer/],
  ["Full Stack", /full[ -]?stack/],
  ["Mobile", /\bmobile\b|\bios\b|\bandroid\b|react native|flutter|\bswift\b|\bkotlin\b/],
  ["Data", /data (engineer|analyst|scientist|architect)|machine learning|\bml engineer\b|business intelligence|\bbi (analyst|developer)\b|analytics engineer/],
  [
    "Backend",
    /back[ -]?end|\bnode(\.?js)?\b|\bjava\b|\bpython\b|\bgolang\b|\bphp\b|laravel|\.net\b|\bc#|\bruby\b|rails|django|spring boot|\bapi (developer|engineer)\b/,
  ],
  ["Frontend", /front[ -]?end|\breact\b|angular|\bvue\b|\bui (developer|engineer)\b|web developer/],
  [
    "Otros (tech)",
    /software (engineer|developer|architect)|\bdeveloper\b|\bprogrammer\b|programador|desarrollador|solutions architect|tech lead|technical lead|\bsoftware\b/,
  ],
];

/** Returns the role category for a job title, or null when not a tech role. */
export function classifyRole(title: string): RoleCategory | null {
  const t = title.toLowerCase();
  for (const [category, pattern] of RULES) {
    if (pattern.test(t)) return category;
  }
  return null;
}

/** Display order for report sections. */
export const CATEGORY_ORDER: readonly RoleCategory[] = [
  "Backend",
  "Frontend",
  "Full Stack",
  "Mobile",
  "QA",
  "PM",
  "DevOps",
  "Data",
  "Otros (tech)",
];
