import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProviderCard } from "./ProviderCard";
import { OllamaProviderCard } from "./OllamaProviderCard";
import { useSettingsStore } from "@/stores/settingsStore";
import { llmRegistry } from "@/lib/llm/registry";
import type { LlmProviderName } from "@/types";
import type { LlmProviderInfo } from "@/lib/llm/providers/base";

// BYOT cloud providers (API key per provider)
const CLOUD_PROVIDERS: LlmProviderName[] = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "deepseek",
];

// Every provider selectable as active; Ollama is configured by server address, not key.
const ALL_PROVIDERS: LlmProviderName[] = ["ollama", ...CLOUD_PROVIDERS];

export function LlmSettings() {
  const { t } = useTranslation("settings");
  const { llm, setActiveProviderAndModel, loadSettings } = useSettingsStore();

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const allProviders = llmRegistry.getAllProviders();
  const providerInfoMap = new Map<LlmProviderName, LlmProviderInfo>();
  for (const p of allProviders) {
    providerInfoMap.set(p.name, p);
  }

  // Build list of configured providers for the active provider selector
  const configuredProviders = ALL_PROVIDERS.filter(
    (p) => llm.providers[p].enabled || llm.providers[p].api_key_set,
  );

  const activeProviderInfo = llm.active_provider
    ? providerInfoMap.get(llm.active_provider)
    : null;

  const handleActiveProviderChange = (value: string) => {
    const provider = value as LlmProviderName;
    const providerInfo = providerInfoMap.get(provider);
    const currentModel = llm.providers[provider].model || (providerInfo?.defaultModels[0]?.id ?? "");
    void setActiveProviderAndModel(provider, currentModel);
  };

  return (
    <div className="space-y-4">
      {/* Header card with title and active provider */}
      <Card>
        <CardHeader>
          <CardTitle>{t("llm.title")}</CardTitle>
          <CardDescription>{t("llm.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* BYOT notice */}
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <Info className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {t("llm.byot_notice")}
            </p>
          </div>

          {/* Active provider selector */}
          <div className="space-y-2">
            <Label>{t("llm.active_provider")}</Label>
            <div className="flex items-center gap-3">
              <Select
                value={llm.active_provider ?? ""}
                onValueChange={handleActiveProviderChange}
              >
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder={t("llm.no_provider")} />
                </SelectTrigger>
                <SelectContent>
                  {configuredProviders.map((p) => {
                    const info = providerInfoMap.get(p);
                    return (
                      <SelectItem key={p} value={p}>
                        {info?.displayName ?? p}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {activeProviderInfo && (
                <Badge variant="secondary">
                  {llm.active_model || activeProviderInfo.defaultModels[0]?.name || t("llm.no_model")}
                </Badge>
              )}
              {!llm.active_provider && (
                <Badge variant="outline" className="text-muted-foreground">
                  {t("llm.no_provider")}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Local / self-hosted */}
      {providerInfoMap.get("ollama") && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t("llm.section_self_hosted")}</h3>
          <OllamaProviderCard info={providerInfoMap.get("ollama")!} />
        </div>
      )}

      {/* Cloud providers in responsive grid */}
      <h3 className="text-sm font-medium text-muted-foreground">{t("llm.section_cloud")}</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {CLOUD_PROVIDERS.map((providerName) => {
          const info = providerInfoMap.get(providerName);
          if (!info) return null;
          return (
            <ProviderCard
              key={providerName}
              provider={providerName}
              info={info}
            />
          );
        })}
      </div>
    </div>
  );
}
