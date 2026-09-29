import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  ClipboardPaste,
  Info,
  Link2,
  Loader2,
  Mail,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagInput } from "@/features/cv/components/TagInput";
import { useLlmAvailability } from "@/features/llm/hooks/useLlmAvailability";
import {
  heuristicJobDraft,
  mergeJobDraft,
  normalizeSalary,
  type PastedJobDraft,
} from "@/lib/jobs/pasted-job";
import { createJobFromPastedText, extractPastedJobDraft } from "@/services/job-paste";
import {
  BrowserOnlySiteError,
  resolveCaptureFromUrl,
  saveCapturedJob,
  type ResolvedCapture,
} from "@/services/job-capture";
import { analyzeUrl } from "@/lib/job-capture/canonical";
import { useJobStore } from "@/stores/jobStore";
import type { EmploymentType, Job, SeniorityLevel } from "@/types";

export interface PasteJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * "select": after saving, close and hand the job to `onCreated` (job pickers).
   * "standalone": after saving, offer follow-up actions (tailor CV, cover letter, view).
   */
  mode: "select" | "standalone";
  onCreated?: (job: Job) => void;
}

/** Posts shorter than this get a (non-blocking) "paste the full post" warning. */
const MIN_RECOMMENDED_CHARS = 200;
const UNSPECIFIED = "unspecified";
const SENIORITY_LEVELS: SeniorityLevel[] = ["junior", "mid", "senior", "lead", "principal"];
const EMPLOYMENT_TYPES: EmploymentType[] = ["full_time", "contract", "part_time"];

type Step = "paste" | "extracting" | "review" | "done";

type ExtractionNote =
  | { kind: "from_url"; via: ResolvedCapture["via"] }
  | { kind: "llm_used" }
  | { kind: "no_llm" }
  | { kind: "cancelled" }
  | { kind: "llm_failed"; message: string | null };

interface ReviewForm {
  title: string;
  company: string;
  location: string;
  seniority: SeniorityLevel | "";
  employmentType: EmploymentType | "";
  salaryMin: string;
  salaryMax: string;
  currency: string;
  skills: string[];
  applyUrl: string;
  description: string;
}

function draftToForm(d: PastedJobDraft, sourceUrl: string): ReviewForm {
  return {
    title: d.title,
    company: d.company_name,
    location: d.location,
    seniority: d.seniority_level ?? "",
    employmentType: d.employment_type ?? "",
    salaryMin: d.salary_min != null ? String(d.salary_min) : "",
    salaryMax: d.salary_max != null ? String(d.salary_max) : "",
    currency: d.salary_currency ?? "",
    skills: [...d.skills_required],
    applyUrl: d.apply_url || sourceUrl.trim(),
    description: d.description,
  };
}

function parseAmount(value: string): number | null {
  const n = Number(value.trim());
  return value.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

function formToDraft(form: ReviewForm, base: PastedJobDraft, sourceUrl: string): PastedJobDraft {
  const salary = normalizeSalary(parseAmount(form.salaryMin), parseAmount(form.salaryMax), "year");
  return {
    ...base,
    title: form.title.trim(),
    company_name: form.company.trim(),
    location: form.location.trim(),
    seniority_level: form.seniority || null,
    employment_type: form.employmentType || null,
    skills_required: form.skills,
    salary_min: salary.min,
    salary_max: salary.max,
    salary_currency: form.currency.trim() || null,
    apply_url: form.applyUrl.trim(),
    source_url: sourceUrl.trim() || base.source_url,
    description: form.description.trim() || base.description,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Turns a job post pasted from any website into a real Job row (source "manual").
 * Flow: paste -> extract (optional LLM, cancellable) -> review/edit -> save.
 * The post is never dropped: without a provider, or when the LLM fails, the fields
 * are guessed from the text and the full text is kept as the description.
 */
export function PasteJobDialog({ open, onOpenChange, mode, onCreated }: PasteJobDialogProps) {
  // Set by the flow; blocks accidental outside-click closes that would lose the paste.
  const dirtyRef = useRef(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => {
          if (dirtyRef.current) e.preventDefault();
        }}
      >
        {/* Radix unmounts the content when closed, so the flow state resets on reopen. */}
        <PasteJobFlow
          mode={mode}
          onOpenChange={onOpenChange}
          onCreated={onCreated}
          dirtyRef={dirtyRef}
        />
      </DialogContent>
    </Dialog>
  );
}

interface PasteJobFlowProps {
  mode: PasteJobDialogProps["mode"];
  onOpenChange: (open: boolean) => void;
  onCreated?: (job: Job) => void;
  dirtyRef: RefObject<boolean>;
}

function PasteJobFlow({ mode, onOpenChange, onCreated, dirtyRef }: PasteJobFlowProps) {
  const { t } = useTranslation("jobs");
  const { showNoProviderPrompt } = useLlmAvailability();
  const ids = useId();
  const fieldId = (name: string) => `${ids}-${name}`;

  const [step, setStep] = useState<Step>("paste");
  const [text, setText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [baseDraft, setBaseDraft] = useState<PastedJobDraft | null>(null);
  const [form, setForm] = useState<ReviewForm | null>(null);
  const [note, setNote] = useState<ExtractionNote | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedJob, setSavedJob] = useState<Job | null>(null);
  /** Set when the job came from a link: saved under its canonical identity. */
  const [capture, setCapture] = useState<ResolvedCapture | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      dirtyRef.current = false;
    };
  }, [dirtyRef]);

  useEffect(() => {
    dirtyRef.current = step !== "done" && text.trim().length > 0;
  }, [dirtyRef, step, text]);

  const trimmedLength = text.trim().length;
  const isShort = trimmedLength > 0 && trimmedLength < MIN_RECOMMENDED_CHARS;

  const goToReview = useCallback(
    (draft: PastedJobDraft, extractionNote: ExtractionNote) => {
      setBaseDraft(draft);
      setForm(draftToForm(draft, sourceUrl));
      setNote(extractionNote);
      setStep("review");
    },
    [sourceUrl],
  );

  const heuristicsOnly = useCallback(
    (raw: string) => mergeJobDraft(heuristicJobDraft(raw), null),
    [],
  );

  const handleExtract = useCallback(async () => {
    const raw = text;
    if (!raw.trim()) return;
    if (showNoProviderPrompt) {
      goToReview(heuristicsOnly(raw), { kind: "no_llm" });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStep("extracting");
    try {
      const result = await extractPastedJobDraft(raw, { abortSignal: controller.signal });
      if (controller.signal.aborted || !mountedRef.current) return;
      goToReview(
        result.draft,
        result.usedLlm
          ? { kind: "llm_used" }
          : result.llmError
            ? { kind: "llm_failed", message: result.llmError }
            : { kind: "no_llm" },
      );
    } catch (err) {
      // Cancelled: handleCancelExtraction already moved on (or the dialog closed).
      if (controller.signal.aborted || !mountedRef.current) return;
      // Anything else: never drop the paste, fall back to heuristics.
      goToReview(heuristicsOnly(raw), { kind: "llm_failed", message: errorMessage(err) });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [text, showNoProviderPrompt, goToReview, heuristicsOnly]);

  const urlInfo = sourceUrl.trim() ? analyzeUrl(sourceUrl.trim()) : null;
  const canImportUrl = urlInfo !== null && /^https?:\/\//i.test(sourceUrl.trim());

  const handleImportUrl = useCallback(async () => {
    const url = sourceUrl.trim();
    if (!url) return;
    setUrlError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStep("extracting");
    try {
      const resolved = await resolveCaptureFromUrl(url, { abortSignal: controller.signal });
      if (controller.signal.aborted || !mountedRef.current) return;
      setCapture(resolved);
      setText((prev) => prev || resolved.draft.description);
      setBaseDraft(resolved.draft);
      setForm(draftToForm(resolved.draft, resolved.canonicalUrl));
      setNote(
        resolved.via === "text"
          ? resolved.llmError
            ? { kind: "llm_failed", message: resolved.llmError }
            : { kind: showNoProviderPrompt ? "no_llm" : "llm_used" }
          : { kind: "from_url", via: resolved.via },
      );
      setStep("review");
    } catch (err) {
      if (controller.signal.aborted || !mountedRef.current) return;
      setStep("paste");
      setUrlError(
        err instanceof BrowserOnlySiteError ? t("paste.url_browser_only") : t("paste.url_failed", { message: errorMessage(err) }),
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [sourceUrl, showNoProviderPrompt, t]);

  const handleCancelExtraction = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    goToReview(heuristicsOnly(text), { kind: "cancelled" });
  }, [goToReview, heuristicsOnly, text]);

  const updateForm = useCallback(<K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const handleSave = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (!form || !baseDraft || saving) return;
      setSaving(true);
      try {
        const draft = formToDraft(form, baseDraft, capture?.canonicalUrl ?? sourceUrl);
        const { job, wasExisting } = capture
          ? await saveCapturedJob({ ...capture, draft }, text).then((r) => ({ job: r.job, wasExisting: r.duplicate }))
          : await createJobFromPastedText(text, draft);
        const store = useJobStore.getState();
        void store.fetchJobs();
        void store.fetchAllJobs();
        toast.success(t(wasExisting ? "paste.already_saved" : "paste.saved", { title: job.title }));
        onCreated?.(job);
        if (mode === "select") {
          onOpenChange(false);
          return;
        }
        if (!mountedRef.current) return;
        setSavedJob(job);
        setStep("done");
      } catch (err) {
        toast.error(t("paste.save_failed", { message: errorMessage(err) }));
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [form, baseDraft, saving, text, sourceUrl, capture, t, onCreated, mode, onOpenChange],
  );

  const handlePasteAnother = useCallback(() => {
    setText("");
    setSourceUrl("");
    setBaseDraft(null);
    setForm(null);
    setNote(null);
    setSavedJob(null);
    setCapture(null);
    setUrlError(null);
    setStep("paste");
  }, []);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // -------------------------------------------------------------------------
  // (a) Paste
  // -------------------------------------------------------------------------
  if (step === "paste") {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5 text-amber-600" aria-hidden="true" />
            {t("paste.title")}
          </DialogTitle>
          <DialogDescription>{t("paste.description")}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            // A link alone is enough: import it instead of parsing text.
            if (trimmedLength === 0 && canImportUrl) void handleImportUrl();
            else void handleExtract();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={fieldId("text")}>{t("paste.text_label")}</Label>
            <Textarea
              id={fieldId("text")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void handleExtract();
                }
              }}
              placeholder={t("paste.placeholder")}
              className="min-h-[260px] max-h-[45vh] text-sm"
              aria-describedby={`${fieldId("text-count")} ${fieldId("text-warning")}`}
              autoFocus
            />
            <div className="flex items-start justify-between gap-3 text-xs">
              <p
                id={fieldId("text-warning")}
                className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400"
                aria-live="polite"
              >
                {isShort && (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden="true" />
                    {t("paste.short_warning")}
                  </>
                )}
              </p>
              <span id={fieldId("text-count")} className="shrink-0 text-muted-foreground">
                {t("paste.char_count", { count: trimmedLength })}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldId("source-url")}>{t("paste.url_label")}</Label>
            <div className="flex gap-2">
              <Input
                id={fieldId("source-url")}
                type="url"
                inputMode="url"
                value={sourceUrl}
                onChange={(e) => {
                  setSourceUrl(e.target.value);
                  setUrlError(null);
                }}
                placeholder={t("paste.url_placeholder")}
                aria-describedby={fieldId("url-help")}
                aria-invalid={urlError ? true : undefined}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!canImportUrl}
                onClick={() => void handleImportUrl()}
              >
                <Link2 className="h-4 w-4" aria-hidden="true" />
                {t("paste.import_url")}
              </Button>
            </div>
            <p id={fieldId("url-help")} className="text-xs text-muted-foreground" aria-live="polite">
              {urlError ? (
                <span className="text-destructive">{urlError}</span>
              ) : urlInfo && ["linkedin", "indeed", "google_jobs"].includes(urlInfo.site) ? (
                t("paste.url_browser_only")
              ) : (
                t("paste.url_help")
              )}
            </p>
          </div>

          {showNoProviderPrompt && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden="true" />
              {t("paste.no_provider_note")}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t("paste.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={trimmedLength === 0 && !canImportUrl}
              aria-keyshortcuts="Control+Enter"
              title={t("paste.extract_shortcut")}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("paste.extract")}
            </Button>
          </DialogFooter>
        </form>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // (b) Extracting
  // -------------------------------------------------------------------------
  if (step === "extracting") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("paste.title")}</DialogTitle>
          <DialogDescription>{t("paste.extracting_hint")}</DialogDescription>
        </DialogHeader>
        <div
          className="flex flex-col items-center justify-center gap-3 py-10"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm font-medium">{t("paste.extracting")}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancelExtraction} autoFocus>
            {t("paste.cancel")}
          </Button>
        </DialogFooter>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // (d) Done (standalone mode)
  // -------------------------------------------------------------------------
  if (step === "done" && savedJob) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            {t("paste.done_title")}
          </DialogTitle>
          <DialogDescription>
            {t("paste.done_description", { title: savedJob.title })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button asChild>
            <Link to="/generate/cv" search={{ job: savedJob.id }} onClick={close} autoFocus>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("paste.actions.tailor_cv")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/generate/cover-letter" search={{ job: savedJob.id }} onClick={close}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              {t("paste.actions.cover_letter")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/jobs/$jobId" params={{ jobId: savedJob.id }} onClick={close}>
              <Briefcase className="h-4 w-4" aria-hidden="true" />
              {t("paste.actions.view_job")}
            </Link>
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handlePasteAnother}>
            <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
            {t("paste.actions.paste_another")}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t("paste.actions.close")}
          </Button>
        </DialogFooter>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // (c) Review / edit
  // -------------------------------------------------------------------------
  if (!form) return null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("paste.review_title")}</DialogTitle>
        <DialogDescription>{t("paste.review_description")}</DialogDescription>
      </DialogHeader>

      {note && <ExtractionNoteAlert note={note} />}

      <form className="space-y-4" onSubmit={(e) => void handleSave(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={fieldId("title")}>{t("paste.fields.title")}</Label>
            <Input
              id={fieldId("title")}
              value={form.title}
              onChange={(e) => updateForm("title", e.target.value)}
              placeholder={t("paste.fields.title_placeholder")}
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldId("company")}>{t("paste.fields.company")}</Label>
            <Input
              id={fieldId("company")}
              value={form.company}
              onChange={(e) => updateForm("company", e.target.value)}
              placeholder={t("paste.fields.company_placeholder")}
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldId("location")}>{t("paste.fields.location")}</Label>
            <Input
              id={fieldId("location")}
              value={form.location}
              onChange={(e) => updateForm("location", e.target.value)}
              placeholder={t("paste.fields.location_placeholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldId("seniority")}>{t("paste.fields.seniority")}</Label>
            <Select
              value={form.seniority || UNSPECIFIED}
              onValueChange={(v) =>
                updateForm("seniority", v === UNSPECIFIED ? "" : (v as SeniorityLevel))
              }
            >
              <SelectTrigger id={fieldId("seniority")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSPECIFIED}>{t("paste.fields.not_specified")}</SelectItem>
                {SENIORITY_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {t(`seniority.${level}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldId("employment")}>{t("paste.fields.employment_type")}</Label>
            <Select
              value={form.employmentType || UNSPECIFIED}
              onValueChange={(v) =>
                updateForm("employmentType", v === UNSPECIFIED ? "" : (v as EmploymentType))
              }
            >
              <SelectTrigger id={fieldId("employment")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSPECIFIED}>{t("paste.fields.not_specified")}</SelectItem>
                {EMPLOYMENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`employment.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-[1fr_1fr_7rem]">
            <div className="space-y-2">
              <Label htmlFor={fieldId("salary-min")}>{t("paste.fields.salary_min")}</Label>
              <Input
                id={fieldId("salary-min")}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.salaryMin}
                onChange={(e) => updateForm("salaryMin", e.target.value)}
                aria-describedby={fieldId("salary-hint")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={fieldId("salary-max")}>{t("paste.fields.salary_max")}</Label>
              <Input
                id={fieldId("salary-max")}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.salaryMax}
                onChange={(e) => updateForm("salaryMax", e.target.value)}
                aria-describedby={fieldId("salary-hint")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={fieldId("currency")}>{t("paste.fields.salary_currency")}</Label>
              <Input
                id={fieldId("currency")}
                value={form.currency}
                onChange={(e) => updateForm("currency", e.target.value.toUpperCase())}
                placeholder="USD"
                maxLength={5}
                autoCapitalize="characters"
              />
            </div>
            <p id={fieldId("salary-hint")} className="text-xs text-muted-foreground sm:col-span-3 -mt-2">
              {t("paste.fields.salary_hint")}
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2" role="group" aria-labelledby={fieldId("skills-label")}>
            <Label id={fieldId("skills-label")}>{t("paste.fields.skills")}</Label>
            <TagInput
              value={form.skills}
              onChange={(skills) => updateForm("skills", skills)}
              placeholder={t("paste.fields.skills_placeholder")}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={fieldId("apply-url")}>{t("paste.fields.apply_url")}</Label>
            <Input
              id={fieldId("apply-url")}
              type="url"
              inputMode="url"
              value={form.applyUrl}
              onChange={(e) => updateForm("applyUrl", e.target.value)}
              placeholder={t("paste.fields.apply_url_placeholder")}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={fieldId("description")}>{t("paste.fields.description")}</Label>
            <Textarea
              id={fieldId("description")}
              value={form.description}
              onChange={(e) => updateForm("description", e.target.value)}
              className="min-h-[180px] max-h-[40vh] text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setStep("paste")} disabled={saving}>
            {t("paste.back")}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? t("paste.saving") : t("paste.save")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function ExtractionNoteAlert({ note }: { note: ExtractionNote }) {
  const { t } = useTranslation("jobs");

  if (note.kind === "from_url") {
    return (
      <Alert>
        <CheckCircle2 aria-hidden="true" />
        <AlertDescription>{t(`paste.from_url.${note.via}`)}</AlertDescription>
      </Alert>
    );
  }

  if (note.kind === "llm_used") {
    return (
      <Alert>
        <Sparkles aria-hidden="true" />
        <AlertDescription>{t("paste.llm_used")}</AlertDescription>
      </Alert>
    );
  }

  if (note.kind === "llm_failed") {
    return (
      <Alert className="border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300">
        <AlertTriangle aria-hidden="true" />
        <AlertDescription className="text-current">
          <p>{t("paste.llm_failed")}</p>
          {note.message && (
            <p className="text-xs opacity-80 break-words">
              {t("paste.llm_failed_detail", { message: note.message })}
            </p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <Info aria-hidden="true" />
      <AlertDescription>
        {note.kind === "cancelled" ? t("paste.cancelled_hint") : t("paste.no_llm_hint")}
      </AlertDescription>
    </Alert>
  );
}
