import { useTranslation } from "react-i18next";
import type { ReviewAction, ReviewRow as ReviewRowModel } from "@/lib/cv/review-state";
import { ReviewRow } from "./cv-optimize/ReviewRow";
import type { RowInsight } from "./cv-optimize/useReviewInsights";

interface CvDiffViewProps {
  rows: ReviewRowModel[];
  perRow: Map<string, RowInsight>;
  translated: boolean;
  /** Disables every action (generation or refinement in flight). */
  disabled: boolean;
  editingId: string | null;
  onEditingChange: (id: string | null) => void;
  onAction: (action: ReviewAction) => void;
  focusedId?: string | null;
}

const EMPTY_INSIGHT: RowInsight = {
  flags: { addedSkills: [], unsupportedFigures: [], newTech: [] },
  reasons: [],
  addedKeywords: [],
};

/**
 * Section-by-section review of the optimized CV. One page scroll; each row shows the
 * original and the optimized text side by side (stacked on narrow screens), so they
 * always line up.
 */
export function CvDiffView({
  rows,
  perRow,
  translated,
  disabled,
  editingId,
  onEditingChange,
  onAction,
  focusedId,
}: CvDiffViewProps) {
  const { t } = useTranslation("generation");

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("review.empty")}</p>;
  }

  return (
    <div className="space-y-3">
      {translated && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          {t("review.banner_translated")}
        </p>
      )}
      {rows.map((row) => {
        // Structural "## Experience" rows with no body on either side add nothing to review.
        if (row.kind === "section" && !row.original?.trim() && !row.proposed?.trim() && row.status === "unchanged") {
          return (
            <h3 key={row.id} className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {(row.proposedHeading ?? row.originalHeading ?? "").replace(/^#+\s*/, "")}
            </h3>
          );
        }
        const insight = perRow.get(row.id) ?? EMPTY_INSIGHT;
        return (
          <ReviewRow
            key={row.id}
            row={row}
            flags={insight.flags}
            reasons={insight.reasons}
            addedKeywords={insight.addedKeywords}
            translated={translated}
            disabled={disabled || (editingId !== null && editingId !== row.id)}
            isEditing={editingId === row.id}
            onEditingChange={(editing) => onEditingChange(editing ? row.id : null)}
            onAction={onAction}
            focused={focusedId === row.id}
          />
        );
      })}
    </div>
  );
}
