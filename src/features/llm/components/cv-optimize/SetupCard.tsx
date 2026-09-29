import { useTranslation } from "react-i18next";
import { FileText, Briefcase, ClipboardPaste, Languages } from "lucide-react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CvOutputLanguage } from "@/lib/llm/cv-optimization-prompts";
import type { CvRecord, Job } from "@/types";

interface SetupCardProps {
  cvs: CvRecord[];
  selectedCvId: string;
  onSelectCv: (id: string) => void;
  job: Job | null;
  onPickJob: () => void;
  onPasteJob: () => void;
  outputLanguage: CvOutputLanguage | null;
  languageOverridden: boolean;
  onLanguageChange: (lang: CvOutputLanguage) => void;
  disabled: boolean;
}

/** Step 1-2: source CV, target job (pick from list or paste any job post), output language. */
export function SetupCard({
  cvs,
  selectedCvId,
  onSelectCv,
  job,
  onPickJob,
  onPasteJob,
  outputLanguage,
  languageOverridden,
  onLanguageChange,
  disabled,
}: SetupCardProps) {
  const { t } = useTranslation("generation");

  return (
    <Card>
      <CardContent className="grid gap-6 p-6 md:grid-cols-2">
        {/* CV */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">{t("cv.step_select_cv")}</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">{t("cv.step_select_cv_hint")}</p>
          {cvs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("cv.no_cvs_hint")}</p>
          ) : (
            <Select value={selectedCvId} onValueChange={onSelectCv} disabled={disabled}>
              <SelectTrigger className="w-full" aria-label={t("cv.step_select_cv")}>
                <SelectValue placeholder={t("cv.select_cv_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {cvs.map((cv) => (
                  <SelectItem key={cv.id} value={cv.id}>
                    <div className="flex items-center gap-2">
                      <span className="truncate">{cv.name}</span>
                      {cv.is_primary && (
                        <Badge variant="secondary" className="text-[10px]">
                          {t("setup.primary")}
                        </Badge>
                      )}
                      {cv.source === "tailored" && (
                        <Badge variant="outline" className="text-[10px]">
                          {t("setup.tailored")}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Job */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">{t("cv.step_select_job")}</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">{t("setup.job_hint")}</p>
          {job ? (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{job.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[job.company_name, job.location].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {job.source === "manual" && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {t("setup.pasted")}
                  </Badge>
                )}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onPickJob} disabled={disabled}>
              <Briefcase className="h-4 w-4 mr-2" />
              {job ? t("cv.change_job") : t("cv.select_job_button")}
            </Button>
            <Button variant="outline" size="sm" onClick={onPasteJob} disabled={disabled}>
              <ClipboardPaste className="h-4 w-4 mr-2" />
              {t("setup.paste_job")}
            </Button>
          </div>
        </div>

        {/* Output language */}
        {job && outputLanguage && (
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <Languages className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{t("setup.output_language")}</span>
            <Select
              value={outputLanguage}
              onValueChange={(v) => onLanguageChange(v as CvOutputLanguage)}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 w-[140px]" aria-label={t("setup.output_language")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="pt">Português (BR)</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
              </SelectContent>
            </Select>
            {!languageOverridden && (
              <span className="text-xs text-muted-foreground">{t("setup.language_detected")}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

