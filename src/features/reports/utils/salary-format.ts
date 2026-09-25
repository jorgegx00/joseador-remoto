/**
 * Salary line for the report. Structured fields win; otherwise a conservative
 * regex sweep over the description catches "USD 3,000 - 4,500 / month",
 * "RD$80,000 mensual", "$50k-$70k per year" and similar patterns.
 */

const NOT_SPECIFIED = "No especificado";

interface SalaryFields {
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  description: string;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function currencyLabel(currency: string): string {
  const c = currency.trim().toUpperCase();
  if (c === "DOP" || c === "RD$") return "RD$";
  if (c === "" || c === "USD" || c === "US$" || c === "$") return "USD";
  return c;
}

/** Infer the pay period from the magnitude when the source didn't say. */
function periodFromMagnitude(amount: number): string {
  if (amount < 200) return "por hora";
  if (amount < 25_000) return "mensual";
  return "anual";
}

function render(currency: string, min: number | null, max: number | null, period: string): string {
  const label = currencyLabel(currency);
  if (min !== null && max !== null && min !== max) {
    return `${label} ${fmt(min)}–${fmt(max)} ${period}`;
  }
  const single = min ?? max;
  if (single === null) return NOT_SPECIFIED;
  return `${label} ${fmt(single)} ${period}`;
}

/** Parse "3,000" / "3.000" / "50k" → number. */
function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase();
  const k = cleaned.endsWith("k");
  const digits = cleaned.replace(/k$/, "").replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number.parseFloat(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return k ? n * 1000 : n;
}

const AMOUNT = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?\s?[kK]?)`;
const CURRENCY = String.raw`(usd|us\$|u\$s|rd\$|dop|\$)`;
const SALARY_RE = new RegExp(
  `${CURRENCY}\\s?${AMOUNT}(?:\\s?(?:-|–|—|a|to|hasta)\\s?(?:${CURRENCY})?\\s?${AMOUNT})?`,
  "i"
);

const PERIOD_HOUR = /(per|por)\s+(hour|hora)|hourly|\/\s?(hr|hour|hora)/i;
const PERIOD_MONTH = /(per|por|al)\s+(month|mes)|monthly|mensual|\/\s?(mo|month|mes)/i;
const PERIOD_YEAR = /(per|por|al)\s+(year|año|ano)|yearly|annually|anual|\/\s?(yr|year|año|ano)/i;

function extractFromDescription(description: string): string | null {
  const match = SALARY_RE.exec(description);
  if (!match) return null;

  const [, cur1, amt1, cur2, amt2] = match;
  const min = parseAmount(amt1);
  const max = amt2 ? parseAmount(amt2) : null;
  if (min === null) return null;
  // Tiny bare-dollar figures ("$99 bonus") are noise, not salaries.
  if (min < 10 && max === null) return null;

  const currencyRaw = (cur1 || cur2 || "USD").toUpperCase();
  const currency = currencyRaw.includes("RD") || currencyRaw === "DOP" ? "DOP" : "USD";

  // Look for an explicit period near the match before falling back to magnitude.
  const windowStart = Math.max(0, match.index - 30);
  const windowEnd = Math.min(description.length, match.index + match[0].length + 40);
  const context = description.slice(windowStart, windowEnd);
  let period: string;
  if (PERIOD_HOUR.test(context)) period = "por hora";
  else if (PERIOD_MONTH.test(context)) period = "mensual";
  else if (PERIOD_YEAR.test(context)) period = "anual";
  else period = periodFromMagnitude(max ?? min);

  return render(currency, min, max, period);
}

/** Spanish salary line, e.g. "USD 3,000–4,500 mensual" or "No especificado". */
export function formatSalary(job: SalaryFields): string {
  if (job.salary_min !== null || job.salary_max !== null) {
    const reference = job.salary_max ?? job.salary_min ?? 0;
    return render(job.salary_currency, job.salary_min, job.salary_max, periodFromMagnitude(reference));
  }
  return extractFromDescription(job.description) ?? NOT_SPECIFIED;
}
