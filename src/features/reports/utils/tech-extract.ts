/**
 * Technology extraction for the report. Prefers the job's structured
 * `skills_required`; falls back to a curated keyword sweep over
 * title + description (SerpApi rows usually arrive with an empty skills list).
 */

/** [display name, detection pattern over lowercased text] */
const TECH_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  // The bare "js"/"ts" abbreviations must not fire on framework suffixes
  // ("node.js", "next.js") — hence the lookbehind guard.
  ["JavaScript", /\bjavascript\b|(?<![.\w])js\b/],
  ["TypeScript", /\btypescript\b|(?<![.\w])ts\b/],
  ["React", /\breact(\.?js)?\b(?! native)/],
  ["React Native", /react native/],
  ["Angular", /\bangular(js)?\b/],
  ["Vue.js", /\bvue(\.?js)?\b/],
  ["Next.js", /\bnext\.?js\b/],
  ["Node.js", /\bnode(\.?js)?\b/],
  ["Express", /\bexpress(\.?js)?\b/],
  ["NestJS", /\bnest\.?js\b/],
  ["PHP", /\bphp\b/],
  ["Laravel", /\blaravel\b/],
  ["WordPress", /\bwordpress\b/],
  ["Python", /\bpython\b/],
  ["Django", /\bdjango\b/],
  ["FastAPI", /\bfastapi\b/],
  ["Flask", /\bflask\b/],
  ["Java", /\bjava\b/],
  ["Spring", /\bspring( boot)?\b/],
  ["Kotlin", /\bkotlin\b/],
  ["Swift", /\bswift(ui)?\b/],
  ["Objective-C", /objective[- ]c\b/],
  ["Flutter", /\bflutter\b/],
  ["C#", /\bc#|\bc-sharp\b|\bcsharp\b/],
  [".NET", /\.net\b|\bdotnet\b/],
  ["Ruby", /\bruby\b/],
  ["Rails", /\brails\b|ruby on rails/],
  ["Go", /\bgolang\b/],
  ["Rust", /\brust\b/],
  ["C++", /\bc\+\+/],
  ["SQL", /\bsql\b/],
  ["PostgreSQL", /\bpostgres(ql)?\b/],
  ["MySQL", /\bmysql\b/],
  ["SQL Server", /sql server/],
  ["MongoDB", /\bmongo(db)?\b/],
  ["Redis", /\bredis\b/],
  ["Elasticsearch", /\belasticsearch\b/],
  ["GraphQL", /\bgraphql\b/],
  ["REST", /\brest(ful)?\b|rest api/],
  ["AWS", /\baws\b|amazon web services/],
  ["Azure", /\bazure\b/],
  ["GCP", /\bgcp\b|google cloud/],
  ["Docker", /\bdocker\b/],
  ["Kubernetes", /\bkubernetes\b|\bk8s\b/],
  ["Terraform", /\bterraform\b/],
  ["CI/CD", /\bci\/cd\b|continuous (integration|delivery|deployment)/],
  ["Jenkins", /\bjenkins\b/],
  ["Git", /\bgit\b(?!hub|lab)/],
  ["Linux", /\blinux\b/],
  ["HTML", /\bhtml5?\b/],
  ["CSS", /\bcss3?\b/],
  ["Sass", /\bsass\b|\bscss\b/],
  ["Tailwind", /\btailwind(css)?\b/],
  ["Salesforce", /\bsalesforce\b/],
  ["Shopify", /\bshopify\b/],
  ["Selenium", /\bselenium\b/],
  ["Cypress", /\bcypress\b/],
  ["Playwright", /\bplaywright\b/],
  ["Appium", /\bappium\b/],
  ["Jest", /\bjest\b/],
  ["JUnit", /\bjunit\b/],
  ["Pytest", /\bpytest\b/],
  ["Jira", /\bjira\b/],
  ["Scrum", /\bscrum\b/],
  ["Kanban", /\bkanban\b/],
  ["Agile", /\bagile\b|\bagil(e|es)\b/],
  ["Figma", /\bfigma\b/],
  ["Power BI", /power ?bi\b/],
  ["Tableau", /\btableau\b/],
  ["Snowflake", /\bsnowflake\b/],
  ["Spark", /\bspark\b/],
  ["Kafka", /\bkafka\b/],
  ["Airflow", /\bairflow\b/],
  ["dbt", /\bdbt\b/],
  ["Pandas", /\bpandas\b/],
  ["TensorFlow", /\btensorflow\b/],
  ["PyTorch", /\bpytorch\b/],
  ["Unity", /\bunity\b/],
];

const MAX_TECHS = 12;

/**
 * Extract technologies for a job. `skills` (when present) leads the list;
 * keyword hits from title+description fill the remainder, deduplicated
 * case-insensitively.
 */
export function extractTechs(title: string, description: string, skills: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const skill of skills) {
    const cleaned = skill.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }

  const text = `${title} ${description}`.toLowerCase();
  for (const [display, pattern] of TECH_PATTERNS) {
    if (out.length >= MAX_TECHS) break;
    if (seen.has(display.toLowerCase())) continue;
    if (pattern.test(text)) {
      seen.add(display.toLowerCase());
      out.push(display);
    }
  }

  return out.slice(0, MAX_TECHS);
}
