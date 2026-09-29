import { describe, it, expect } from "vitest";
import { annualize, formatMoney, formatMoneyRange } from "../../src/lib/format/money";

describe("formatMoney", () => {
  it("never shows a bare $ for dollar-sign currencies", () => {
    expect(formatMoney(80000, "USD", { locale: "en-US" })).toBe("US$80,000");
    expect(formatMoney(80000, "DOP", { locale: "es-DO" })).toContain("RD$");
    expect(formatMoney(80000, "USD", { locale: "es-DO" })).toContain("US$");
  });

  it("keeps locale symbol placement for euros", () => {
    expect(formatMoney(50000, "EUR", { locale: "de-DE" })).toMatch(/50\.000\s€/);
  });

  it("formats ranges and compact values", () => {
    expect(formatMoneyRange(80000, 100000, "USD", { locale: "en-US" })).toMatch(/^US\$80,000\s?–\s?(US\$)?100,000$/);
    expect(formatMoneyRange(80000, 100000, "USD", { locale: "en-US", compact: true })).toBe("US$80–100K");
    expect(formatMoneyRange(null, 5000, "USD", { locale: "en-US" })).toBe("US$5,000");
    expect(formatMoneyRange(null, null, "USD", { locale: "en-US" })).toBeNull();
  });

  it("falls back for unknown currency codes", () => {
    expect(formatMoney(10, "ZZZ", { locale: "en-US" })).toMatch(/ZZZ/);
  });
});

describe("annualize", () => {
  it("counts a 13th salary where the law has one", () => {
    expect(annualize(1000, "month", "DO")).toBe(13000);
    expect(annualize(1000, "month", "BR")).toBe(13000);
    expect(annualize(1000, "month", "US")).toBe(12000);
    expect(annualize(50, "hour")).toBe(104000);
  });
});
