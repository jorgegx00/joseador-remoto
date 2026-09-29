import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CountryFlag } from "@/components/common/CountryFlag";
import { useSettingsStore } from "@/stores/settingsStore";
import { MarketProfileForm } from "./MarketProfileForm";
import { useMarketLabel } from "./useMarketLabel";

/**
 * Header chip with the user's target markets; opens a quick editor. Existing
 * installs that never confirmed their markets (defaulted to the DR) get a dot.
 */
export function MarketChip() {
  const { t } = useTranslation("common");
  const markets = useSettingsStore((s) => s.market.targetMarkets);
  const configured = useSettingsStore((s) => s.marketConfigured);
  const label = useMarketLabel();
  const names = markets.map(label).join(", ");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative gap-1.5" aria-label={t("markets.header_chip_aria", { markets: names })}>
          <span className="flex items-center gap-1" aria-hidden="true">
            {markets.slice(0, 3).map((m) => (
              <CountryFlag key={m} code={m} />
            ))}
            {markets.length > 3 && <span className="text-xs text-muted-foreground">+{markets.length - 3}</span>}
          </span>
          <span className="hidden md:inline max-w-40 truncate text-muted-foreground">{label(markets[0])}</span>
          {!configured && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <p className="mb-3 text-sm font-medium">{t("markets.header_chip")}</p>
        <MarketProfileForm compact />
      </PopoverContent>
    </Popover>
  );
}
