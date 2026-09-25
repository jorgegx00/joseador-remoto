import { create } from "zustand";
import { testLlmConnection, getConfig } from "@/services/llm";
import { LlmService } from "@/lib/llm/service";
import { storageService } from "@/services/storage";
import { useSettingsStore } from "@/stores/settingsStore";
import { getCvById, getJobById } from "@/services/database";
import { getOrRunMatchAnalysis } from "@/services/match-analysis";
import type {
  LlmProviderName,
  LlmConfig,
  MatchAnalysis,
  NarrativeReport,
} from "@/types";

interface LlmState {
  activeProvider: LlmProviderName | null;
  activeModel: string;
  configs: Partial<Record<LlmProviderName, LlmConfig>>;
  isConnected: boolean;
  isProcessing: boolean;
  isChecking: boolean;
  error: string | null;
  lastMatchAnalysis: MatchAnalysis | null;
  /** Whether lastMatchAnalysis came from the cache (no LLM call). */
  lastMatchCached: boolean;
  /** Whether the cached analysis predates CV/job edits (null = unknown). */
  lastMatchStale: boolean | null;
  lastNarrativeReport: NarrativeReport | null;
  lastTestResult: { success: boolean; latencyMs: number; error?: string } | null;

  setActiveProvider: (provider: LlmProviderName | null) => void;
  setActiveModel: (model: string) => void;
  setConfig: (provider: LlmProviderName, config: LlmConfig) => void;
  removeConfig: (provider: LlmProviderName) => void;
  setProvider: (provider: LlmProviderName) => Promise<void>;
  setModel: (model: string) => Promise<void>;
  testConnection: (provider?: LlmProviderName) => Promise<boolean>;
  analyzeMatch: (
    cvId: string,
    jobId: string,
    options?: { force?: boolean },
  ) => Promise<MatchAnalysis | null>;
  generateNarrativeReport: (cvId: string, jobId: string | null) => Promise<NarrativeReport | null>;
  setProcessing: (processing: boolean) => void;
  setError: (error: string | null) => void;
}

export const useLlmStore = create<LlmState>((set, get) => ({
  activeProvider: null,
  activeModel: "",
  configs: {},
  isConnected: false,
  isProcessing: false,
  isChecking: false,
  error: null,
  lastMatchAnalysis: null,
  lastMatchCached: false,
  lastMatchStale: null,
  lastNarrativeReport: null,
  lastTestResult: null,

  setActiveProvider: (provider) => set({ activeProvider: provider }),
  setActiveModel: (model) => set({ activeModel: model }),

  setConfig: (provider, config) =>
    set((state) => ({
      configs: { ...state.configs, [provider]: config },
    })),

  removeConfig: (provider) =>
    set((state) => {
      const configs = { ...state.configs };
      delete configs[provider];
      return { configs };
    }),

  setProvider: async (provider) => {
    set({ activeProvider: provider });
    await storageService.saveSetting("llm_active_provider", provider);
  },

  setModel: async (model) => {
    const { activeProvider } = get();
    set({ activeModel: model });
    await storageService.saveSetting("llm_active_model", model);
    if (activeProvider) {
      await storageService.saveSetting(`llm_model_${activeProvider}`, model);
    }
  },

  testConnection: async (provider) => {
    const targetProvider = provider ?? get().activeProvider;
    if (!targetProvider) {
      set({ lastTestResult: { success: false, latencyMs: 0, error: "No provider selected" } });
      return false;
    }

    set({ isChecking: true, error: null });
    const start = performance.now();
    try {
      const config = await getConfig(targetProvider);
      const success = await testLlmConnection(config);
      const latencyMs = Math.round(performance.now() - start);
      set({
        isChecking: false,
        isConnected: success,
        lastTestResult: { success, latencyMs },
      });
      return success;
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      set({
        isChecking: false,
        isConnected: false,
        lastTestResult: { success: false, latencyMs, error: String(err) },
        error: String(err),
      });
      return false;
    }
  },

  analyzeMatch: async (cvId, jobId, options) => {
    set({ isProcessing: true, error: null });
    try {
      const result = await getOrRunMatchAnalysis(cvId, jobId, { force: options?.force });
      set({
        lastMatchAnalysis: result.analysis,
        lastMatchCached: result.cached,
        lastMatchStale: result.stale,
        isProcessing: false,
      });
      return result.analysis;
    } catch (err) {
      set({ isProcessing: false, error: String(err) });
      return null;
    }
  },

  generateNarrativeReport: async (cvId, jobId) => {
    set({ isProcessing: true, error: null });
    try {
      const activeProvider = useSettingsStore.getState().llm.active_provider;
      if (!activeProvider) throw new Error("No LLM provider selected");

      const [cv, job, config] = await Promise.all([
        getCvById(cvId),
        jobId ? getJobById(jobId) : Promise.resolve(null),
        getConfig(activeProvider),
      ]);

      if (!cv) throw new Error("CV not found");

      const service = new LlmService(config);
      const report = await service.analyzeNarrative(cv.parsed_data, job ?? undefined);
      set({ lastNarrativeReport: report, isProcessing: false });
      return report;
    } catch (err) {
      set({ isProcessing: false, error: String(err) });
      return null;
    }
  },

  setProcessing: (isProcessing) => set({ isProcessing }),
  setError: (error) => set({ error }),
}));
