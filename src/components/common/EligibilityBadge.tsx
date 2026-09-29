import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle, Globe, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CountryFlag } from "@/components/common/CountryFlag";
import { useMarketLabel } from "@/features/markets/useMarketLabel";
import type { Job, MarketVerdict } from "@/types";

const RANK: Record<MarketVerdict, number> = { explicit: 0, global: 1, ambiguous: 2, restricted: 3 };

const STYLES: Record<MarketVerdict, string> = {
  explicit:
    "bg-green-100 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-800",
  global: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-800",
  ambiguous:
    "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-800",
  restricted: "bg-muted text-muted-foreground border-border",
};

const ICONS = { explicit: CheckCircle, global: Globe, ambiguous: AlertTriangle, restricted: XCircle };

/**
 * Location fit of a job for the user's target markets: the best verdict as the
 * badge, every market's verdict and reason in the tooltip.
 */
export function EligibilityBadge({ job }: { job: Pick<Job, "market_eligibility"> }) {
  const { t } = useTranslation("common");
  const label = useMarketLabel();
  const entries = Object.entries(job.market_eligibility ?? {}).sort(([, a], [, b]) => RANK[a.verdict] - RANK[b.verdict]);
  if (entries.length === 0) return null;
  const [bestMarket, best] = entries[0];
  const Icon = ICONS[best.verdict];
  const text =
    best.verdict === "explicit"
      ? t("markets.eligibility.explicit", { market: label(bestMarket) })
      : t(`markets.eligibility.${best.verdict}`);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={STYLES[best.verdict]} tabIndex={0}>
          <Icon aria-hidden="true" className="h-3 w-3" />
          {text}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        <p className="mb-1 font-medium">{t("markets.eligibility.per_market")}</p>
        <ul className="space-y-1">
          {entries.map(([market, r]) => (
            <li key={market} className="flex items-start gap-1.5">
              <CountryFlag code={market} className="mt-0.5" />
              <span>
                <span className="font-medium">{label(market)}</span>: {r.reason}
              </span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
