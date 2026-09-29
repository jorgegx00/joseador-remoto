import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { countryName } from "@/lib/markets/countries";
import { isRegionCode } from "@/lib/markets/regions";

/** Display name for a market code in the UI language ("DO" → "República Dominicana"). */
export function useMarketLabel(): (code: string) => string {
  const { t, i18n } = useTranslation("common");
  return useCallback(
    (code: string) => (isRegionCode(code) ? t(`markets.regions.${code}`) : countryName(code, i18n.language || "es")),
    [t, i18n.language],
  );
}
