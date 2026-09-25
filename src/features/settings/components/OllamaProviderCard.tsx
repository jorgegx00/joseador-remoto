import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Download, ExternalLink, Info, Loader2, RefreshCw, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiKeyInput } from "./ApiKeyInput";
import { PROVIDER_COLORS, PROVIDER_INITIALS } from "./provider-avatar";
import { OllamaControls } from "./OllamaControls";
import { useOllamaStore, useOllamaStatusPolling, isModelLoaded } from "@/stores/ollamaStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { storageService } from "@/services/storage";
import {
  listOllamaModels,
  normalizeOllamaBaseUrl,
  resolveOllamaBaseUrl,
  OLLAMA_LOCAL_URL,
} from "@/lib/llm/providers/ollama";
import type { LlmProviderInfo } from "@/lib/llm/providers/base";
import type { OllamaMode } from "@/types";

interface OllamaProviderCardProps {
  info: LlmProviderInfo;
}

const NUM_CTX_OPTIONS = [4096, 8192, 16384, 32768, 65536, 131072];

type ServerStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok"; latencyMs: number; count: number }
  | { state: "error"; message: string };

export function OllamaProviderCard({ info }: OllamaProviderCardProps) {
  const { t } = useTranslation("settings");
  const { llm, saveApiKey, setActiveProviderAndModel, setLlmSettings, setOllamaSettings } =
    useSettingsStore();

  const providerSettings = llm.providers.ollama;
  const ollama = llm.ollama;
  const isActive = llm.active_provider === "ollama";
  const selectedModel = providerSettings.model || (info.defaultModels[0]?.id ?? "");
  const baseUrl = resolveOllamaBaseUrl(ollama.mode, ollama.base_url);
  // Load/unload/download/server controls exist for local and LAN servers only.
  const controllable = providerSettings.enabled && ollama.mode !== "remote";
  useOllamaStatusPolling(controllable);
  const installed = useOllamaStore((s) => s.installed);
  const loaded = useOllamaStore((s) => s.loaded);
  const selectModel = useOllamaStore((s) => s.selectModel);
  const pullModel = useOllamaStore((s) => s.pullModel);
  const pullInProgress = useOllamaStore((s) => s.pull !== null);

  const [urlDraft, setUrlDraft] = useState(ollama.base_url);
  const [customModel, setCustomModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<ServerStatus>({ state: "idle" });

  useEffect(() => {
    setUrlDraft(ollama.base_url);
  }, [ollama.base_url]);

  const refreshModels = useCallback(async () => {
    setStatus({ state: "checking" });
    const start = performance.now();
    try {
      // Address comes from the store (storage writes may still be in flight);
      // the key is only ever sent to remote servers, matching getConfig.
      if (!baseUrl) throw new Error(t("llm.ollama.no_address"));
      const apiKey =
        ollama.mode === "remote" ? (await storageService.getApiKey("ollama")) ?? undefined : undefined;
      const found = await listOllamaModels(baseUrl, apiKey);
      setModels(found);
      setStatus({ state: "ok", latencyMs: Math.round(performance.now() - start), count: found.length });
    } catch (err) {
      setModels([]);
      setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [baseUrl, ollama.mode, t]);

  // Re-list models whenever the server, credentials or enabled state change.
  useEffect(() => {
    if (!providerSettings.enabled || !baseUrl) return;
    void refreshModels();
  }, [providerSettings.enabled, baseUrl, providerSettings.api_key_set, refreshModels]);

  const handleToggleEnabled = useCallback(
    async (enabled: boolean) => {
      setLlmSettings({
        providers: { ...llm.providers, ollama: { ...providerSettings, enabled } },
      });
      await storageService.saveSetting("llm_provider_ollama_enabled", String(enabled));
    },
    [llm.providers, providerSettings, setLlmSettings],
  );

  const handleModeChange = useCallback(
    (value: string) => {
      const mode = value as OllamaMode;
      // LAN and remote addresses differ, so don't carry one over to the other.
      void setOllamaSettings({ mode, base_url: mode === ollama.mode ? ollama.base_url : "" });
    },
    [ollama.mode, ollama.base_url, setOllamaSettings],
  );

  const commitUrl = useCallback(() => {
    const normalized = normalizeOllamaBaseUrl(urlDraft);
    setUrlDraft(normalized);
    if (normalized !== ollama.base_url) void setOllamaSettings({ base_url: normalized });
  }, [urlDraft, ollama.base_url, setOllamaSettings]);

  const handleModelChange = useCallback(
    (model: string) => {
      // selectModel also loads the model when auto-load is on.
      void (controllable ? selectModel(model) : setActiveProviderAndModel("ollama", model));
    },
    [controllable, selectModel, setActiveProviderAndModel],
  );

  const commitCustomModel = useCallback(() => {
    const model = customModel.trim();
    if (!model) return;
    handleModelChange(model);
    setCustomModel("");
  }, [customModel, handleModelChange]);

  const downloadCustomModel = useCallback(() => {
    const model = customModel.trim();
    if (!model) return;
    void setActiveProviderAndModel("ollama", model);
    void pullModel(model);
    setCustomModel("");
  }, [customModel, pullModel, setActiveProviderAndModel]);

  const handleClearApiKey = useCallback(async () => {
    await storageService.deleteApiKey("ollama");
    setLlmSettings({
      providers: { ...llm.providers, ollama: { ...providerSettings, api_key_set: false } },
    });
  }, [llm.providers, providerSettings, setLlmSettings]);

  // Installed models first; fall back to suggestions when the server hasn't been listed.
  const serverModels = controllable && installed.length > 0 ? installed : models;
  const modelOptions =
    serverModels.length > 0 ? [...serverModels] : info.defaultModels.map((m) => m.id);
  if (selectedModel && !modelOptions.includes(selectedModel)) {
    modelOptions.unshift(selectedModel);
  }
  // The controls panel shows install state for local/LAN; this hint covers remote servers.
  const modelNotInstalled =
    !controllable && status.state === "ok" && selectedModel !== "" && !models.includes(selectedModel);

  return (
    <Card className={isActive ? "border-primary shadow-sm" : "border-border"}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg text-white text-sm font-bold ${PROVIDER_COLORS.ollama}`}
            >
              {PROVIDER_INITIALS.ollama}
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
                {t("llm.ollama.description")}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="enable-ollama" className="text-xs text-muted-foreground">
              {providerSettings.enabled ? t("llm.enabled") : t("llm.disabled")}
            </Label>
            <Switch
              id="enable-ollama"
              checked={providerSettings.enabled}
              onCheckedChange={(checked) => void handleToggleEnabled(checked)}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Connection mode */}
        <div className="space-y-2">
          <Label className="text-sm">{t("llm.ollama.mode")}</Label>
          <Tabs value={ollama.mode} onValueChange={handleModeChange}>
            <TabsList className="w-full">
              <TabsTrigger value="local">{t("llm.ollama.mode_local")}</TabsTrigger>
              <TabsTrigger value="lan">{t("llm.ollama.mode_lan")}</TabsTrigger>
              <TabsTrigger value="remote">{t("llm.ollama.mode_remote")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Server address */}
        <div className="space-y-2">
          <Label className="text-sm" htmlFor="ollama-url">
            {t("llm.ollama.server_address")}
          </Label>
          {ollama.mode === "local" ? (
            <Input id="ollama-url" value={OLLAMA_LOCAL_URL} disabled className="font-mono text-sm" />
          ) : (
            <Input
              id="ollama-url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={commitUrl}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitUrl();
              }}
              placeholder={ollama.mode === "lan" ? "192.168.1.50:11434" : "https://ollama.com"}
              className="font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          )}
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-px shrink-0" />
            <span>{t(`llm.ollama.hint_${ollama.mode}`)}</span>
          </div>
        </div>

        {/* API key (remote servers only) */}
        {ollama.mode === "remote" && (
          <div className="space-y-2">
            <Label className="text-sm">{t("llm.ollama.api_key")}</Label>
            <ApiKeyInput
              isKeySet={providerSettings.api_key_set}
              onSave={(key) => saveApiKey("ollama", key)}
              onClear={handleClearApiKey}
              placeholder="..."
            />
          </div>
        )}

        {/* Model */}
        <div className="space-y-2">
          <Label className="text-sm">{t("llm.model")}</Label>
          <div className="flex items-center gap-2">
            <Select value={selectedModel} onValueChange={handleModelChange}>
              <SelectTrigger className="w-full font-mono text-sm">
                <SelectValue placeholder={t("llm.select_model")} />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((id) => (
                  <SelectItem key={id} value={id} className="font-mono text-sm">
                    <span className="flex items-center gap-2">
                      {id}
                      {controllable && isModelLoaded(loaded, id) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      )}
                      {controllable && installed.length > 0 && !installed.includes(id) && (
                        <span className="font-sans text-xs text-muted-foreground">
                          {t("llm.ollama.status_not_installed")}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => void refreshModels()}
              disabled={status.state === "checking" || !baseUrl}
              title={t("llm.refresh")}
            >
              <RefreshCw className={`h-4 w-4 ${status.state === "checking" ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitCustomModel();
              }}
              placeholder={t("llm.ollama.custom_model_placeholder")}
              className="h-8 font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={commitCustomModel}
              disabled={!customModel.trim()}
            >
              {t("llm.ollama.use_model")}
            </Button>
            {controllable && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={downloadCustomModel}
                disabled={!customModel.trim() || pullInProgress}
                title={t("llm.ollama.download")}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {modelNotInstalled && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("llm.ollama.model_not_installed", { model: selectedModel })}
            </p>
          )}
        </div>

        {controllable && <OllamaControls model={selectedModel} />}

        {/* Context window */}
        <div className="space-y-2">
          <Label className="text-sm">{t("llm.ollama.num_ctx")}</Label>
          <Select
            value={String(ollama.num_ctx)}
            onValueChange={(v) => void setOllamaSettings({ num_ctx: Number(v) })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(NUM_CTX_OPTIONS.includes(ollama.num_ctx)
                ? NUM_CTX_OPTIONS
                : [...NUM_CTX_OPTIONS, ollama.num_ctx].sort((a, b) => a - b)
              ).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t("llm.ollama.num_ctx_tokens", { formatted: n.toLocaleString() })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("llm.ollama.num_ctx_hint")}</p>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshModels()}
              disabled={status.state === "checking" || !baseUrl}
            >
              {status.state === "checking" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : null}
              {status.state === "checking" ? t("llm.testing") : t("llm.test_connection")}
            </Button>
            {!isActive && providerSettings.enabled && (
              <Button
                variant="default"
                size="sm"
                onClick={() => void setActiveProviderAndModel("ollama", selectedModel)}
              >
                {t("llm.set_active")}
              </Button>
            )}
          </div>
          <a
            href={info.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ollama.com
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {status.state === "ok" && (
          <Badge variant="default" className="bg-green-600 text-white">
            {t("llm.connection_ok")} ({status.latencyMs}ms) ·{" "}
            {t("llm.ollama.models_found", { count: status.count })}
          </Badge>
        )}
        {status.state === "error" && (
          <div className="space-y-1">
            <Badge variant="destructive">
              {t("llm.connection_failed")}: {status.message.substring(0, 100)}
            </Badge>
            <p className="text-xs text-muted-foreground">{t(`llm.ollama.unreachable_${ollama.mode}`)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
