import { create } from "zustand";
import { getAllScrapeRuns } from "@/services/database";
import { getBudgetUsage } from "@/services/ingest/budget";
import { getIngestConfig } from "@/services/ingest/config";
import {
  runScrape as runIngestScrape,
  type IngestProgress,
  type IngestSummary,
} from "@/services/ingest/run";
import { notifyNewJobs } from "@/services/notifications";
import { adjudicateAmbiguousDrJobs } from "@/services/dr-adjudicate";
import { useJobStore } from "@/stores/jobStore";
import type { ScrapeRun } from "@/types";

export interface BudgetStatus {
  provider: "serpapi" | "apify-linkedin";
  dailyUsed: number;
  dailyCap: number;
  monthlyUsed: number;
  monthlyCap: number;
}

interface IngestState {
  isScraping: boolean;
  progress: IngestProgress | null;
  lastRun: ScrapeRun | null;
  budgets: BudgetStatus[];

  /**
   * Run a manual scrape. Resolves with the summary, or null when a scrape is
   * already in flight. Throws NoApiKeysError when no source is configured.
   */
  runScrape: () => Promise<IngestSummary | null>;
  loadLastRun: () => Promise<void>;
  loadBudgets: () => Promise<void>;
}

export const useIngestStore = create<IngestState>((set, get) => ({
  isScraping: false,
  progress: null,
  lastRun: null,
  budgets: [],

  runScrape: async () => {
    if (get().isScraping) return null;
    set({ isScraping: true, progress: null });
    try {
      const summary = await runIngestScrape((progress) => set({ progress }));
      await useJobStore.getState().fetchJobs();
      void useJobStore.getState().fetchAllJobs();
      if (summary.jobsNew > 0) {
        await notifyNewJobs(summary.jobsNew, "scrape");
      }
      // Resolve any newly-ingested "ambiguous" DR rows via the LLM (guarded: no-op
      // without a provider; bounded: only ambiguous rows are sent). Fire-and-forget
      // so a slow model never blocks the scrape UI — refresh the list when it lands.
      void adjudicateAmbiguousDrJobs()
        .then((r) => {
          if (r.ran && r.updated > 0) {
            void useJobStore.getState().fetchJobs();
          }
        })
        .catch((err) => console.error("[ingest] DR adjudication failed:", err));
      return summary;
    } finally {
      set({ isScraping: false, progress: null });
      void get().loadLastRun();
      void get().loadBudgets();
    }
  },

  loadLastRun: async () => {
    try {
      const runs = await getAllScrapeRuns();
      set({ lastRun: runs[0] ?? null });
    } catch {
      // non-fatal
    }
  },

  loadBudgets: async () => {
    try {
      const config = await getIngestConfig();
      const [serpapi, apify] = await Promise.all([
        getBudgetUsage("serpapi"),
        getBudgetUsage("apify-linkedin"),
      ]);
      set({
        budgets: [
          {
            provider: "serpapi",
            dailyUsed: serpapi.dailyUsed,
            dailyCap: config.serpapiDailyCap,
            monthlyUsed: serpapi.monthlyUsed,
            monthlyCap: config.serpapiMonthlyCap,
          },
          {
            provider: "apify-linkedin",
            dailyUsed: apify.dailyUsed,
            dailyCap: config.apifyDailyCap,
            monthlyUsed: apify.monthlyUsed,
            monthlyCap: config.apifyMonthlyCap,
          },
        ],
      });
    } catch {
      // non-fatal
    }
  },
}));
