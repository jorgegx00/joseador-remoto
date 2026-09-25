import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, Settings, Loader2, RotateCcw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageContainer } from "@/components/layout/PageContainer";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { JobPicker } from "@/features/cv/components/JobPicker";
import { CvExportMenu } from "@/features/cv/components/CvExportMenu";
import { PasteJobDialog } from "@/features/jobs/components/PasteJobDialog";
import { GenerationProgress } from "./GenerationProgress";
import { CvDiffView } from "./CvDiffView";
import { CvPreview } from "./CvPreview";
import { CvChatPanel, type ChatQuickAction } from "./CvChatPanel";
import { SaveTailoredCvDialog, type SaveExportChoice } from "./SaveTailoredCvDialog";
import { SetupCard } from "./cv-optimize/SetupCard";
import { AnalysisCard } from "./cv-optimize/AnalysisCard";
import { ReviewToolbar } from "./cv-optimize/ReviewToolbar";
import { ClaimsPanel } from "./cv-optimize/ClaimsPanel";
import { FullMarkdownEditor } from "./cv-optimize/FullMarkdownEditor";
import { SaveChecklistDialog } from "./cv-optimize/SaveChecklistDialog";
import { useReviewInsights } from "./cv-optimize/useReviewInsights";
import { useLlmAvailability } from "../hooks/useLlmAvailability";
import { usePreselectedJob } from "../hooks/usePreselectedJob";
import { useCvStore } from "@/stores/cvStore";
import { useJobStore } from "@/stores/jobStore";
import {
  useCvOptimizationStore,
  hasUnsavedChanges,
  sessionKey,
  type OptimizationStatus,
} from "@/stores/cvOptimizationStore";
import { pickDefaultCv, defaultTailoredCvName, buildCvExportFileName } from "@/lib/cv/cv-document";
import { exportMarkdownToFile, cvExportMeta } from "@/services/file-export";
import { getJobById } from "@/services/database";
import type { CvRecord, Job } from "@/types";

type PendingSwitch = { cv: CvRecord; job: Job } | null;

function errorMessageKey(status: Extract<OptimizationStatus, { kind: "error" }>): string {
  if (status.code === "empty_output" && status.message === "reasoning_budget") return "errors.empty_output_reasoning";
  return `errors.${status.code}`;
}

export function CvGenerationPage() {
  const { t } = useTranslation("generation");
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const search = useSearch({ from: "/generate/cv" });

  const cvs = useCvStore((s) => s.cvs);
  const fetchCvs = useCvStore((s) => s.fetchCvs);
  const jobs = useJobStore((s) => s.jobs);
  const fetchJobs = useJobStore((s) => s.fetchJobs);
  const { hydrated, showNoProviderPrompt } = useLlmAvailability();

  const session = useCvOptimizationStore((s) => s.session);
  const ctx = useCvOptimizationStore((s) => s.ctx);
  const status = useCvOptimizationStore((s) => s.status);
  const streamText = useCvOptimizationStore((s) => s.streamText);
  const analysis = useCvOptimizationStore((s) => s.analysis);
  const analysisCached = useCvOptimizationStore((s) => s.analysisCached);
  const analysisStale = useCvOptimizationStore((s) => s.analysisStale);
  const isLoadingAnalysis = useCvOptimizationStore((s) => s.isLoadingAnalysis);
  const isSaving = useCvOptimizationStore((s) => s.isSaving);
  const savedCvIds = useCvOptimizationStore((s) => s.savedCvIds);
  const savedHashes = useCvOptimizationStore((s) => s.savedHashes);
  const actions = useCvOptimizationStore.getState;

  // ---- Selection -----------------------------------------------------------
  const [selectedCvId, setSelectedCvId] = useState<string>(search.cv ?? session?.cvId ?? "");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch>(null);

  usePreselectedJob(search.job ?? (search.cv ? undefined : session?.jobId), jobs, selectedJob, setSelectedJob);

  useEffect(() => {
    void fetchCvs();
    void fetchJobs();
  }, [fetchCvs, fetchJobs]);

  // Effective CV: explicit choice (?cv, the resumed session, the select) → primary → newest upload.
  const fallbackCvId = useMemo(
    () => (pickDefaultCv(cvs.filter((c) => c.source !== "tailored")) ?? cvs[0])?.id ?? "",
    [cvs],
  );
  const effectiveCvId = selectedCvId || fallbackCvId;
  const selectedCv = cvs.find((c) => c.id === effectiveCvId) ?? null;

  // Start/resume the session once both are known. Switching away from an unsaved review asks first.
  useEffect(() => {
    if (!selectedCv || !selectedJob) return;
    const key = sessionKey(selectedCv.id, selectedJob.id);
    const state = useCvOptimizationStore.getState();
    if (state.session?.key === key) {
      if (state.ctx?.cv !== selectedCv || state.ctx?.job !== selectedJob) {
        state.startSession(selectedCv, selectedJob);
      }
      return;
    }
    if (state.session?.review && hasUnsavedChanges(state)) {
      // Selection can change from the URL/preselect, not only from user events, so the
      // confirmation has to be raised here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingSwitch({ cv: selectedCv, job: selectedJob });
      return;
    }
    state.startSession(selectedCv, selectedJob);
  }, [selectedCv, selectedJob]);

  // Keep the URL in sync so the page is shareable/reloadable — but only once the session
  // matches the current selection, otherwise an incoming ?cv/?job would be overwritten by
  // the previous session before it resolves.
  const selectionKey = selectedCv && selectedJob ? sessionKey(selectedCv.id, selectedJob.id) : null;
  useEffect(() => {
    if (!session || session.key !== selectionKey) return;
    if (search.cv === session.cvId && search.job === session.jobId) return;
    void navigate({ to: "/generate/cv", search: { cv: session.cvId, job: session.jobId }, replace: true });
  }, [session, selectionKey, navigate, search.cv, search.job]);

  // Load the cached analysis for a fresh context.
  useEffect(() => {
    if (ctx && !analysis) void actions().loadCachedAnalysis();
  }, [ctx, analysis, actions]);

  const cancelSwitch = () => {
    const { session: s, ctx: current } = useCvOptimizationStore.getState();
    const pending = pendingSwitch;
    setPendingSwitch(null);
    if (!s) return;
    // The kept session is unrecoverable (its CV or job was deleted) → proceed with the switch.
    const proceed = () => {
      if (pending) actions().startSession(pending.cv, pending.job);
    };
    if (!cvs.some((c) => c.id === s.cvId)) {
      proceed();
      return;
    }
    setSelectedCvId(s.cvId);
    // Restore the job of the kept session (it may not be loaded yet after a restart).
    if (current?.job.id === s.jobId) {
      setSelectedJob(current.job);
    } else {
      void getJobById(s.jobId).then((job) => {
        if (job) setSelectedJob(job);
        else proceed();
      });
    }
  };

  const handleJobSelected = useCallback((job: Job) => {
    setSelectedJob((current) => (current?.id === job.id ? current : job));
  }, []);

  // ---- Review state ---------------------------------------------------------
  const review = session?.review ?? null;
  const rows = review?.present.rows ?? [];
  const insights = useReviewInsights(session, ctx?.job ?? null, ctx?.cv ?? null, analysis);

  const isGenerating = status.kind === "generating";
  const isRefining = status.kind === "refining";
  const isAnalyzing = status.kind === "analyzing";
  const busy = isGenerating || isRefining || isAnalyzing;

  const [tab, setTab] = useState<"review" | "preview" | "markdown">("review");
  // The row being edited, scoped to the proposal it belongs to: a regenerate, a session
  // switch or a row disappearing closes the editor instead of leaving the page disabled.
  const [editing, setEditing] = useState<{ id: string; scope: string } | null>(null);
  const editScope = `${session?.key ?? ""}|${session?.generatedId ?? ""}`;
  const editingId =
    editing && editing.scope === editScope && rows.some((r) => r.id === editing.id) ? editing.id : null;
  const setEditingId = useCallback(
    (id: string | null) => setEditing(id ? { id, scope: editScope } : null),
    [editScope],
  );
  const [markdownDirty, setMarkdownDirty] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const flaggedCursor = useRef(0);

  // Ignore a remembered tailored CV that has since been deleted from the list.
  const rememberedCvId = session ? savedCvIds[session.key] ?? null : null;
  const savedCvId = rememberedCvId && cvs.some((c) => c.id === rememberedCvId) ? rememberedCvId : null;
  const unsaved = hasUnsavedChanges({ session, savedHashes });
  const saveState: "new" | "update" | "saved" = !savedCvId ? "new" : unsaved ? "update" : "saved";

  // Undo / redo shortcuts (outside text fields).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      if (busy) return;
      e.preventDefault();
      if (e.shiftKey) actions().redo();
      else actions().undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, actions]);

  const goToNextFlagged = () => {
    if (!insights || insights.flaggedRowIds.length === 0) return;
    setTab("review");
    const id = insights.flaggedRowIds[flaggedCursor.current % insights.flaggedRowIds.length];
    flaggedCursor.current += 1;
    setFocusedId(id);
    requestAnimationFrame(() => {
      document.querySelector(`[data-row-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    window.setTimeout(() => setFocusedId((cur) => (cur === id ? null : cur)), 2500);
  };

  // ---- Generate / regenerate --------------------------------------------------
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const handleGenerate = () => {
    const hasEdits = rows.some((r) => r.status === "edited" || r.status === "original");
    if (review && hasEdits && unsaved) {
      setConfirmRegenerate(true);
      return;
    }
    void actions().generate();
  };

  // ---- Chat --------------------------------------------------------------------
  const sendChat = useCallback(async (message: string) => actions().refine(message), [actions]);
  const quickActions: ChatQuickAction[] = useMemo(() => {
    const list: ChatQuickAction[] = [
      { label: t("chat.quick.shorter"), message: t("chat.quick.shorter_msg") },
      { label: t("chat.quick.stronger"), message: t("chat.quick.stronger_msg") },
      { label: t("chat.quick.keywords"), message: t("chat.quick.keywords_msg") },
    ];
    if (insights && insights.unsupportedFigures.length > 0) {
      list.push({
        label: t("chat.quick.remove_figures"),
        message: t("chat.tmpl_remove_figures", { list: insights.unsupportedFigures.join(", ") }),
      });
    }
    return list;
  }, [insights, t]);

  // ---- Save ----------------------------------------------------------------------
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const handleSaveClick = () => {
    if (!insights) return;
    if (
      insights.unsupportedFigures.length > 0 ||
      insights.unacknowledgedSkills.length > 0 ||
      session?.truncated
    ) {
      setChecklistOpen(true);
      return;
    }
    setSaveOpen(true);
  };

  const job = ctx?.job ?? null;
  const cv = ctx?.cv ?? null;
  const fullName = cv?.parsed_data.full_name || cv?.name || "";
  const defaultName = useMemo(() => {
    if (!job) return "";
    const existing = savedCvId ? cvs.find((c) => c.id === savedCvId)?.name : undefined;
    return existing ?? defaultTailoredCvName(t("save.name_prefix"), job.title, job.company_name);
  }, [job, savedCvId, cvs, t]);

  const exportFinal = async (format: Exclude<SaveExportChoice, "none">) => {
    if (!insights || !job) return;
    try {
      const path = await exportMarkdownToFile(insights.finalMd, format, {
        fileName: buildCvExportFileName({ fullName, company: job.company_name }, format),
        meta: cvExportMeta(fullName, job.title, cv?.parsed_data.skills.technical ?? []),
      });
      if (path) toast.success(tCommon("export.saved_to", { path }));
      else toast.info(t("save.export_cancelled_kept"));
    } catch (err) {
      toast.error(tCommon("export.failed", { error: err instanceof Error ? err.message : String(err) }));
    }
  };

  const handleSaveConfirm = async (opts: { name: string; format: SaveExportChoice; asNew: boolean }) => {
    if (!insights) return;
    try {
      const result = await actions().save({
        name: opts.name,
        asNew: opts.asNew,
        scoreBefore: insights.coverageOriginal,
        scoreAfter: insights.coverageFinal,
        defaultNamePrefix: t("save.name_prefix"),
      });
      if (!result) return;
      setSaveOpen(false);
      toast.success(result.created ? t("save.saved") : t("save.updated"), {
        action: {
          label: t("save.open_cv"),
          onClick: () => void navigate({ to: "/cv/$cvId", params: { cvId: result.cvId } }),
        },
      });
      if (result.warnings.length > 0) console.info("[CvGenerationPage] parse warnings:", result.warnings);
      if (opts.format !== "none") await exportFinal(opts.format);
    } catch (err) {
      console.error("[CvGenerationPage] save failed:", err);
      toast.error(t("save.error", { error: err instanceof Error ? err.message : String(err) }));
    }
  };

  // ---- Render --------------------------------------------------------------------------
  if (!hydrated) {
    return (
      <PageContainer>
        <div className="mx-auto mt-12 flex max-w-2xl items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tCommon("status.loading")}
        </div>
      </PageContainer>
    );
  }

  if (showNoProviderPrompt) {
    return (
      <PageContainer>
        <div className="mx-auto mt-12 max-w-2xl">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t("cv.no_llm_title")}</AlertTitle>
            <AlertDescription className="mt-2">
              {t("cv.no_llm_description")}
              <div className="mt-3">
                <Link to="/settings">
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    {t("cv.go_to_settings")}
                  </Button>
                </Link>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </PageContainer>
    );
  }

  const sessionMatchesSelection =
    session && selectedCv && selectedJob && session.key === sessionKey(selectedCv.id, selectedJob.id);
  const showWorkspace = sessionMatchesSelection && review && !isGenerating;

  return (
    <PageContainer>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("cv.page_title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("cv.page_description")}</p>
        </div>

        <SetupCard
          cvs={cvs}
          selectedCvId={effectiveCvId}
          onSelectCv={setSelectedCvId}
          job={selectedJob}
          onPickJob={() => setJobPickerOpen(true)}
          onPasteJob={() => setPasteOpen(true)}
          outputLanguage={sessionMatchesSelection ? session.outputLanguage : null}
          languageOverridden={Boolean(session?.languageOverridden)}
          onLanguageChange={(lang) => actions().setOutputLanguage(lang)}
          disabled={busy || editingId !== null}
        />

        {sessionMatchesSelection && session.interrupted && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("session.interrupted")}</AlertDescription>
          </Alert>
        )}

        {sessionMatchesSelection && (
          <AnalysisCard
            analysis={analysis}
            cached={analysisCached}
            stale={analysisStale}
            isAnalyzing={isAnalyzing}
            isLoading={isLoadingAnalysis}
            onReanalyze={() => void actions().runAnalysis(true)}
            skillCandidates={session.skillCandidates}
            onToggleSkill={(skill) => actions().toggleSkill(skill)}
            hasReview={Boolean(review)}
            disabled={busy || editingId !== null}
            onGenerate={handleGenerate}
          />
        )}

        {status.kind === "analyzing" && !review && (
          <GenerationProgress
            phase="analyzing"
            chars={0}
            section={null}
            expectedChars={session?.originalMd.length ?? 2000}
            startedAt={status.startedAt}
            onCancel={() => actions().cancel()}
          />
        )}

        {status.kind === "generating" && (
          <div className="space-y-4">
            <GenerationProgress
              phase={status.phase}
              chars={status.chars}
              section={status.section}
              expectedChars={session?.originalMd.length ?? 2000}
              startedAt={status.startedAt}
              onCancel={() => actions().cancel()}
            />
            {streamText && <CvPreview content={streamText} />}
          </div>
        )}

        {status.kind === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t(`errors.title_${status.action}`)}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{t(errorMessageKey(status), { defaultValue: t("errors.unknown") })}</p>
              {status.message && status.message !== "reasoning_budget" && status.message !== "no_text" && (
                <p className="break-words text-xs opacity-80">{status.message}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {status.canRetry && (
                  <Button size="sm" variant="outline" onClick={() => actions().retry()}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    {t("errors.retry")}
                  </Button>
                )}
                {status.code === "no_provider" || status.code === "auth" || status.code === "model_not_found" ? (
                  <Link to="/settings">
                    <Button size="sm" variant="outline">
                      <Settings className="h-3.5 w-3.5 mr-1.5" />
                      {t("cv.go_to_settings")}
                    </Button>
                  </Link>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => actions().dismissError()}>
                  {review ? t("errors.back_to_review") : t("errors.dismiss")}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {showWorkspace && insights && (
          <div className="space-y-4">
            {session.truncated && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{t("review.banner_truncated")}</AlertDescription>
              </Alert>
            )}

            <ReviewToolbar
              coverageBefore={insights.coverageOriginal}
              coverageAfter={insights.coverageFinal}
              reviewed={insights.progress.reviewed}
              changed={insights.progress.changed}
              flaggedCount={insights.flaggedRowIds.length}
              canUndo={review.past.length > 0}
              canRedo={review.future.length > 0}
              disabled={busy || editingId !== null}
              isSaving={isSaving}
              saveState={saveState}
              onUndo={() => actions().undo()}
              onRedo={() => actions().redo()}
              onNextFlagged={goToNextFlagged}
              onRevertAll={() => actions().dispatchReview({ type: "revertAll" })}
              onRestoreAllAi={() => actions().dispatchReview({ type: "restoreAllAi" })}
              onSave={handleSaveClick}
              extra={
                <CvExportMenu
                  markdown={insights.finalMd}
                  fileName={buildCvExportFileName({ fullName, company: job?.company_name }, "pdf")}
                  meta={cvExportMeta(fullName, job?.title, cv?.parsed_data.skills.technical ?? [])}
                  disabled={busy}
                  variant="outline"
                />
              }
            />

            {savedCvId && job && (
              <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <Link to="/cv/$cvId" params={{ cvId: savedCvId }} className="inline-flex items-center gap-1 underline">
                  <ExternalLink className="h-3 w-3" />
                  {t("save.open_saved_cv")}
                </Link>
                <Link
                  to="/cv/$cvId/match/$jobId"
                  params={{ cvId: savedCvId, jobId: job.id }}
                  className="inline-flex items-center gap-1 underline"
                >
                  {t("score.measure_real_match")}
                </Link>
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="min-w-0 lg:col-span-2">
                <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                  <TabsList>
                    <TabsTrigger value="review">{t("review.tab_review")}</TabsTrigger>
                    <TabsTrigger value="preview">{t("review.tab_preview")}</TabsTrigger>
                    <TabsTrigger value="markdown">{t("review.tab_markdown")}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="review" className="mt-4">
                    <CvDiffView
                      rows={rows}
                      perRow={insights.perRow}
                      translated={insights.translated}
                      disabled={busy}
                      editingId={editingId}
                      onEditingChange={setEditingId}
                      onAction={(action) => actions().dispatchReview(action)}
                      focusedId={focusedId}
                    />
                  </TabsContent>
                  <TabsContent value="preview" className="mt-4">
                    <CvPreview content={insights.finalMd} />
                  </TabsContent>
                  {/* Kept mounted so an unapplied markdown draft survives tab switches. */}
                  <TabsContent value="markdown" forceMount className="mt-4 data-[state=inactive]:hidden">
                    <FullMarkdownEditor
                      value={insights.finalMd}
                      disabled={busy}
                      onDirtyChange={setMarkdownDirty}
                      onApply={(md) => actions().dispatchReview({ type: "applyFullMarkdown", md })}
                    />
                  </TabsContent>
                </Tabs>
              </div>

              <div className="space-y-4">
                <ClaimsPanel
                  addedSkills={insights.addedSkills}
                  acknowledgedSkills={session.acknowledgedClaims}
                  unsupportedFigures={insights.unsupportedFigures}
                  newTech={insights.newTech}
                  disabled={busy || editingId !== null || markdownDirty}
                  onAcknowledge={(skill) => actions().acknowledgeClaim(skill)}
                  onAllowFigure={(fig) => actions().allowFigure(fig)}
                  onFixWithAi={(instruction) => void sendChat(instruction)}
                />
                <CvChatPanel
                  history={session.chat}
                  isRefining={isRefining}
                  error={null}
                  onSend={sendChat}
                  onCancel={() => actions().cancel()}
                  quickActions={quickActions}
                  streamingStatus={
                    status.kind === "refining" && status.sections.length > 0
                      ? t("chat.updating", { sections: status.sections.join(", ") })
                      : null
                  }
                  disabled={editingId !== null || markdownDirty || isGenerating}
                  disabledReason={editingId !== null || markdownDirty ? t("chat.finish_editing_first") : null}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <JobPicker
        open={jobPickerOpen}
        onOpenChange={setJobPickerOpen}
        onSelect={handleJobSelected}
        onPasteNew={() => {
          setJobPickerOpen(false);
          setPasteOpen(true);
        }}
      />

      <PasteJobDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        mode="select"
        onCreated={(job) => {
          setPasteOpen(false);
          handleJobSelected(job);
        }}
      />

      <ConfirmDialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open) cancelSwitch();
        }}
        title={t("setup.switch_confirm_title")}
        description={t("setup.switch_confirm_description")}
        confirmLabel={t("setup.switch_confirm_action")}
        variant="destructive"
        onConfirm={() => {
          const next = pendingSwitch;
          setPendingSwitch(null);
          if (next) actions().startSession(next.cv, next.job);
        }}
      />

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title={t("regenerate_confirm.title")}
        description={t("regenerate_confirm.description")}
        confirmLabel={t("regenerate_confirm.action")}
        onConfirm={() => void actions().generate()}
      />

      {insights && (
        <SaveChecklistDialog
          open={checklistOpen}
          onOpenChange={setChecklistOpen}
          unsupportedFigures={insights.unsupportedFigures}
          unacknowledgedSkills={insights.unacknowledgedSkills}
          truncated={Boolean(session?.truncated)}
          onReview={() => {
            setChecklistOpen(false);
            goToNextFlagged();
          }}
          onSaveAnyway={() => {
            setChecklistOpen(false);
            setSaveOpen(true);
          }}
        />
      )}

      <SaveTailoredCvDialog
        key={saveOpen ? "save-open" : "save-closed"}
        open={saveOpen}
        onOpenChange={setSaveOpen}
        defaultName={defaultName}
        isUpdate={Boolean(savedCvId)}
        isSaving={isSaving}
        onConfirm={(opts) => void handleSaveConfirm(opts)}
      />
    </PageContainer>
  );
}
