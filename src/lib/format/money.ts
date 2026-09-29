/**
 * Salary formatting and normalization for every market.
 *
 * Several currencies share the bare "$" sign (USD, DOP, MXN, COP, CLP, ARS, CAD),
 * so a lone "$" is never shown: those currencies always get a disambiguated
 * symbol (US$, RD$, MX$…), placed where the UI locale puts currency symbols.
 */

import { getCountryProfile } from "@/lib/markets/countries";
import type { SalaryPeriod } from "@/types";

const EXPLICIT_SYMBOLS: Readonly<Record<string, string>> = {
  USD: "US$",
  DOP: "RD$",
  CAD: "CA$",
  MXN: "MX$",
  COP: "COL$",
  CLP: "CLP$",
  ARS: "AR$",
  AUD: "AU$",
  NZD: "NZ$",
  BRL: "R$",
};

export interface MoneyFormatOptions {
  /** BCP 47 locale for digit grouping and symbol placement. */
  locale: string;
  /** "12K" style for dense lists. */
  compact?: boolean;
}

function formatter(currency: string, opts: MoneyFormatOptions): Intl.NumberFormat | null {
  try {
    return new Intl.NumberFormat(opts.locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
      notation: opts.compact ? "compact" : "standard",
    });
  } catch {
    return null; // unknown currency code
  }
}

function withExplicitSymbol(parts: Array<{ type: string; value: string }>, currency: string): string {
  const symbol = EXPLICIT_SYMBOLS[currency];
  return parts.map((p) => (p.type === "currency" && symbol ? symbol : p.value)).join("");
}

export function formatMoney(amount: number, currency: string, opts: MoneyFormatOptions): string {
  const code = currency.toUpperCase();
  const f = formatter(code, opts);
  if (!f) return `${code} ${Math.round(amount).toLocaleString(opts.locale)}`;
  return withExplicitSymbol(f.formatToParts(amount), code);
}

/** "US$80,000 – 100,000", or a single amount when only one bound is known. */
export function formatMoneyRange(
  min: number | null,
  max: number | null,
  currency: string,
  opts: MoneyFormatOptions,
): string | null {
  if (min === null && max === null) return null;
  if (min === null || max === null || min === max) return formatMoney((min ?? max)!, currency, opts);
  const code = currency.toUpperCase();
  const f = formatter(code, opts);
  if (!f) return `${code} ${Math.round(min).toLocaleString(opts.locale)} – ${Math.round(max).toLocaleString(opts.locale)}`;
  return withExplicitSymbol(f.formatRangeToParts(min, max), code);
}

const PERIOD_FACTORS: Record<Exclude<SalaryPeriod, "month">, number> = {
  hour: 2080,
  day: 260,
  week: 52,
  year: 1,
};

/**
 * Annual equivalent of a salary figure. Monthly pay counts 13 months where a
 * statutory 13th salary exists (DR salario de Navidad, Brazil 13º) — ×12 there
 * would understate the offer.
 */
export function annualize(amount: number, period: SalaryPeriod, country?: string): number {
  if (period === "month") return amount * (country && getCountryProfile(country).thirteenthSalary ? 13 : 12);
  return amount * PERIOD_FACTORS[period];
}

/** Infer the pay period from the magnitude when the source didn't say. */
export function periodFromMagnitude(amount: number): SalaryPeriod {
  if (amount < 200) return "hour";
  if (amount < 25_000) return "month";
  return "year";
}
