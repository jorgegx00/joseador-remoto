import { useEffect, useState } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { router } from "@/router";
import { runMigrations } from "@/services/database";
import { backfillDrFlagsIfNeeded } from "@/services/dr-backfill";
import { adjudicateAmbiguousDrJobs } from "@/services/dr-adjudicate";
import { useJobStore } from "@/stores/jobStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useOllamaStore } from "@/stores/ollamaStore";
import i18n from "@/lib/i18n";

async function loadSettingsWithRetry(maxAttempts = 3): Promise<boolean> {
  console.warn("[App] loadSettingsWithRetry: starting");
  const { loadSettings } = useSettingsStore.getState();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.warn(`[App] loadSettingsWithRetry: attempt ${attempt}`);
    await loadSettings();
    if (useSettingsStore.getState().hydrated) {
      console.warn(`[App] loadSettingsWithRetry: hydrated on attempt ${attempt}`);
      return true;
    }
    console.warn(
      `[App] settings did not hydrate on attempt ${attempt}/${maxAttempts}; retrying`,
    );
    await new Promise((r) => setTimeout(r, 150 * attempt));
  }
  return false;
}

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      console.warn("[App] initialize: starting");
      try {
        // Run database migrations first
        await runMigrations();
        console.warn("[App] initialize: migrations complete");

        // Warm the company blacklist for the Settings editor. Job filtering reads
        // the blacklist straight from the DB at query time, so this is just for the UI.
        void useJobStore.getState().loadBlacklist();

        // Load saved settings (language, theme, LLM provider, etc.) and verify the
        // store actually hydrated — not just that the promise resolved.
        const hydrated = await loadSettingsWithRetry();
        if (!hydrated) {
          console.error("[App] settings store never hydrated; downstream LLM checks will misreport as unconfigured");
        }

        // Apply saved language
        const { app } = useSettingsStore.getState();
        if (app.language && app.language !== i18n.language) {
          await i18n.changeLanguage(app.language);
        }

        // Apply saved theme
        if (app.theme === "dark") {
          document.documentElement.classList.add("dark");
        } else if (app.theme === "light") {
          document.documentElement.classList.remove("dark");
        }
        // "system" theme is handled by next-themes or CSS prefers-color-scheme

        // Start a local Ollama server when it's the active provider and the user opted
        // in. Awaited (bounded to ~15 s by the Rust side) so the LLM calls below don't
        // race a booting server; failures only log.
        const { llm } = useSettingsStore.getState();
        if (llm.active_provider === "ollama" && llm.ollama.mode === "local" && llm.ollama.auto_start) {
          const started = await useOllamaStore.getState().startServer();
          console.info(`[App] Ollama auto-start: ${started ? "ready" : "failed"}`);
        }

        // DR/LATAM eligibility reconciliation. Fire-and-forget so it never blocks
        // first render. Two bounded steps: (1) a cheap keyword reclassification that
        // reruns once when the filter rules change, then (2) LLM adjudication of the
        // residual "ambiguous" rows (no-op when no LLM provider is configured).
        void (async () => {
          try {
            const kw = await backfillDrFlagsIfNeeded();
            if (kw.ran) {
              console.info(`[App] DR keyword backfill: updated ${kw.updated}/${kw.total} jobs`);
            }
            const adj = await adjudicateAmbiguousDrJobs();
            if (adj.ran && adj.updated > 0) {
              console.info(`[App] DR LLM adjudication: updated ${adj.updated}/${adj.processed} jobs`);
            }
            if ((kw.ran && kw.updated > 0) || (adj.ran && adj.updated > 0)) {
              void useJobStore.getState().fetchJobs();
            }
          } catch (err) {
            console.error("[App] DR reconciliation failed:", err);
          }
        })();
      } catch (error) {
        console.error("[App] Initialization failed:", error);
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void initialize();

    // Recover from any transient hydration failure: re-load when the window regains
    // focus, so the next time the user comes back the LLM check is correct.
    const onFocus = () => {
      if (!useSettingsStore.getState().hydrated) {
        void loadSettingsWithRetry(1);
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}

export default App;
