import { useTranslation } from "react-i18next";
import { Download, ExternalLink, Loader2, Play, Power, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/stores/settingsStore";
import { useOllamaStore, isModelLoaded } from "@/stores/ollamaStore";
import type { OllamaSettings } from "@/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** Server/model lifecycle controls for local and LAN Ollama servers. */
export function OllamaControls({ model }: { model: string }) {
  const { t } = useTranslation("settings");
  const ollama = useSettingsStore((s) => s.llm.ollama);
  const setOllamaSettings = useSettingsStore((s) => s.setOllamaSettings);
  const {
    serverState,
    ownedServer,
    binaryFound,
    installed,
    loaded,
    busy,
    pull,
    error,
    load,
    unload,
    pullModel,
    cancelPull,
    startServer,
    stopServer,
    clearError,
  } = useOllamaStore();

  const isLocal = ollama.mode === "local";
  const online = serverState === "online";
  const loadedEntry = loaded.find((m) => m.name === model);
  const isInstalled = installed.includes(model);
  const busyHere = busy?.model === model ? busy.action : null;
  const pullPercent =
    pull?.total && pull.completed != null ? Math.round((pull.completed / pull.total) * 100) : null;

  const toggle = (key: keyof Pick<OllamaSettings, "auto_load" | "auto_start" | "unload_on_exit">) =>
    (checked: boolean) => void setOllamaSettings({ [key]: checked });

  return (
    <div className="space-y-3 rounded-md border p-3">
      {/* Server status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${
              online ? "bg-green-500" : serverState === "starting" ? "bg-amber-500 animate-pulse" : "bg-muted-foreground/50"
            }`}
          />
          <span className="font-medium">{t(`llm.ollama.server_${serverState}`)}</span>
          {ownedServer && (
            <Badge variant="outline" className="text-xs">
              {t("llm.ollama.started_by_app")}
            </Badge>
          )}
        </div>
        {isLocal && !online && serverState !== "unknown" && (
          binaryFound ? (
            <Button size="sm" onClick={() => void startServer()} disabled={serverState === "starting"}>
              {serverState === "starting" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Power className="h-3.5 w-3.5 mr-1.5" />
              )}
              {t("llm.ollama.start_server")}
            </Button>
          ) : (
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {t("llm.ollama.install_ollama")}
              <ExternalLink className="h-3 w-3" />
            </a>
          )
        )}
        {isLocal && online && ownedServer && (
          <Button size="sm" variant="outline" onClick={() => void stopServer()}>
            <Square className="h-3.5 w-3.5 mr-1.5" />
            {t("llm.ollama.stop_server")}
          </Button>
        )}
      </div>

      {/* Selected model */}
      {online && model && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-sm truncate">{model}</span>
            {loadedEntry ? (
              <Badge className="bg-green-600 text-white text-xs">
                {t("llm.ollama.status_loaded")}
                {loadedEntry.size_vram > 0 ? ` · ${formatBytes(loadedEntry.size_vram)} VRAM` : ""}
              </Badge>
            ) : isInstalled ? (
              <Badge variant="secondary" className="text-xs">
                {t("llm.ollama.status_installed")}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-amber-600">
                {t("llm.ollama.status_not_installed")}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isInstalled ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void pullModel(model)}
                disabled={pull !== null}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                {t("llm.ollama.download")}
              </Button>
            ) : isModelLoaded(loaded, model) ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void unload(model)}
                disabled={busyHere !== null}
              >
                {busyHere === "unload" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Square className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t("llm.ollama.unload")}
              </Button>
            ) : (
              <Button size="sm" onClick={() => void load(model)} disabled={busyHere !== null}>
                {busyHere === "load" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                )}
                {busyHere === "load" ? t("llm.ollama.loading") : t("llm.ollama.load")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Other loaded models (e.g. from another client or a previous selection) */}
      {online && loaded.some((m) => m.name !== model) && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("llm.ollama.other_loaded")}</p>
          {loaded
            .filter((m) => m.name !== model)
            .map((m) => (
              <div key={m.name} className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs truncate">
                  {m.name}
                  {m.size_vram > 0 ? ` · ${formatBytes(m.size_vram)}` : ""}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => void unload(m.name)}
                  disabled={busy?.model === m.name}
                >
                  {t("llm.ollama.unload")}
                </Button>
              </div>
            ))}
        </div>
      )}

      {/* Download progress */}
      {pull && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate">
              {t("llm.ollama.downloading", { model: pull.model })} · {pull.status}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => void cancelPull()}
              title={t("llm.ollama.cancel_download")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Progress value={pullPercent ?? 0} className="h-1.5" />
          {pull.total ? (
            <p className="text-xs text-muted-foreground">
              {formatBytes(pull.completed ?? 0)} / {formatBytes(pull.total)}
              {pullPercent !== null ? ` (${pullPercent}%)` : ""}
            </p>
          ) : null}
        </div>
      )}

      {error && (
        <div className="flex items-start justify-between gap-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
          <span>{error}</span>
          <button type="button" onClick={clearError} className="shrink-0" aria-label="dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Lifecycle preferences */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="ollama-auto-load" className="text-xs font-normal">
            {t("llm.ollama.auto_load")}
          </Label>
          <Switch id="ollama-auto-load" checked={ollama.auto_load} onCheckedChange={toggle("auto_load")} />
        </div>
        {isLocal && (
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ollama-auto-start" className="text-xs font-normal">
              {t("llm.ollama.auto_start")}
            </Label>
            <Switch
              id="ollama-auto-start"
              checked={ollama.auto_start}
              onCheckedChange={toggle("auto_start")}
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="ollama-unload-exit" className="text-xs font-normal">
            {t("llm.ollama.unload_on_exit")}
          </Label>
          <Switch
            id="ollama-unload-exit"
            checked={ollama.unload_on_exit}
            onCheckedChange={toggle("unload_on_exit")}
          />
        </div>
        {ollama.mode === "lan" && ollama.unload_on_exit && (
          <p className="text-xs text-muted-foreground">{t("llm.ollama.unload_on_exit_lan_hint")}</p>
        )}
      </div>
    </div>
  );
}
