import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Undo2, Redo2, Flag, RotateCcw, Sparkles, Save, Loader2, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ReviewToolbarProps {
  coverageBefore: number;
  coverageAfter: number;
  reviewed: number;
  changed: number;
  flaggedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
  isSaving: boolean;
  /** "saved" when the current version is already saved, "update" when a saved CV exists but changed. */
  saveState: "new" | "update" | "saved";
  onUndo: () => void;
  onRedo: () => void;
  onNextFlagged: () => void;
  onRevertAll: () => void;
  onRestoreAllAi: () => void;
  onSave: () => void;
  /** Extra actions (export menu). */
  extra?: ReactNode;
}

/** Sticky review toolbar: live keyword coverage, review progress, bulk actions, save. */
export function ReviewToolbar({
  coverageBefore,
  coverageAfter,
  reviewed,
  changed,
  flaggedCount,
  canUndo,
  canRedo,
  disabled,
  isSaving,
  saveState,
  onUndo,
  onRedo,
  onNextFlagged,
  onRevertAll,
  onRestoreAllAi,
  onSave,
  extra,
}: ReviewToolbarProps) {
  const { t } = useTranslation("generation");
  const delta = coverageAfter - coverageBefore;

  return (
    <div className="sticky top-0 z-10 -mx-1 rounded-lg border bg-background/95 px-3 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-sm" tabIndex={0}>
              <span className="text-muted-foreground">{t("score.keyword_coverage")}</span>
              <span className="font-semibold tabular-nums">{coverageBefore}%</span>
              <span className="text-muted-foreground">→</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  delta > 0 && "text-emerald-600 dark:text-emerald-400",
                  delta < 0 && "text-red-600 dark:text-red-400",
                )}
              >
                {coverageAfter}%
              </span>
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{t("score.tooltip")}</TooltipContent>
        </Tooltip>

        <span className="text-xs text-muted-foreground">
          {t("review.progress", { reviewed, changed })}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-8" disabled={!canUndo || disabled} onClick={onUndo} aria-label={t("review.undo")} title={t("review.undo")}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" disabled={!canRedo || disabled} onClick={onRedo} aria-label={t("review.redo")} title={t("review.redo")}>
            <Redo2 className="h-4 w-4" />
          </Button>
          {flaggedCount > 0 && (
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={onNextFlagged}>
              <Flag className="h-3.5 w-3.5 mr-1 text-amber-600" />
              {t("review.next_flagged", { count: flaggedCount })}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" className="h-8" disabled={disabled} onClick={onRevertAll}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            {t("review.revert_all")}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" disabled={disabled} onClick={onRestoreAllAi}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            {t("review.restore_all_ai")}
          </Button>
          {extra}
          <Button type="button" size="sm" className="h-8" disabled={disabled || isSaving} onClick={onSave}>
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : saveState === "saved" ? (
              <Check className="h-3.5 w-3.5 mr-1" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            {saveState === "new"
              ? t("save.button_new")
              : saveState === "update"
                ? t("save.button_update")
                : t("save.button_saved")}
          </Button>
        </div>
      </div>
    </div>
  );
}
