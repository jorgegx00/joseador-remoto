import { useState, useEffect, useCallback } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useParams, Link, useNavigate } from "@tanstack/react-router";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Star,
  Trash2,
  FileSearch,
  Pencil,
  Eye,
  FileText,
  FileCode,
  File,
  Sparkles,
  RefreshCw,
  Settings,
  AlertCircle,
  Loader2,
  Save,
} from "lucide-react";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { useCv } from "@/features/cv/hooks/useCv";
import { CvViewer } from "@/features/cv/components/CvViewer";
import { CvEditor } from "@/features/cv/components/CvEditor";
import { CvRefineDialog } from "@/features/cv/components/CvRefineDialog";
import { CvExportMenu } from "@/features/cv/components/CvExportMenu";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { ErrorState } from "@/components/common/ErrorState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { MatchScoreGauge } from "@/components/common/MatchScoreGauge";
import { useCvStore } from "@/stores/cvStore";
import { useLlmAvailability } from "@/features/llm/hooks/useLlmAvailability";
import {
  CvInUseError,
  getAtsReportsByCvId,
  getCvById,
  getGeneratedCvsWithJobByCvId,
  getJobById,
  getTailoredCvsByParent,
  type GeneratedCvWithJob,
} from "@/services/database";
import { saveTailoredCv } from "@/services/tailored-cv";
import { getActiveLlmConfig } from "@/services/llm-active";
import { cvExportMeta } from "@/services/file-export";
import {
  buildCvExportFileName,
  defaultTailoredCvName,
  hasParsedContent,
} from "@/lib/cv/cv-document";
import { useNarrativeAnalysis } from "@/features/llm/hooks/useNarrativeAnalysis";
import { NarrativeReport } from "@/features/llm/components/NarrativeReport";
import { toast } from "sonner";
import type { AtsReport } from "@/types/ats";
import type { CvRecord } from "@/types";
import type { GeneratedCv } from "@/types/llm";

/** Message the store surfaces when deleteCv is blocked by foreign keys. */
const CV_IN_USE_MESSAGE = new CvInUseError(null).message;

/** "Backend Engineer @ Acme" (company omitted when missing). */
function formatTarget(title: string, company: string | null | undefined): string {
  const c = (company ?? "").trim();
  return c ? `${title} @ ${c}` : title;
}

/** Keyword-coverage score as "72%", or "—" when it wasn't measured. */
function formatScore(score: number | null): string {
  return score == null ? "—" : `${Math.round(score)}%`;
}

function toGeneratedCv(gen: GeneratedCvWithJob): GeneratedCv {
  return {
    id: gen.id,
    cv_id: gen.cv_id,
    job_id: gen.job_id,
    content: gen.content,
    match_score_before: gen.match_score_before,
    match_score_after: gen.match_score_after,
    llm_provider: gen.llm_provider,
    llm_model: gen.llm_model,
    created_at: gen.created_at,
  };
}

interface Provenance {
  parent: CvRecord | null;
  jobExists: boolean;
}

export function CvDetailPage() {
  const { t, i18n } = useTranslation("cv");
  const { cvId } = useParams({ from: "/cv/$cvId" });
  const navigate = useNavigate();
  const { cv, isLoading, error, refetch } = useCv(cvId);
  const { deleteCv, setPrimary, fetchCvs } = useCvStore();

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRefineDialog, setShowRefineDialog] = useState(false);
  const [latestReport, setLatestReport] = useState<AtsReport | null>(null);
  const [latestReportJobTitle, setLatestReportJobTitle] = useState<string | null>(null);
  const [tailoredCvs, setTailoredCvs] = useState<CvRecord[]>([]);
  const [generations, setGenerations] = useState<GeneratedCvWithJob[]>([]);
  const [versionsNonce, setVersionsNonce] = useState(0);
  const [savingGenId, setSavingGenId] = useState<string | null>(null);
  const [provenance, setProvenance] = useState<Provenance | null>(null);

  const dateLocale = i18n.language.startsWith("es") ? es : enUS;
  const formatDate = (ts: number) =>
    format(new Date(ts), "MMM d, yyyy HH:mm", { locale: dateLocale });

  const { hasProvider: hasLlmProvider } = useLlmAvailability();
  const {
    report: narrativeReport,
    isLoading: isAnalyzingNarrative,
    error: narrativeError,
    runAnalysis: runNarrativeAnalysis,
  } = useNarrativeAnalysis();

  useEffect(() => {
    if (!cvId) return;
    let cancelled = false;
    setLatestReport(null);
    setLatestReportJobTitle(null);
    void (async () => {
      try {
        const reports = await getAtsReportsByCvId(cvId);
        const report = reports[0] ?? null;
        if (cancelled) return;
        setLatestReport(report);
        if (report?.job_id) {
          const job = await getJobById(report.job_id).catch(() => null);
          if (!cancelled) setLatestReportJobTitle(job?.title ?? null);
        }
      } catch (err) {
        console.error("[CvDetailPage] failed to load ATS reports:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cvId]);

  // Tailored CVs derived from this one + the generation history.
  useEffect(() => {
    if (!cvId) return;
    let cancelled = false;
    void Promise.all([getTailoredCvsByParent(cvId), getGeneratedCvsWithJobByCvId(cvId)])
      .then(([tailored, gens]) => {
        if (cancelled) return;
        setTailoredCvs(tailored);
        setGenerations(gens);
      })
      .catch((err) => console.error("[CvDetailPage] failed to load versions:", err));
    return () => {
      cancelled = true;
    };
  }, [cvId, versionsNonce]);

  // Provenance of a tailored CV: parent CV and target job may have been deleted.
  const isTailored = cv?.source === "tailored";
  const parentCvId = cv?.parent_cv_id ?? null;
  const targetJobId = cv?.target_job_id ?? null;
  useEffect(() => {
    if (!isTailored) {
      setProvenance(null);
      return;
    }
    let cancelled = false;
    setProvenance(null);
    void Promise.all([
      parentCvId ? getCvById(parentCvId).catch(() => null) : Promise.resolve(null),
      targetJobId ? getJobById(targetJobId).catch(() => null) : Promise.resolve(null),
    ]).then(([parent, job]) => {
      if (!cancelled) setProvenance({ parent, jobExists: !!job });
    });
    return () => {
      cancelled = true;
    };
  }, [isTailored, parentCvId, targetJobId]);

  const handleRunNarrative = useCallback(() => {
    void runNarrativeAnalysis(cvId, null);
  }, [cvId, runNarrativeAnalysis]);

  const handleSaveGeneration = useCallback(
    async (gen: GeneratedCvWithJob) => {
      if (!cv) return;
      setSavingGenId(gen.id);
      try {
        const prefix = t("tailored_name_prefix");
        const title = gen.job_title ?? "";
        const company = gen.company_name ?? "";
        const result = await saveTailoredCv({
          existingCvId: null,
          name: defaultTailoredCvName(prefix, title, company),
          markdown: gen.content,
          sourceCv: cv,
          job: { id: gen.job_id, title, company_name: company },
          // Re-upserting the (unchanged) history row links the new CV to it, so this
          // entry shows "Open CV" instead of offering to save a duplicate.
          generated: toGeneratedCv(gen),
          llm: await getActiveLlmConfig().catch(() => null),
          defaultNamePrefix: prefix,
        });
        setVersionsNonce((n) => n + 1);
        void fetchCvs();
        toast.success(t("generated.saved_as_cv"), {
          action: {
            label: t("generated.open_cv"),
            onClick: () =>
              void navigate({ to: "/cv/$cvId", params: { cvId: result.cvId } }),
          },
        });
      } catch (err) {
        console.error("[CvDetailPage] save as CV failed:", err);
        toast.error(
          t("generated.save_error", {
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      } finally {
        setSavingGenId(null);
      }
    },
    [cv, fetchCvs, navigate, t],
  );

  const handleParse = useCallback(async () => {
    await useCvStore.getState().parseCv(cvId);
    const err = useCvStore.getState().error;
    if (err) {
      toast.error(err);
      return;
    }
    toast.success(t("parse_success"));
    void refetch();
  }, [cvId, refetch, t]);

  const handleDelete = useCallback(async () => {
    useCvStore.getState().setError(null);
    await deleteCv(cvId);
    const err = useCvStore.getState().error;
    if (err) {
      toast.error(err === CV_IN_USE_MESSAGE ? t("in_use_error") : err);
      return;
    }
    toast.success(t("delete_success"));
    void navigate({ to: "/cv" });
  }, [cvId, deleteCv, navigate, t]);

  const handleSetPrimary = useCallback(async () => {
    await setPrimary(cvId);
    toast.success(t("primary_set_success"));
    void refetch();
  }, [cvId, setPrimary, refetch, t]);

  const handleEditSaved = useCallback(() => {
    setIsEditing(false);
    void refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <PageContainer>
        <div className="max-w-4xl">
          <LoadingSkeleton variant="detail-page" />
        </div>
      </PageContainer>
    );
  }

  if (error || !cv) {
    return (
      <PageContainer>
        <div className="max-w-4xl">
          <ErrorState
            error={error ?? t("common:errors.not_found")}
            onRetry={refetch}
          />
        </div>
      </PageContainer>
    );
  }

  const FileIcon =
    cv.file_type === "pdf" ? FileText : cv.file_type === "md" ? FileCode : File;
  const hasParsedData =
    cv.parsed_data &&
    (cv.parsed_data.full_name || cv.parsed_data.experience.length > 0);
  const isMarkdownCv = isTailored || cv.file_type === "md";
  const canExport = isTailored || hasParsedContent(cv);
  const exportFullName = cv.parsed_data?.full_name || cv.name;

  const renderTailoredBanner = () => {
    if (!isTailored || !provenance) return null;
    const { parent, jobExists } = provenance;
    const target = cv.target_job_title ? formatTarget(cv.target_job_title, cv.target_company) : "";
    const jobLabel = jobExists
      ? target
      : [target, t("job_removed")].filter(Boolean).join(" ");
    const linkClass = "font-medium text-foreground underline-offset-4 hover:underline";

    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span className="min-w-0">
              <Trans
                t={t}
                ns="cv"
                i18nKey="tailored_banner"
                values={{
                  parent: parent?.name ?? t("parent_removed"),
                  job: jobLabel,
                }}
                components={{
                  parent: parent ? (
                    <Link to="/cv/$cvId" params={{ cvId: parent.id }} className={linkClass} />
                  ) : (
                    <span className="font-medium" />
                  ),
                  job:
                    jobExists && targetJobId ? (
                      <Link to="/jobs/$jobId" params={{ jobId: targetJobId }} className={linkClass} />
                    ) : (
                      <span className="font-medium" />
                    ),
                }}
              />
            </span>
          </div>
          {parent && jobExists && targetJobId && (
            <Link to="/generate/cv" search={{ cv: parent.id, job: targetJobId }}>
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("retailor")}
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <PageContainer>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <Link to="/cv">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("common:actions.back")}
              </Button>
            </Link>
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-2xl font-bold tracking-tight truncate">{cv.name}</h2>
              {isTailored ? (
                <Badge variant="secondary" className="shrink-0">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {t("badge_tailored")}
                </Badge>
              ) : (
                <Badge variant="secondary" className="shrink-0">
                  <FileIcon className="h-3 w-3 mr-1" />
                  {t(`common:file_types.${cv.file_type}`, {
                    defaultValue: cv.file_type.toUpperCase(),
                  })}
                </Badge>
              )}
              {cv.is_primary && (
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500 shrink-0" />
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  {t("actions.view")}
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4 mr-2" />
                  {t("actions.edit_cv")}
                </>
              )}
            </Button>
            {hasLlmProvider && hasParsedData && cv.raw_text && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRefineDialog(true)}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {t("refine.button")}
              </Button>
            )}
            <Link to="/cv/$cvId/ats" params={{ cvId }}>
              <Button variant="outline" size="sm">
                <FileSearch className="h-4 w-4 mr-2" />
                {t("actions.run_ats")}
              </Button>
            </Link>
            <CvExportMenu cv={cv} disabled={!canExport} />
            {!cv.is_primary && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleSetPrimary()}
              >
                <Star className="h-4 w-4 mr-2" />
                {t("set_primary")}
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("common:actions.delete")}
            </Button>
          </div>
        </div>

        {/* Tailored provenance */}
        {renderTailoredBanner()}

        {/* Tabs */}
        <Tabs defaultValue="parsed">
          <TabsList>
            <TabsTrigger value="parsed">{t("tabs.parsed_data")}</TabsTrigger>
            <TabsTrigger value="raw">{t("tabs.raw_text")}</TabsTrigger>
            <TabsTrigger value="ats">{t("tabs.ats_analysis")}</TabsTrigger>
            <TabsTrigger value="llm">{t("tabs.llm_analysis")}</TabsTrigger>
            <TabsTrigger value="generated">{t("tabs.generated")}</TabsTrigger>
          </TabsList>

          {/* Parsed Data Tab */}
          <TabsContent value="parsed" className="mt-4">
            {isEditing ? (
              <CvEditor
                cvId={cvId}
                data={cv.parsed_data}
                onCancel={() => setIsEditing(false)}
                onSaved={handleEditSaved}
              />
            ) : hasParsedData ? (
              <CvViewer data={cv.parsed_data} />
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground mb-4">
                    {t("not_parsed_description")}
                  </p>
                  <Button onClick={() => void handleParse()}>
                    {isMarkdownCv ? t("parse_markdown") : t("parse")}
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Raw Text Tab */}
          <TabsContent value="raw" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("tabs.raw_text")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cv.raw_text ? (
                  <ScrollArea className="h-[500px] rounded-md border">
                    <div className="p-4">
                      <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
                        {cv.raw_text.split("\n").map((line, index) => (
                          <div
                            key={index}
                            className="flex hover:bg-muted/50 transition-colors"
                          >
                            <span className="inline-block w-12 text-right pr-4 text-muted-foreground select-none shrink-0 text-xs leading-relaxed">
                              {index + 1}
                            </span>
                            <span className="flex-1">{line || "\u00A0"}</span>
                          </div>
                        ))}
                      </pre>
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>{t("no_raw_text")}</p>
                    <p className="text-xs mt-1">
                      {t("no_raw_text_hint")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ATS Analysis Tab */}
          <TabsContent value="ats" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("ats.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {latestReport ? (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <MatchScoreGauge
                      score={latestReport.ats_score}
                      size="lg"
                      animated
                    />
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {latestReport.issues.length > 0 && (
                        <Badge variant="outline">
                          {t("ats.issues_found", {
                            count: latestReport.issues.length,
                          })}
                        </Badge>
                      )}
                      {latestReport.job_id && (
                        <Badge variant="secondary">
                          {t("ats.history_with_job", {
                            jobTitle: latestReportJobTitle ?? t("generated.job_removed"),
                          })}
                        </Badge>
                      )}
                    </div>
                    <Link to="/cv/$cvId/ats" params={{ cvId }}>
                      <Button>
                        <FileSearch className="h-4 w-4 mr-2" />
                        {t("actions.view_report")}
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileSearch className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground mb-4">
                      {t("ats.run_description")}
                    </p>
                    <Link to="/cv/$cvId/ats" params={{ cvId }}>
                      <Button>
                        <FileSearch className="h-4 w-4 mr-2" />
                        {t("actions.run_ats")}
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* LLM Analysis Tab */}
          <TabsContent value="llm" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  {t("llm.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!hasLlmProvider ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground mb-4">
                      {t("llm.no_provider")}
                    </p>
                    <Link to="/settings">
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        {t("llm.go_to_settings")}
                      </Button>
                    </Link>
                  </div>
                ) : isAnalyzingNarrative ? (
                  <div className="text-center py-8">
                    <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      {t("llm.analyzing")}
                    </p>
                  </div>
                ) : narrativeReport ? (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRunNarrative}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t("llm.rerun")}
                      </Button>
                    </div>
                    <NarrativeReport report={narrativeReport} />
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground mb-1">
                      {t("llm.description")}
                    </p>
                    <p className="text-xs text-muted-foreground mb-4">
                      {t("llm.description_hint")}
                    </p>
                    <Button onClick={handleRunNarrative}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      {t("llm.analyze")}
                    </Button>
                    {narrativeError && (
                      <p className="text-xs text-red-500 mt-3">
                        {narrativeError}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tailored Versions Tab */}
          <TabsContent value="generated" className="mt-4 space-y-4">
            {tailoredCvs.length === 0 && generations.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">
                    {t("generated_empty")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("generated_empty_hint")}
                  </p>
                  <Link to="/generate/cv" search={{ cv: cvId }}>
                    <Button className="mt-4">
                      <Sparkles className="h-4 w-4 mr-2" />
                      {t("generated_empty_cta")}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Tailored CVs saved from this one */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                    <CardTitle className="text-base">
                      {t("generated.tailored_title")}
                    </CardTitle>
                    <Link to="/generate/cv" search={{ cv: cvId }}>
                      <Button variant="outline" size="sm" className="h-8">
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        {t("generated_empty_cta")}
                      </Button>
                    </Link>
                  </CardHeader>
                  <CardContent>
                    {tailoredCvs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("generated.tailored_empty")}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {tailoredCvs.map((tc) => (
                          <div
                            key={tc.id}
                            className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3"
                          >
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="text-sm font-medium truncate">
                                  {tc.name}
                                </span>
                              </div>
                              {tc.target_job_title && (
                                <p className="text-xs text-muted-foreground truncate">
                                  → {formatTarget(tc.target_job_title, tc.target_company)}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {t("generated.updated", { date: formatDate(tc.updated_at) })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Link to="/cv/$cvId" params={{ cvId: tc.id }}>
                                <Button variant="outline" size="sm" className="h-8">
                                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                                  {t("generated.open")}
                                </Button>
                              </Link>
                              <CvExportMenu cv={tc} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Generation history */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {t("generated.history")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {generations.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("generated.history_empty")}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {generations.map((gen) => {
                          const linked = tailoredCvs.find(
                            (tc) => tc.generated_cv_id === gen.id,
                          );
                          const jobLabel = gen.job_title
                            ? formatTarget(gen.job_title, gen.company_name)
                            : t("generated.job_removed");
                          const before = gen.match_score_before;
                          const after = gen.match_score_after;
                          const delta =
                            before != null && after != null
                              ? Math.round(after - before)
                              : null;
                          const exportBaseName = buildCvExportFileName(
                            { fullName: exportFullName, company: gen.company_name },
                            "md",
                          ).replace(/\.md$/i, "");

                          return (
                            <div
                              key={gen.id}
                              className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3"
                            >
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-sm font-medium truncate">
                                    {jobLabel}
                                  </span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {gen.llm_provider}/{gen.llm_model}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                  <span>{formatDate(gen.created_at)}</span>
                                  <span>·</span>
                                  <span>
                                    {t("generated.scores", {
                                      before: formatScore(before),
                                      after: formatScore(after),
                                    })}
                                    {delta != null && delta > 0 && (
                                      <span className="text-emerald-600 dark:text-emerald-400 ml-1">
                                        (+{delta})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {linked ? (
                                  <Link to="/cv/$cvId" params={{ cvId: linked.id }}>
                                    <Button variant="outline" size="sm" className="h-8">
                                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                                      {t("generated.open_cv")}
                                    </Button>
                                  </Link>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    disabled={savingGenId !== null}
                                    onClick={() => void handleSaveGeneration(gen)}
                                  >
                                    {savingGenId === gen.id ? (
                                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                    ) : (
                                      <Save className="h-3.5 w-3.5 mr-1.5" />
                                    )}
                                    {t("generated.save_as_cv")}
                                  </Button>
                                )}
                                <CvExportMenu
                                  markdown={gen.content}
                                  fileName={exportBaseName}
                                  meta={cvExportMeta(
                                    exportFullName,
                                    gen.job_title,
                                    cv.parsed_data?.skills?.technical ?? [],
                                  )}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t("actions.delete_cv")}
        description={t("delete_confirm")}
        variant="destructive"
        onConfirm={() => void handleDelete()}
      />

      {/* Refine CV with AI dialog */}
      <CvRefineDialog
        open={showRefineDialog}
        onOpenChange={setShowRefineDialog}
        cvId={cvId}
        rawText={cv.raw_text}
        current={cv.parsed_data}
        onAccepted={() => {
          void refetch();
        }}
      />
    </PageContainer>
  );
}
