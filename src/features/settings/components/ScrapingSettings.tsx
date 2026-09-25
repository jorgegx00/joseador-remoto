import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, ListFilter, Radar, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { storageService } from "@/services/storage";
import {
  getIngestConfig,
  setIngestNumber,
  setIngestTermList,
  INGEST_SETTING_KEYS,
  type IngestConfig,
} from "@/services/ingest/config";
import { useIngestStore } from "@/stores/ingestStore";
import { ApiKeyInput } from "./ApiKeyInput";
import { TermListEditor } from "./TermListEditor";

interface KeyProvider {
  id: "serpapi" | "apify";
  nameKey: string;
  hintKey: string;
  url: string;
  placeholder: string;
}

const KEY_PROVIDERS: KeyProvider[] = [
  {
    id: "serpapi",
    nameKey: "scraping.serpapi_title",
    hintKey: "scraping.serpapi_hint",
    url: "https://serpapi.com/manage-api-key",
    placeholder: "0123abc...",
  },
  {
    id: "apify",
    nameKey: "scraping.apify_title",
    hintKey: "scraping.apify_hint",
    url: "https://console.apify.com/settings/integrations",
    placeholder: "apify_api_...",
  },
];

interface CapField {
  settingKey: string;
  labelKey: string;
  configKey: keyof Pick<
    IngestConfig,
    | "serpapiDailyCap"
    | "serpapiMonthlyCap"
    | "apifyDailyCap"
    | "apifyMonthlyCap"
    | "apifyLinkedinLimit"
    | "maxPagesPerQuery"
  >;
}

const CAP_FIELDS: CapField[] = [
  { settingKey: INGEST_SETTING_KEYS.serpapiDailyCap, labelKey: "scraping.serpapi_daily_cap", configKey: "serpapiDailyCap" },
  { settingKey: INGEST_SETTING_KEYS.serpapiMonthlyCap, labelKey: "scraping.serpapi_monthly_cap", configKey: "serpapiMonthlyCap" },
  { settingKey: INGEST_SETTING_KEYS.apifyDailyCap, labelKey: "scraping.apify_daily_cap", configKey: "apifyDailyCap" },
  { settingKey: INGEST_SETTING_KEYS.apifyMonthlyCap, labelKey: "scraping.apify_monthly_cap", configKey: "apifyMonthlyCap" },
  { settingKey: INGEST_SETTING_KEYS.apifyLinkedinLimit, labelKey: "scraping.apify_limit", configKey: "apifyLinkedinLimit" },
  { settingKey: INGEST_SETTING_KEYS.maxPagesPerQuery, labelKey: "scraping.max_pages", configKey: "maxPagesPerQuery" },
];

/**
 * Scraping panel — replaces the old Jobs Service panel. Everything runs
 * in-app with the user's own keys (BYOT): SerpApi/Apify credentials, search
 * term lists, and budget caps, all persisted in the local encrypted store.
 */
export function ScrapingSettings() {
  const { t } = useTranslation("settings");
  const [keysSet, setKeysSet] = useState<Record<string, boolean>>({});
  const [config, setConfig] = useState<IngestConfig | null>(null);
  const { budgets, loadBudgets } = useIngestStore();

  const reload = useCallback(async () => {
    const [serpapiKey, apifyKey, currentConfig] = await Promise.all([
      storageService.getApiKey("serpapi"),
      storageService.getApiKey("apify"),
      getIngestConfig(),
    ]);
    setKeysSet({ serpapi: Boolean(serpapiKey), apify: Boolean(apifyKey) });
    setConfig(currentConfig);
    void loadBudgets();
  }, [loadBudgets]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleTermsChange(
    key: typeof INGEST_SETTING_KEYS.queries | typeof INGEST_SETTING_KEYS.apifyTitles,
    terms: string[] | null,
  ) {
    try {
      await setIngestTermList(key, terms);
      await reload();
      toast.success(t("scraping.saved"));
    } catch {
      toast.error(t("scraping.save_failed"));
    }
  }

  async function handleCapChange(field: CapField, rawValue: string) {
    const value = rawValue.trim() === "" ? null : Number(rawValue);
    try {
      await setIngestNumber(field.settingKey, value);
      await reload();
    } catch {
      toast.error(t("scraping.save_failed"));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radar className="h-5 w-5" />
            {t("scraping.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("scraping.description")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t("scraping.keys_title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {KEY_PROVIDERS.map((provider) => (
            <div key={provider.id} className="space-y-2">
              <Label>{t(provider.nameKey)}</Label>
              <p className="text-xs text-muted-foreground">
                {t(provider.hintKey)}{" "}
                <a
                  href={provider.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {t("scraping.get_key_link")}
                </a>
              </p>
              <ApiKeyInput
                isKeySet={Boolean(keysSet[provider.id])}
                placeholder={provider.placeholder}
                onSave={async (key) => {
                  await storageService.saveApiKey(provider.id, key);
                  await reload();
                }}
                onClear={async () => {
                  await storageService.deleteApiKey(provider.id);
                  await reload();
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListFilter className="h-5 w-5" />
            {t("scraping.terms_title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>{t("scraping.queries_title")}</Label>
            <p className="text-xs text-muted-foreground">{t("scraping.queries_hint")}</p>
            {config && (
              <TermListEditor
                terms={config.queries}
                placeholder={t("scraping.queries_placeholder")}
                onChange={(terms) => void handleTermsChange(INGEST_SETTING_KEYS.queries, terms)}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>{t("scraping.titles_title")}</Label>
            <p className="text-xs text-muted-foreground">{t("scraping.titles_hint")}</p>
            {config && (
              <TermListEditor
                terms={config.apifyTitles}
                placeholder={t("scraping.titles_placeholder")}
                onChange={(terms) => void handleTermsChange(INGEST_SETTING_KEYS.apifyTitles, terms)}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            {t("scraping.caps_title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">{t("scraping.caps_hint")}</p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {CAP_FIELDS.map((field) => (
              <div key={field.settingKey} className="space-y-1.5">
                <Label className="text-xs">{t(field.labelKey)}</Label>
                <Input
                  type="number"
                  min={1}
                  className="h-8 text-sm"
                  value={config ? String(config[field.configKey]) : ""}
                  onChange={(e) => void handleCapChange(field, e.target.value)}
                />
              </div>
            ))}
          </div>
          {budgets.length > 0 && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {budgets.map((b) => (
                <p key={b.provider}>
                  {t("scraping.usage_line", {
                    provider: b.provider === "serpapi" ? "SerpApi" : "Apify (LinkedIn)",
                    dailyUsed: b.dailyUsed,
                    dailyCap: b.dailyCap,
                    monthlyUsed: b.monthlyUsed,
                    monthlyCap: b.monthlyCap,
                  })}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
