import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettingsStore } from "@/stores/settingsStore";
import { getCountryProfile } from "@/lib/markets/countries";
import { CountrySelect, MarketMultiPicker } from "./MarketPicker";

const CURRENCIES = ["USD", "EUR", "DOP", "MXN", "COP", "CLP", "ARS", "BRL", "CAD", "GBP"];

/**
 * Edits the market profile in place (each change is saved and job eligibility is
 * recomputed in the background). Used by Settings and onboarding.
 */
export function MarketProfileForm({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation("settings");
  const market = useSettingsStore((s) => s.market);
  const setMarketProfile = useSettingsStore((s) => s.setMarketProfile);

  // Residence is implicitly a place the user may work; citizenships/visas are only
  // ever what the user adds explicitly (a guessed one would wrongly unlock jobs).
  const setResidence = (code: string) => {
    void setMarketProfile({
      residenceCountry: code,
      preferredCurrency: market.preferredCurrency || getCountryProfile(code).currency,
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="market-residence">{t("markets.residence")}</Label>
        <p className="text-xs text-muted-foreground" id="market-residence-help">
          {t("markets.residence_help")}
        </p>
        <CountrySelect id="market-residence" value={market.residenceCountry} onChange={setResidence} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="market-targets">{t("markets.targets")}</Label>
        <p className="text-xs text-muted-foreground">{t("markets.targets_help")}</p>
        <MarketMultiPicker
          id="market-targets"
          label={t("markets.targets")}
          value={market.targetMarkets}
          onChange={(targetMarkets) => void setMarketProfile({ targetMarkets })}
        />
      </div>

      {!compact && (
        <>
          <div className="space-y-2">
            <Label htmlFor="market-auth">{t("markets.work_auth")}</Label>
            <p className="text-xs text-muted-foreground">{t("markets.work_auth_help")}</p>
            <MarketMultiPicker
              id="market-auth"
              label={t("markets.work_auth")}
              includeRegions={false}
              allowEmpty
              value={[...new Set([...market.citizenships, ...market.workAuthorizations])]}
              onChange={(codes) => void setMarketProfile({ citizenships: [], workAuthorizations: codes })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="market-relocate">{t("markets.relocate")}</Label>
              <p className="text-xs text-muted-foreground">{t("markets.relocate_help")}</p>
            </div>
            <Switch
              id="market-relocate"
              checked={market.openToRelocate}
              onCheckedChange={(openToRelocate) => void setMarketProfile({ openToRelocate })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="market-contractor">{t("markets.contractor")}</Label>
              <p className="text-xs text-muted-foreground">{t("markets.contractor_help")}</p>
            </div>
            <Switch
              id="market-contractor"
              checked={market.acceptsContractor}
              onCheckedChange={(acceptsContractor) => void setMarketProfile({ acceptsContractor })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="market-currency">{t("markets.currency")}</Label>
            <Select
              value={market.preferredCurrency}
              onValueChange={(preferredCurrency) => void setMarketProfile({ preferredCurrency })}
            >
              <SelectTrigger id="market-currency" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  );
}
