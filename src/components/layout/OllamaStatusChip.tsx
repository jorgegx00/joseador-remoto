import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Cpu, Loader2, Play, Power, Settings, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSettingsStore } from "@/stores/settingsStore";
import { useOllamaStore, useOllamaStatusPolling, isModelLoaded } from "@/stores/ollamaStore";

type ChipState = "loaded" | "idle" | "loading" | "offline" | "starting" | "not_installed" | "unknown";

/**
 * Header status for the active local/LAN Ollama model, with quick Load/Unload
 * and Start-server actions. Renders nothing for other providers or remote mode.
 */
export function OllamaStatusChip() {
  const { t } = useTranslation("common");
  const activeProvider = useSettingsStore((s) => s.llm.active_provider);
  const mode = useSettingsStore((s) => s.llm.ollama.mode);
  const model = useSettingsStore((s) => s.llm.providers.ollama.model);
  const visible = activeProvider === "ollama" && mode !== "remote";
  useOllamaStatusPolling(visible);

  const { serverState, binaryFound, installed, loaded, busy, pull, load, unload, startServer } =
    useOllamaStore();

  if (!visible) return null;

  const loadedHere = isModelLoaded(loaded, model);
  const state: ChipState =
    serverState === "starting"
      ? "starting"
      : serverState === "offline"
        ? "offline"
        : serverState === "unknown"
          ? "unknown"
          : busy?.model === model || pull?.model === model
            ? "loading"
            : loadedHere
              ? "loaded"
              : installed.includes(model)
                ? "idle"
                : "not_installed";

  const dot =
    state === "loaded"
      ? "bg-green-500"
      : state === "loading" || state === "starting"
        ? "bg-amber-500 animate-pulse"
        : state === "offline" || state === "not_installed"
          ? "bg-red-500"
          : "bg-muted-foreground/50";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-[240px]">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <span className="truncate font-mono text-xs">{model || "Ollama"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{model || "Ollama"}</p>
            <p className="text-xs text-muted-foreground">{t(`ollama_chip.${state}`)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {state === "offline" && mode === "local" && binaryFound && (
            <Button size="sm" onClick={() => void startServer()}>
              <Power className="h-3.5 w-3.5 mr-1.5" />
              {t("ollama_chip.start_server")}
            </Button>
          )}
          {state === "starting" && (
            <Button size="sm" disabled>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              {t("ollama_chip.starting")}
            </Button>
          )}
          {state === "idle" && (
            <Button size="sm" onClick={() => void load(model)}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              {t("ollama_chip.load")}
            </Button>
          )}
          {state === "loaded" && (
            <Button size="sm" variant="outline" onClick={() => void unload(model)}>
              <Square className="h-3.5 w-3.5 mr-1.5" />
              {t("ollama_chip.unload")}
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link to="/settings">
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              {t("ollama_chip.settings")}
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
