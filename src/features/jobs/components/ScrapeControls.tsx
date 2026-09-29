import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Radar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NoApiKeysError } from "@/services/ingest/run";
import { useIngestStore } from "@/stores/ingestStore";

function formatWhen(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(ts));
}

/**
 * Manual "search jobs" trigger: runs the in-app ingest pipeline over the enabled
 * sources (src/services/ingest/sources.ts) and writes straight to local SQLite.
 */
export function ScrapeControls() {
  const { t, i18n } = useTranslation("jobs");
  const { isScraping, progress, lastRun, runScrape, loadLastRun } = useIngestStore();

  useEffect(() => {
    void loadLastRun();
  }, [loadLastRun]);

  async function handleScrape() {
    try {
      const summary = await runScrape();
      if (!summary) return;
      if (summary.status === "failed") {
        toast.error(t("scrape.failed", { message: summary.note ?? "" }));
      } else if (summary.note) {
        toast.warning(
          t("scrape.finished_with_note", {
            found: summary.jobsFound,
            added: summary.jobsNew,
            message: summary.note,
          }),
        );
      } else {
        toast.success(
          t("scrape.finished", { found: summary.jobsFound, added: summary.jobsNew }),
        );
      }
    } catch (err) {
      if (err instanceof NoApiKeysError) {
        toast.error(t("scrape.no_keys"));
      } else {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(t("scrape.failed", { message }));
      }
    }
  }

  const lastRunLabel = lastRun
    ? t("scrape.last_run", { when: formatWhen(lastRun.started_at, i18n.language) })
    : t("scrape.never_run");

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground hidden md:inline">
            {lastRunLabel}
          </span>
        </TooltipTrigger>
        <TooltipContent>{lastRunLabel}</TooltipContent>
      </Tooltip>

      <Button
        size="sm"
        variant="outline"
        onClick={() => void handleScrape()}
        disabled={isScraping}
      >
        <Radar className={`h-3.5 w-3.5 mr-1.5 ${isScraping ? "animate-pulse" : ""}`} />
        {isScraping
          ? progress
            ? t("scrape.scraping_progress", { count: progress.jobsFound })
            : t("scrape.scraping")
          : t("scrape.run_scrape")}
      </Button>
    </div>
  );
}
