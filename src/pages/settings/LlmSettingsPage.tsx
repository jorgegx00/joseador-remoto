import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LLM_PROVIDERS } from "@/services/llm";
import { useSettingsStore } from "@/stores/settingsStore";
import type { LlmProviderName } from "@/types";

export function LlmSettingsPanel() {
  const { t } = useTranslation("settings");
  const { llm, setActiveProvider } = useSettingsStore();

  const providerEntries = Object.entries(LLM_PROVIDERS) as [
    LlmProviderName,
    (typeof LLM_PROVIDERS)[LlmProviderName]
  ][];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("llm.title")}</CardTitle>
          <CardDescription>{t("llm.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {t("llm.byot_notice")}
          </p>
          <div className="flex items-center gap-4">
            <Label>{t("llm.active_provider")}</Label>
            <Badge variant={llm.active_provider ? "default" : "secondary"}>
              {llm.active_provider
                ? LLM_PROVIDERS[llm.active_provider].displayName
                : t("llm.no_provider")}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {providerEntries.map(([key, provider]) => (
        <Card key={key}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{provider.displayName}</CardTitle>
                <CardDescription>{provider.description}</CardDescription>
              </div>
              <Button
                variant={llm.active_provider === key ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveProvider(key)}
              >
                {llm.active_provider === key ? t("llm.active_provider") : "Select"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {provider.requiresApiKey && (
              <div className="space-y-2">
                <Label>{t("llm.api_key")}</Label>
                <Input type="password" placeholder="sk-..." />
                <Badge
                  variant={
                    llm.providers[key]?.api_key_set ? "default" : "secondary"
                  }
                >
                  {llm.providers[key]?.api_key_set
                    ? t("llm.api_key_set")
                    : t("llm.api_key_not_set")}
                </Badge>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("llm.model")}</Label>
              <div className="flex flex-wrap gap-1">
                {provider.defaultModels.map((model) => (
                  <Badge key={model} variant="outline" className="text-xs">
                    {model}
                  </Badge>
                ))}
              </div>
            </div>
            <Button variant="outline" size="sm">
              {t("llm.test_connection")}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
