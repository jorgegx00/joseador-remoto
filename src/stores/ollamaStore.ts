import { useEffect } from "react";
import { create } from "zustand";
import { useSettingsStore } from "@/stores/settingsStore";
import { listOllamaModels, resolveOllamaBaseUrl } from "@/lib/llm/providers/ollama";
import * as control from "@/services/ollama-control";
import type { LoadedOllamaModel } from "@/services/ollama-control";

export type OllamaServerState = "unknown" | "offline" | "starting" | "online";

export interface OllamaPullState {
  model: string;
  status: string;
  completed: number | null;
  total: number | null;
}

interface OllamaState {
  /** Base URL the current status was read from (null when controls don't apply). */
  baseUrl: string | null;
  serverState: OllamaServerState;
  /** This app started the local server (so it may stop it). */
  ownedServer: boolean;
  /** The ollama executable exists on this machine. */
  binaryFound: boolean;
  installed: string[];
  loaded: LoadedOllamaModel[];
  busy: { model: string; action: "load" | "unload" } | null;
  pull: OllamaPullState | null;
  error: string | null;

  refresh: () => Promise<void>;
  load: (model: string) => Promise<boolean>;
  unload: (model: string) => Promise<boolean>;
  /** Makes `model` the active Ollama model, loading it when auto-load is on. */
  selectModel: (model: string) => Promise<void>;
  pullModel: (model: string) => Promise<boolean>;
  cancelPull: () => Promise<void>;
  startServer: () => Promise<boolean>;
  stopServer: () => Promise<void>;
  clearError: () => void;
}

/** Server address controls apply to, or null in remote mode (Ollama Cloud has no load/ps API). */
export function controllableOllamaUrl(): string | null {
  const { ollama } = useSettingsStore.getState().llm;
  if (ollama.mode === "remote") return null;
  return resolveOllamaBaseUrl(ollama.mode, ollama.base_url) || null;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isModelLoaded(loaded: LoadedOllamaModel[], model: string): boolean {
  return loaded.some((m) => m.name === model);
}

export const useOllamaStore = create<OllamaState>((set, get) => ({
  baseUrl: null,
  serverState: "unknown",
  ownedServer: false,
  binaryFound: false,
  installed: [],
  loaded: [],
  busy: null,
  pull: null,
  error: null,

  refresh: async () => {
    const baseUrl = controllableOllamaUrl();
    if (!baseUrl) {
      set({ baseUrl: null, serverState: "unknown", installed: [], loaded: [] });
      return;
    }
    const isLocal = useSettingsStore.getState().llm.ollama.mode === "local";
    const [tags, ps, info] = await Promise.allSettled([
      listOllamaModels(baseUrl),
      control.getLoadedModels(baseUrl),
      isLocal ? control.getServerInfo() : Promise.resolve(null),
    ]);
    // Settings changed while we were waiting: a newer refresh owns the state.
    if (controllableOllamaUrl() !== baseUrl) return;

    const online = tags.status === "fulfilled";
    const serverInfo = info.status === "fulfilled" ? info.value : null;
    set((state) => ({
      baseUrl,
      // Don't flip "starting" to "offline" while the server is booting.
      serverState: online ? "online" : state.serverState === "starting" ? "starting" : "offline",
      installed: online ? tags.value : [],
      loaded: online && ps.status === "fulfilled" ? ps.value : [],
      ownedServer: serverInfo?.owned_running ?? false,
      binaryFound: serverInfo ? serverInfo.binary !== null : state.binaryFound,
    }));
  },

  load: async (model) => {
    const baseUrl = controllableOllamaUrl();
    if (!baseUrl || !model) return false;
    set({ busy: { model, action: "load" }, error: null });
    try {
      await control.loadModel(baseUrl, model);
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    } finally {
      set({ busy: null });
      await get().refresh();
    }
  },

  unload: async (model) => {
    const baseUrl = controllableOllamaUrl();
    if (!baseUrl || !model) return false;
    set({ busy: { model, action: "unload" }, error: null });
    try {
      await control.unloadModel(baseUrl, model);
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    } finally {
      set({ busy: null });
      await get().refresh();
    }
  },

  selectModel: async (model) => {
    const settings = useSettingsStore.getState();
    const previous = settings.llm.providers.ollama.model;
    await settings.setActiveProviderAndModel("ollama", model);

    const { installed, loaded } = get();
    if (!settings.llm.ollama.auto_load || !controllableOllamaUrl()) return;
    if (!installed.includes(model) || isModelLoaded(loaded, model)) return;
    // Swap: free the model this app had selected before loading the new one.
    if (previous && previous !== model && isModelLoaded(loaded, previous)) {
      await get().unload(previous);
    }
    await get().load(model);
  },

  pullModel: async (model) => {
    const baseUrl = controllableOllamaUrl();
    if (!baseUrl || !model || get().pull) return false;
    set({ pull: { model, status: "starting", completed: null, total: null }, error: null });
    try {
      await control.pullModel(baseUrl, model, (p) =>
        set({ pull: { model, status: p.status, completed: p.completed, total: p.total } }),
      );
      set({ pull: null });
      await get().refresh();
      const { llm } = useSettingsStore.getState();
      if (llm.ollama.auto_load && llm.providers.ollama.model === model) {
        void get().load(model);
      }
      return true;
    } catch (err) {
      const message = messageOf(err);
      set({ pull: null, error: message === "cancelled" ? null : message });
      return false;
    }
  },

  cancelPull: async () => {
    await control.cancelPull();
  },

  startServer: async () => {
    set({ serverState: "starting", error: null });
    try {
      await control.startServer();
      set({ serverState: "online" });
      await get().refresh();
      const { llm } = useSettingsStore.getState();
      const model = llm.providers.ollama.model;
      if (llm.ollama.auto_load && model && get().installed.includes(model)) {
        void get().load(model);
      }
      return true;
    } catch (err) {
      set({ serverState: "offline", error: messageOf(err) });
      await get().refresh();
      return false;
    }
  },

  stopServer: async () => {
    try {
      await control.stopServer();
    } catch (err) {
      set({ error: messageOf(err) });
    }
    await get().refresh();
  },

  clearError: () => set({ error: null }),
}));

// ---------------------------------------------------------------------------
// Shared status polling — one interval app-wide however many components use it.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 10_000;
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function onFocus() {
  void useOllamaStore.getState().refresh();
}

function subscribe(): () => void {
  subscribers += 1;
  if (subscribers === 1) {
    void useOllamaStore.getState().refresh();
    timer = setInterval(() => void useOllamaStore.getState().refresh(), POLL_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
  }
  return () => {
    subscribers -= 1;
    if (subscribers === 0 && timer) {
      clearInterval(timer);
      timer = null;
      window.removeEventListener("focus", onFocus);
    }
  };
}

/**
 * Keeps Ollama status fresh while `active` (polls every 10 s and on window focus).
 * Also refreshes immediately when the server address or mode changes.
 */
export function useOllamaStatusPolling(active: boolean): void {
  const mode = useSettingsStore((s) => s.llm.ollama.mode);
  const baseUrl = useSettingsStore((s) => s.llm.ollama.base_url);

  useEffect(() => {
    if (!active) return;
    return subscribe();
  }, [active]);

  useEffect(() => {
    if (active) void useOllamaStore.getState().refresh();
  }, [active, mode, baseUrl]);
}
