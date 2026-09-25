import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Copy, Download, FileText } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getAllCompanies, getJobsForReport } from "@/services/database";
import { storageService } from "@/services/storage";
import { buildReport, type ReportResult } from "@/features/reports/build-report";

const SETTING_LAST_REPORT = "report_last_generated_at";

function formatWhen(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(ts));
}

function defaultFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `reporte-empleos-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.txt`;
}

/**
 * Weekly shareable report: plain-text Spanish summary of DR-friendly tech
 * jobs. By default only jobs synced since the last generated report are
 * included; copying or saving advances the marker.
 */
export function ReportsPage() {
  const { t, i18n } = useTranslation("reports");
  const [lastReportAt, setLastReportAt] = useState<number | null>(null);
  const [includeAll, setIncludeAll] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [report, setReport] = useState<ReportResult | null>(null);
  // Timestamp captured at generation time — becomes the new marker on share.
  const generatedAtRef = useRef<number | null>(null);

  useEffect(() => {
    void (async () => {
      const raw = await storageService.getSetting(SETTING_LAST_REPORT);
      const n = raw ? Number(raw) : NaN;
      setLastReportAt(Number.isFinite(n) ? n : null);
    })();
  }, []);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const since = includeAll ? null : lastReportAt;
      const now = Date.now();
      const [jobs, companies] = await Promise.all([
        getJobsForReport(since),
        getAllCompanies(),
      ]);
      const companiesById = new Map(companies.map((c) => [c.id, c]));
      const result = buildReport(jobs, companiesById, { now, since });
      generatedAtRef.current = now;
      setReport(result);
      if (result.included === 0) {
        toast.info(t("empty"));
      }
    } catch (err) {
      toast.error(t("generate_failed", { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setIsGenerating(false);
    }
  }, [includeAll, lastReportAt, t]);

  /** Advance the "last report" marker after the report has been shared. */
  const markReported = useCallback(async () => {
    const ts = generatedAtRef.current;
    if (ts === null) return;
    await storageService.saveSetting(SETTING_LAST_REPORT, String(ts));
    setLastReportAt(ts);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!report) return;
    await navigator.clipboard.writeText(report.text);
    toast.success(t("copied"));
    await markReported();
  }, [report, markReported, t]);

  const handleSave = useCallback(async () => {
    if (!report) return;
    try {
      const path = await invoke<string | null>("save_text_file", {
        defaultName: defaultFileName(generatedAtRef.current ?? Date.now()),
        content: report.text,
      });
      if (path === null) return; // user cancelled the dialog
      toast.success(t("saved", { path }));
      await markReported();
    } catch (err) {
      toast.error(t("save_failed", { message: err instanceof Error ? err.message : String(err) }));
    }
  }, [report, markReported, t]);

  const lastReportLabel =
    lastReportAt !== null
      ? t("last_report", { when: formatWhen(lastReportAt, i18n.language) })
      : t("no_previous_report");

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("generate_title")}</CardTitle>
            <CardDescription>{lastReportLabel}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch
                id="include-all"
                checked={includeAll}
                onCheckedChange={setIncludeAll}
              />
              <Label htmlFor="include-all" className="text-sm font-normal">
                {t("include_all")}
              </Label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void handleGenerate()} disabled={isGenerating}>
                <FileText className="h-4 w-4 mr-1.5" />
                {isGenerating ? t("generating") : t("generate")}
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleCopy()}
                disabled={!report || report.included === 0}
              >
                <Copy className="h-4 w-4 mr-1.5" />
                {t("copy")}
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleSave()}
                disabled={!report || report.included === 0}
              >
                <Download className="h-4 w-4 mr-1.5" />
                {t("save")}
              </Button>
            </div>

            {report && (
              <p className="text-xs text-muted-foreground">
                {t("included_count", { count: report.included })}
                {report.skippedNonTech > 0 &&
                  ` · ${t("skipped_non_tech", { count: report.skippedNonTech })}`}
              </p>
            )}
          </CardContent>
        </Card>

        {report && report.included > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("preview_title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs whitespace-pre-wrap font-mono bg-muted rounded-md p-4 max-h-[32rem] overflow-auto">
                {report.text}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
