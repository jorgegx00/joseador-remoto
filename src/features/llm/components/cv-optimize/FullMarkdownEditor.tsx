import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface FullMarkdownEditorProps {
  value: string;
  disabled: boolean;
  onApply: (markdown: string) => void;
  /** Reports whether there are unapplied changes (blocks chat while true). */
  onDirtyChange?: (dirty: boolean) => void;
}

/** Edit the whole CV as markdown — for heading changes or large restructures. */
export function FullMarkdownEditor({ value, disabled, onApply, onDirtyChange }: FullMarkdownEditorProps) {
  const { t } = useTranslation("generation");
  const [draft, setDraft] = useState(value);
  // Tracks which `value` the draft was based on, to pick up external changes (undo,
  // refinement, apply) whenever the user has no unapplied edits.
  const [base, setBase] = useState(value);
  const dirty = draft !== base;

  if (value !== base && !dirty) {
    setBase(value);
    setDraft(value);
  }

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Never leave the parent thinking there are unapplied edits once we're gone.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const apply = () => {
    onApply(draft);
    // The applied text becomes the new baseline; the next `value` (normalized by the
    // review state) replaces it without counting as a user edit.
    setBase(draft);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("review.markdown_hint")}</p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={disabled}
        aria-label={t("review.tab_markdown")}
        className="min-h-[520px] font-mono text-xs leading-relaxed"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={!dirty || disabled} onClick={() => setDraft(base)}>
          {t("review.markdown_discard")}
        </Button>
        <Button type="button" size="sm" disabled={!dirty || disabled} onClick={apply}>
          {t("review.markdown_apply")}
        </Button>
      </div>
    </div>
  );
}
