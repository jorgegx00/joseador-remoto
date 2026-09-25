import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Loader2, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiKeyInput } from "./ApiKeyInput";
import { PROVIDER_COLORS, PROVIDER_INITIALS } from "./provider-avatar";
import { useSettingsStore } from "@/stores/settingsStore";
import { useLlmStore } from "@/stores/llmStore";
import { storageService } from "@/services/storage";
import type { LlmProviderName } from "@/types";
import type { LlmProviderInfo } from "@/lib/llm/providers/base";

interface ProviderCardProps {
  provider: LlmProviderName;
  info: LlmProviderInfo;
}

export function ProviderCard({ provider, info }: ProviderCardProps) {
  const { t } = useTranslation("settings");
  const { llm, saveApiKey, setActiveProviderAndModel, setLlmSettings } =
    useSettingsStore();
  const { testConnection, lastTestResult, isChecking } = useLlmStore();

  const [localTestResult, setLocalTestResult] = useState<{
    success: boolean;
    latencyMs: number;
    error?: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const providerSettings = llm.providers[provider];
  const isActive = llm.active_provider === provider;
  const selectedModel = providerSettings.model || (info.defaultModels[0]?.id ?? "");

  const handleToggleEnabled = useCallback(
    async (enabled: boolean) => {
      setLlmSettings({
        providers: {
          ...llm.providers,
          [provider]: {
            ...providerSettings,
            enabled,
          },
        },
      });
      await storageService.saveSetting(
        `llm_provider_${provider}_enabled`,
        String(enabled),
      );
    },
    [llm.providers, provider, providerSettings, setLlmSettings],
  );

  const handleModelChange = useCallback(
    (model: string) => {
      void setActiveProviderAndModel(provider, model);
    },
    [provider, setActiveProviderAndModel],
  );

  const handleSaveApiKey = useCallback(
    async (key: string) => {
      await saveApiKey(provider, key);
    },
    [provider, saveApiKey],
  );

  const handleClearApiKey = useCallback(async () => {
    await storageService.deleteApiKey(provider);
    setLlmSettings({
      providers: {
        ...llm.providers,
        [provider]: {
          ...providerSettings,
          api_key_set: false,
        },
      },
    });
  }, [llm.providers, provider, providerSettings, setLlmSettings]);

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setLocalTestResult(null);
    try {
      const start = performance.now();
      const success = await testConnection(provider);
      const latencyMs = Math.round(performance.now() - start);
      const result = {
        success,
        latencyMs,
        error: success ? undefined : lastTestResult?.error,
      };
      setLocalTestResult(result);
    } catch (err) {
      setLocalTestResult({
        success: false,
        latencyMs: 0,
        error: String(err),
      });
    } finally {
      setIsTesting(false);
    }
  }, [provider, testConnection, lastTestResult]);

  const handleSetActive = useCallback(() => {
    void setActiveProviderAndModel(provider, selectedModel);
  }, [provider, selectedModel, setActiveProviderAndModel]);

  return (
    <Card
      className={
        isActive
          ? "border-primary shadow-sm"
          : "border-border"
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Provider avatar */}
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg text-white text-sm font-bold ${PROVIDER_COLORS[provider]}`}
            >
              {PROVIDER_INITIALS[provider]}
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {info.displayName}
                {isActive && (
                  <Badge variant="default" className="text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    {t("llm.active_badge")}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {info.description}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`enable-${provider}`} className="text-xs text-muted-foreground">
              {providerSettings.enabled ? t("llm.enabled") : t("llm.disabled")}
            </Label>
            <Switch
              id={`enable-${provider}`}
              checked={providerSettings.enabled}
              onCheckedChange={(checked) => void handleToggleEnabled(checked)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* API Key section */}
        {info.requiresApiKey && (
          <div className="space-y-2">
            <Label className="text-sm">{t("llm.api_key")}</Label>
            <ApiKeyInput
              isKeySet={providerSettings.api_key_set}
              onSave={handleSaveApiKey}
              onClear={handleClearApiKey}
              placeholder={provider === "openai" ? "sk-..." : "..."}
            />
          </div>
        )}

        {/* Model selector */}
        <div className="space-y-2">
          <Label className="text-sm">{t("llm.model")}</Label>
          <Select value={selectedModel} onValueChange={handleModelChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("llm.select_model")} />
            </SelectTrigger>
            <SelectContent>
              {info.defaultModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <div className="flex flex-col">
                    <span>{model.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {model.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {/* Test connection button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleTestConnection()}
              disabled={
                isTesting ||
                isChecking ||
                (info.requiresApiKey && !providerSettings.api_key_set)
              }
            >
              {isTesting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : null}
              {isTesting ? t("llm.testing") : t("llm.test_connection")}
            </Button>

            {/* Set as active button */}
            {!isActive && providerSettings.enabled && (
              <Button variant="default" size="sm" onClick={handleSetActive}>
                {t("llm.set_active")}
              </Button>
            )}
          </div>

          {/* Pricing link */}
          <a
            href={info.pricingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("llm.view_pricing")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Test result badge */}
        {localTestResult && (
          <div className="pt-1">
            {localTestResult.success ? (
              <Badge variant="default" className="bg-green-600 text-white">
                {t("llm.connection_ok")} ({localTestResult.latencyMs}ms)
              </Badge>
            ) : (
              <Badge variant="destructive">
                {t("llm.connection_failed")}
                {localTestResult.error
                  ? `: ${localTestResult.error.substring(0, 80)}`
                  : ""}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
