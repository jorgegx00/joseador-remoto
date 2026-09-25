import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  FileText,
  Briefcase,
  Sparkles,
  Copy,
  Download,
  RefreshCw,
  AlertCircle,
  Settings,
  Loader2,
  X,
  ClipboardPaste,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { PageContainer } from "@/components/layout/PageContainer";
import { JobPicker } from "@/features/cv/components/JobPicker";
import { PasteJobDialog } from "@/features/jobs/components/PasteJobDialog";
import { CvPreview } from "./CvPreview";
import { useCoverLetter } from "../hooks/useCoverLetter";
import { usePreselectedJob } from "../hooks/usePreselectedJob";
import { useCvStore } from "@/stores/cvStore";
import { useJobStore } from "@/stores/jobStore";
import { useLlmAvailability } from "../hooks/useLlmAvailability";
import type { Job } from "@/types";

export function CoverLetterPage() {
  const { t } = useTranslation("generation");
  const { t: tCommon } = useTranslation("common");

  const { cvs, fetchCvs } = useCvStore();
  const { jobs, fetchJobs } = useJobStore();
  const { hydrated, showNoProviderPrompt } = useLlmAvailability();
  const search = useSearch({ from: "/generate/cover-letter" });

  const [selectedCvId, setSelectedCvId] = useState<string>(search.cv ?? "");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [pasteJobOpen, setPasteJobOpen] = useState(false);

  // ?job= may point to a job hidden by the Jobs-page filters (or a pasted one).
  usePreselectedJob(search.job, jobs, selectedJob, setSelectedJob);

  const {
    streamedContent,
    isGenerating,
    error,
    elapsedSeconds,
    savedLetter,
    previousLetters,
    isLoadingHistory,
    generate,
    loadHistory,
    cancel,
    reset,
  } = useCoverLetter();

  const selectedCv = cvs.find((c) => c.id === selectedCvId) ?? null;

  // Fetch CVs and jobs on mount
  useEffect(() => {
    fetchCvs();
    fetchJobs();
  }, [fetchCvs, fetchJobs]);

  // Load history when CV+Job are selected
  useEffect(() => {
    if (selectedCvId && selectedJob) {
      loadHistory(selectedCvId, selectedJob.id);
    }
  }, [selectedCvId, selectedJob, loadHistory]);

  const handleGenerate = useCallback(async () => {
    if (!selectedCv || !selectedJob) return;
    await generate(selectedCv, selectedJob);
    toast.success(t("cover_letter.saved_success"));
  }, [selectedCv, selectedJob, generate, t]);

  const handleCopy = useCallback(async () => {
    const content = savedLetter?.content ?? streamedContent;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      toast.success(t("cover_letter.copied"));
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success(t("cover_letter.copied"));
    }
  }, [savedLetter, streamedContent, t]);

  const handleDownload = useCallback(() => {
    const content = savedLetter?.content ?? streamedContent;
    if (!content) return;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cover-letter-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [savedLetter, streamedContent]);

  const handleRegenerate = useCallback(() => {
    reset();
    if (selectedCv && selectedJob) {
      generate(selectedCv, selectedJob).then(() => {
        toast.success(t("cover_letter.saved_success"));
      });
    }
  }, [reset, selectedCv, selectedJob, generate, t]);

  if (!hydrated) {
    return (
      <PageContainer>
        <div className="max-w-2xl mx-auto mt-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tCommon("status.loading")}
        </div>
      </PageContainer>
    );
  }

  if (showNoProviderPrompt) {
    return (
      <PageContainer>
        <div className="max-w-2xl mx-auto mt-12">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t("cover_letter.no_llm_title")}</AlertTitle>
            <AlertDescription className="mt-2">
              {t("cover_letter.no_llm_description")}
              <div className="mt-3">
                <Link to="/settings">
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    {t("cover_letter.go_to_settings")}
                  </Button>
                </Link>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("cover_letter.page_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("cover_letter.page_description")}
          </p>
        </div>

        {/* Select CV */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                {t("cover_letter.select_cv")}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {cvs.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("cv.no_cvs_hint")}</p>
            ) : (
              <Select value={selectedCvId} onValueChange={setSelectedCvId}>
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue placeholder={t("cv.select_cv_placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {cvs.map((cv) => (
                    <SelectItem key={cv.id} value={cv.id}>
                      <div className="flex items-center gap-2">
                        <span>{cv.name}</span>
                        {cv.is_primary && (
                          <Badge variant="secondary" className="text-[10px]">
                            Primary
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {/* Select Job */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                {t("cover_letter.select_job")}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {selectedJob ? (
              <div className="flex flex-wrap items-center gap-3">
                <Card className="flex-1 min-w-[200px] bg-muted/30">
                  <CardContent className="p-3">
                    <p className="text-sm font-medium">{selectedJob.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedJob.company_name || selectedJob.company_id}
                      {selectedJob.location && ` - ${selectedJob.location}`}
                    </p>
                  </CardContent>
                </Card>
                <Button variant="outline" size="sm" onClick={() => setJobPickerOpen(true)}>
                  {t("cv.change_job")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPasteJobOpen(true)}>
                  <ClipboardPaste className="h-4 w-4 mr-2" aria-hidden="true" />
                  {t("cover_letter.paste_job")}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => setJobPickerOpen(true)}>
                    <Briefcase className="h-4 w-4 mr-2" aria-hidden="true" />
                    {t("cv.select_job_button")}
                  </Button>
                  <Button variant="outline" onClick={() => setPasteJobOpen(true)}>
                    <ClipboardPaste className="h-4 w-4 mr-2" aria-hidden="true" />
                    {t("cover_letter.paste_job")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("cover_letter.paste_job_hint")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Generate button */}
        {selectedCv && selectedJob && !isGenerating && !savedLetter && (
          <div className="flex justify-center">
            <Button size="lg" onClick={handleGenerate} className="px-8">
              <Sparkles className="h-5 w-5 mr-2" />
              {t("cover_letter.generate_button")}
            </Button>
          </div>
        )}

        {/* Generating state */}
        {isGenerating && (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    <span className="text-sm font-medium">
                      {t("cover_letter.generating")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {t("progress.elapsed", { seconds: elapsedSeconds })}
                    </span>
                    <Button variant="outline" size="sm" onClick={cancel}>
                      <X className="h-3.5 w-3.5 mr-1" />
                      {t("progress.cancel")}
                    </Button>
                  </div>
                </div>
                <Progress className="h-1.5" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Streaming content preview */}
        {isGenerating && streamedContent && (
          <CvPreview content={streamedContent} />
        )}

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{tCommon("status.error")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Result */}
        {savedLetter && !isGenerating && (
          <div className="space-y-4">
            <Separator />
            <h2 className="text-lg font-bold">{t("cover_letter.result_title")}</h2>

            <CvPreview content={savedLetter.content} />

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 justify-center">
              <Button onClick={handleCopy}>
                <Copy className="h-4 w-4 mr-2" />
                {t("cover_letter.copy_clipboard")}
              </Button>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                {t("cover_letter.download_txt")}
              </Button>
              <Button variant="secondary" onClick={handleRegenerate}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("cover_letter.regenerate")}
              </Button>
            </div>
          </div>
        )}

        {/* Previous cover letters */}
        {selectedCvId && selectedJob && (
          <div className="space-y-3">
            <h3 className="text-base font-semibold">{t("cover_letter.previous_title")}</h3>

            {isLoadingHistory ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                {tCommon("status.loading")}
              </div>
            ) : previousLetters.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("cover_letter.no_previous")}</p>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {previousLetters.map((letter) => (
                  <AccordionItem key={letter.id} value={letter.id}>
                    <AccordionTrigger className="text-sm hover:no-underline">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>
                          {selectedJob.title} -{" "}
                          {format(new Date(letter.created_at), "MMM d, yyyy HH:mm")}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {letter.llm_provider}/{letter.llm_model}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <Card className="bg-muted/20">
                        <CardContent className="p-4">
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">
                            {letter.content}
                          </p>
                        </CardContent>
                      </Card>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        )}
      </div>

      {/* Job Picker Dialog */}
      <JobPicker
        open={jobPickerOpen}
        onSelect={(job) => {
          setSelectedJob(job);
          reset();
        }}
        onOpenChange={setJobPickerOpen}
        onPasteNew={() => setPasteJobOpen(true)}
      />

      {/* Paste a job post: saved as a real job, then selected here */}
      <PasteJobDialog
        open={pasteJobOpen}
        onOpenChange={setPasteJobOpen}
        mode="select"
        onCreated={(job) => {
          setSelectedJob(job);
          reset();
        }}
      />
    </PageContainer>
  );
}
