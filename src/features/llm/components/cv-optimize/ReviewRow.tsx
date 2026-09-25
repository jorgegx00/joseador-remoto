import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Pencil,
  Undo2,
  Sparkles,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { rowFinalBody, type ReviewRow as ReviewRowModel, type ReviewAction, type ChangeReason } from "@/lib/cv/review-state";
import { DiffText, HighlightedText } from "./DiffText";

export interface RowFlags {
  addedSkills: string[];
  unsupportedFigures: string[];
  newTech: string[];
}

interface ReviewRowProps {
  row: ReviewRowModel;
  flags: RowFlags;
  reasons: ChangeReason[];
  addedKeywords: string[];
  translated: boolean;
  disabled: boolean;
  isEditing: boolean;
  onEditingChange: (editing: boolean) => void;
  onAction: (action: ReviewAction) => void;
  /** Visual highlight when navigated to via "Next flagged". */
  focused?: boolean;
}

function headingOf(row: ReviewRowModel): string {
  const line = row.headingOverride ?? row.proposedHeading ?? row.originalHeading ?? "";
  return line.replace(/^#+\s*/, "");
}

/**
 * One reviewable section/role: original vs optimized side by side (aligned), word-level
 * diff, flags, and always-visible labelled actions (Edit / Keep original / Use AI).
 */
export function ReviewRow({
  row,
  flags,
  reasons,
  addedKeywords,
  translated,
  disabled,
  isEditing,
  onEditingChange,
  onAction,
  focused,
}: ReviewRowProps) {
  const { t } = useTranslation("generation");
  const editorId = useId();
  const [draft, setDraft] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [expanded, setExpanded] = useState(row.status !== "unchanged");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const finalBody = rowFinalBody(row) ?? "";
  const original = row.original ?? "";
  const proposed = row.proposed ?? "";
  const heading = headingOf(row);
  const flagCount = flags.addedSkills.length + flags.unsupportedFigures.length + flags.newTech.length;
  const isNewSection = row.original === null && row.proposed !== null;
  const aiDropped = row.proposed === null && row.original !== null;

  useEffect(() => {
    if (isEditing) {
      // A section the AI dropped (or one kept removed) starts from its original text.
      setDraft(rowFinalBody(row) ?? row.original ?? row.proposed ?? "");
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight + 2}px`;
        }
      });
    }
    // Only when entering edit mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const saveEdit = () => {
    const text = draft.trim();
    if (!text && aiDropped) {
      // Emptying a dropped section = accept the AI's removal.
      onAction({ type: "restoreAi", id: row.id });
    } else if (!text && row.original === null) {
      // Emptying a new section = don't add it.
      onAction({ type: "keepOriginal", id: row.id });
    } else {
      onAction({ type: "edit", id: row.id, text });
    }
    onEditingChange(false);
  };

  const statusBadge = (() => {
    switch (row.status) {
      case "unchanged":
        return <Badge variant="outline" className="text-[10px]">{t("review.status_unchanged")}</Badge>;
      case "ai":
        return (
          <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200">
            <Sparkles />
            {isNewSection ? t("review.status_new_section") : aiDropped ? t("review.status_removed") : t("review.status_ai")}
          </Badge>
        );
      case "original":
        return <Badge variant="secondary" className="text-[10px]">{t("review.status_original")}</Badge>;
      case "edited":
        return (
          <Badge className="text-[10px] bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200">
            <Pencil />
            {t("review.status_edited")}
          </Badge>
        );
      case "removed":
        return <Badge variant="secondary" className="text-[10px]">{t("review.status_removed")}</Badge>;
    }
  })();

  if (row.status === "unchanged" && !isEditing) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed px-4 py-2",
          row.kind === "subsection" && "ml-4",
        )}
        data-row-id={row.id}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate text-sm font-medium text-muted-foreground">{heading || t("review.untitled")}</span>
            {statusBadge}
          </button>
          <Button type="button" size="sm" variant="ghost" className="h-7" disabled={disabled} onClick={() => onEditingChange(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            {t("review.edit")}
          </Button>
        </div>
        {expanded && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{finalBody}</p>
        )}
      </div>
    );
  }

  return (
    <div
      data-row-id={row.id}
      className={cn(
        "rounded-lg border bg-card p-4 transition-shadow",
        row.kind === "subsection" && "ml-4",
        focused && "ring-2 ring-primary",
        flagCount > 0 && row.status !== "original" && "border-amber-300 dark:border-amber-800",
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{heading || t("review.untitled")}</span>
            {statusBadge}
            {row.reviewed && row.status !== "unchanged" && (
              <Badge variant="outline" className="text-[10px] text-emerald-700 dark:text-emerald-300">
                <Check />
                {t("review.reviewed")}
              </Badge>
            )}
          </div>
          {/* Why + flags */}
          {row.status !== "original" && (reasons.length > 0 || flagCount > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {reasons.map((reason) => (
                <Badge key={reason} variant="outline" className="text-[10px] font-normal">
                  {reason === "keywords" && addedKeywords.length > 0
                    ? t("review.why_keywords_list", { list: addedKeywords.slice(0, 4).join(", ") })
                    : t(`review.why_${reason}`)}
                </Badge>
              ))}
              {flags.addedSkills.map((skill) => (
                <Badge
                  key={`s-${skill}`}
                  className="text-[10px] bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  title={t("review.flag_new_claim_hint")}
                >
                  {t("review.flag_new_claim", { skill })}
                </Badge>
              ))}
              {flags.unsupportedFigures.map((fig) => (
                <Badge
                  key={`f-${fig}`}
                  className="text-[10px] bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                  title={t("review.flag_unsupported_hint")}
                >
                  <AlertTriangle />
                  {t("review.flag_unsupported", { figure: fig })}
                </Badge>
              ))}
              {flags.newTech.map((term) => (
                <Badge
                  key={`t-${term}`}
                  className="text-[10px] bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                  title={t("review.flag_new_tech_hint")}
                >
                  {t("review.flag_new_tech", { term })}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Actions — always visible and labelled */}
        {!isEditing && (
          <div className="flex flex-wrap items-center gap-1">
            <Button type="button" size="sm" variant="outline" className="h-7" disabled={disabled} onClick={() => onEditingChange(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              {t("review.edit")}
            </Button>
            {row.status !== "original" && row.original !== null && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                disabled={disabled}
                onClick={() => onAction({ type: "keepOriginal", id: row.id })}
              >
                <Undo2 className="h-3.5 w-3.5 mr-1" />
                {t("review.keep_original")}
              </Button>
            )}
            {isNewSection && row.status !== "original" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                disabled={disabled}
                onClick={() => onAction({ type: "keepOriginal", id: row.id })}
              >
                <Undo2 className="h-3.5 w-3.5 mr-1" />
                {t("review.remove_section")}
              </Button>
            )}
            {row.status !== "ai" && (row.proposed !== null || aiDropped) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                disabled={disabled}
                onClick={() => onAction({ type: "restoreAi", id: row.id })}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                {aiDropped ? t("review.accept_removal") : t("review.use_ai")}
              </Button>
            )}
            {row.stashedEdit && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                disabled={disabled}
                onClick={() => onAction({ type: "restoreEdit", id: row.id })}
              >
                <History className="h-3.5 w-3.5 mr-1" />
                {t("review.restore_my_edit")}
              </Button>
            )}
            {row.status === "ai" && !row.reviewed && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7"
                disabled={disabled}
                onClick={() => onAction({ type: "markReviewed", id: row.id, reviewed: true })}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                {t("review.looks_good")}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {isEditing ? (
        <div className="mt-3 space-y-2">
          <label htmlFor={editorId} className="sr-only">
            {t("review.edit_label", { section: heading })}
          </label>
          <Textarea
            id={editorId}
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight + 2}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onEditingChange(false);
              } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveEdit();
              }
            }}
            className="min-h-[120px] font-mono text-xs leading-relaxed"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{t("review.edit_shortcuts")}</span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => onEditingChange(false)}>
                {t("review.cancel_edit")}
              </Button>
              <Button type="button" size="sm" onClick={saveEdit}>
                {t("review.save_edit")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {aiDropped && row.status === "ai" ? (
            <div className="rounded-md border border-dashed p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t("review.ai_removed_section")}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground line-through">{original}</p>
            </div>
          ) : (
            <>
              {/* Mobile: toggle to see the original */}
              {row.original !== null && (
                <button
                  type="button"
                  className="mb-2 text-xs text-muted-foreground underline lg:hidden"
                  onClick={() => setShowOriginal((v) => !v)}
                >
                  {showOriginal ? t("review.hide_original") : t("review.show_original")}
                </button>
              )}
              <div className="grid gap-3 lg:grid-cols-2">
                <div className={cn("rounded-md bg-muted/40 p-3", !showOriginal && "hidden lg:block")}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("review.original")}
                  </p>
                  {row.original === null ? (
                    <p className="text-xs italic text-muted-foreground">{t("review.absent_original")}</p>
                  ) : row.status === "ai" && !translated ? (
                    <DiffText original={original} proposed={proposed} side="original" className="text-muted-foreground" />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{original}</p>
                  )}
                </div>
                <div className="rounded-md border p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {row.status === "edited"
                      ? t("review.your_version")
                      : row.status === "original"
                        ? t("review.final_original")
                        : t("review.optimized")}
                  </p>
                  {row.status === "ai" && !translated && row.original !== null ? (
                    <DiffText original={original} proposed={proposed} side="proposed" />
                  ) : row.status === "ai" && translated ? (
                    <HighlightedText text={proposed} terms={addedKeywords} />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{finalBody}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
