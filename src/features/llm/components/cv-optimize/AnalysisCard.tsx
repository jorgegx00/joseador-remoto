import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw, Sparkles, AlertTriangle, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MatchScoreGauge } from "@/components/common/MatchScoreGauge";
import { cn } from "@/lib/utils";
import type { MatchAnalysis } from "@/types";
import type { SkillCandidate } from "@/stores/cvOptimizationStore";

interface AnalysisCardProps {
  analysis: MatchAnalysis | null;
  cached: boolean;
  stale: boolean | null;
  isAnalyzing: boolean;
  isLoading: boolean;
  onReanalyze: () => void;
  skillCandidates: SkillCandidate[];
  onToggleSkill: (skill: string) => void;
  hasReview: boolean;
  disabled: boolean;
  onGenerate: () => void;
}

const IMPORTANCE_ORDER = ["critical", "important", "nice_to_have"] as const;

/**
 * Step 3: match analysis summary, the job-post skills that will be added (opt-out chips —
 * uncheck anything you couldn't discuss in an interview) and the Generate button. The
 * analysis runs automatically on Generate when missing or stale.
 */
export function AnalysisCard({
  analysis,
  cached,
  stale,
  isAnalyzing,
  isLoading,
  onReanalyze,
  skillCandidates,
  onToggleSkill,
  hasReview,
  disabled,
  onGenerate,
}: AnalysisCardProps) {
  const { t } = useTranslation("generation");
  const selectedCount = skillCandidates.filter((c) => c.selected).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{t("cv.step_analysis")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        {isLoading && !analysis ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : analysis ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <MatchScoreGauge score={analysis.overall_match} size="md" animated />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium">{t("cv.analysis_summary", { score: analysis.overall_match })}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {t("cv.analysis_strengths", { count: analysis.strengths.length })}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {t("cv.analysis_gaps", { count: analysis.gaps.length })}
                  </Badge>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={onReanalyze} disabled={isAnalyzing || disabled}>
                {isAnalyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {isAnalyzing ? t("cv.analyzing") : t("cv.reanalyze")}
              </Button>
            </div>
            {analysis.recommendation && (
              <p className="text-xs italic text-muted-foreground">{analysis.recommendation}</p>
            )}
            {stale === true ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t("analysis.stale")}
              </p>
            ) : cached && !isAnalyzing ? (
              <p className="text-xs text-muted-foreground">{t("cv.analysis_cached_hint")}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("analysis.auto_hint")}</p>
        )}

        {/* Skills from the job post */}
        {skillCandidates.length > 0 && (
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">{t("skills_to_add.title", { count: selectedCount })}</p>
              <p className="text-xs text-muted-foreground">{t("skills_to_add.hint")}</p>
            </div>
            <div className="space-y-2">
              {IMPORTANCE_ORDER.map((importance) => {
                const group = skillCandidates.filter((c) => c.importance === importance);
                if (group.length === 0) return null;
                return (
                  <div key={importance} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-28 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t(`skills_to_add.importance_${importance}`)}
                    </span>
                    {group.map((c) => (
                      <button
                        key={c.skill}
                        type="button"
                        role="checkbox"
                        aria-checked={c.selected}
                        disabled={disabled}
                        onClick={() => onToggleSkill(c.skill)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                          c.selected
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-dashed text-muted-foreground line-through",
                        )}
                      >
                        {c.selected && <Check className="h-3 w-3" />}
                        {c.skill}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <Button size="lg" className="px-8" onClick={onGenerate} disabled={disabled}>
            <Sparkles className="h-5 w-5 mr-2" />
            {hasReview ? t("cv.regenerate") : t("cv.generate_button")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
