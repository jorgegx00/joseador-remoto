import { useTranslation } from "react-i18next";
import { Globe, Target, ThumbsUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { GapBrief } from "@/lib/llm/prep-schemas";
import type { MaterialLanguage } from "@/lib/llm/language";
import type { Job, ParsedCv } from "@/types";
import { produceGapBrief } from "@/services/prep-generation";
import { usePrepDocument } from "../hooks/usePrepDocument";
import { PrepGenerateHeader } from "./PrepGenerateHeader";
import { NeedsInputCard } from "./NeedsInputCard";

const FIT_STYLES: Record<GapBrief["requirements"][number]["fit"], string> = {
  strong: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  partial: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  missing: "bg-muted text-muted-foreground",
};

interface GapBriefPanelProps {
  applicationId: string;
  cv: ParsedCv | null;
  job: Job | null;
  language: MaterialLanguage;
}

export function GapBriefPanel({ applicationId, cv, job, language }: GapBriefPanelProps) {
  const { t } = useTranslation("interview-prep");
  const { doc, isLoading, isGenerating, hasLlm, generate, cancel } = usePrepDocument<GapBrief>(
    applicationId,
    "gap_brief",
  );
  const brief = doc?.content ?? null;

  const handleGenerate = () => {
    if (!cv || !job) return;
    void generate(language, (llm, signal) =>
      produceGapBrief(llm, { applicationId, cvId: null, cv, job }, language, signal),
    );
  };

  return (
    <div className="space-y-4">
      <PrepGenerateHeader
        title={t("gap_brief.title")}
        description={t("gap_brief.description")}
        hasContent={!!brief}
        isGenerating={isGenerating}
        disabled={!cv || !job || !hasLlm}
        updatedAt={doc?.updated_at}
        language={doc?.language}
        onGenerate={handleGenerate}
        onCancel={cancel}
      />

      {!hasLlm && <p className="text-sm text-muted-foreground">{t("prep_ai.no_llm")}</p>}
      {(!cv || !job) && <p className="text-sm text-muted-foreground">{t("prep_ai.missing_cv_or_job")}</p>}

      {(isLoading || (isGenerating && !brief)) && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {brief && (
        <div className={cn("space-y-4", isGenerating && "opacity-50")}>
          <Card>
            <CardContent className="p-4 text-sm">{brief.headline}</CardContent>
          </Card>

          {brief.talking_points.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ThumbsUp className="h-4 w-4" />
                  {t("gap_brief.talking_points")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {brief.talking_points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4" />
                {t("gap_brief.requirements")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {brief.requirements.map((r, i) => (
                <div key={i} className="space-y-1 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{r.requirement}</span>
                    <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", FIT_STYLES[r.fit])}>
                      {t(`gap_brief.fit.${r.fit}`)}
                    </Badge>
                    {r.priority === "must" && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                        {t("gap_brief.must_have")}
                      </Badge>
                    )}
                  </div>
                  {r.cv_evidence && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">{t("gap_brief.evidence")}:</span> {r.cv_evidence}
                    </p>
                  )}
                  <p className="text-sm">{r.how_to_address}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {brief.remote_notes.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4" />
                  {t("gap_brief.remote_notes")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {brief.remote_notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <NeedsInputCard items={brief.needs_input} />
        </div>
      )}

      {!isLoading && !brief && !isGenerating && cv && job && hasLlm && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("gap_brief.empty")}
        </p>
      )}
    </div>
  );
}
