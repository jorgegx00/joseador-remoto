import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Circle, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type GenerationPhase = "analyzing" | "connecting" | "thinking" | "writing";

interface GenerationProgressProps {
  phase: GenerationPhase;
  /** Visible characters written so far. */
  chars: number;
  /** Section currently being written ("Experience"), when known. */
  section: string | null;
  /** Rough expected output size (source CV length), for the progress estimate. */
  expectedChars: number;
  startedAt: number;
  onCancel: () => void;
}

const PHASES: GenerationPhase[] = ["analyzing", "connecting", "thinking", "writing"];

function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

function StepIcon({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" />
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </div>
    );
  }
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Circle className="h-3.5 w-3.5" />
    </div>
  );
}

/**
 * Real progress for CV generation: analysis → waiting for the model → thinking (reasoning
 * models) → writing. The bar is indeterminate until the first visible token, then
 * estimates completion from characters written vs. the source CV length.
 */
export function GenerationProgress({
  phase,
  chars,
  section,
  expectedChars,
  startedAt,
  onCancel,
}: GenerationProgressProps) {
  const { t } = useTranslation("generation");
  const elapsed = useElapsedSeconds(startedAt);
  const currentIdx = PHASES.indexOf(phase);

  const progressValue =
    phase === "writing" ? Math.min(95, Math.round((chars / Math.max(expectedChars * 1.1, 1)) * 100)) : null;

  const labelFor = (p: GenerationPhase) => {
    if (p === "writing" && phase === "writing") {
      return section
        ? t("progress.writing_section", { chars: chars.toLocaleString(), section })
        : t("progress.writing_chars", { chars: chars.toLocaleString() });
    }
    return t(`progress.phase_${p}`);
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-6">
          <ol className="space-y-3" aria-live="polite">
            {PHASES.map((p, idx) => {
              // "thinking" only shows as active/done for reasoning models.
              const status: "done" | "active" | "pending" =
                idx < currentIdx ? "done" : idx === currentIdx ? "active" : "pending";
              if (p === "thinking" && phase !== "thinking" && status !== "done") return null;
              return (
                <li key={p} className="flex items-center gap-3">
                  <StepIcon status={status} />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      status === "done" && "text-emerald-600 dark:text-emerald-400",
                      status === "active" && "text-blue-600 dark:text-blue-400",
                      status === "pending" && "text-muted-foreground",
                    )}
                  >
                    {labelFor(p)}
                  </span>
                </li>
              );
            })}
          </ol>

          {progressValue === null ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-primary/20">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
            </div>
          ) : (
            <Progress value={progressValue} className="h-2" />
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {t("progress.elapsed", { seconds: elapsed })}
              {phase === "thinking" && ` · ${t("progress.thinking_hint")}`}
            </span>
            <Button variant="outline" size="sm" onClick={onCancel}>
              <X className="h-3.5 w-3.5 mr-1.5" />
              {t("progress.cancel")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
