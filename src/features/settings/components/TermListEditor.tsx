import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TermListEditorProps {
  terms: string[];
  /** null = restore the built-in defaults. */
  onChange: (terms: string[] | null) => void;
  placeholder?: string;
  /** Show the "restore defaults" button. Off for lists that have no defaults (e.g. the blacklist). */
  showRestoreDefaults?: boolean;
}

/** Chip list + add/remove input for the scraping search-term settings. */
export function TermListEditor({
  terms,
  onChange,
  placeholder,
  showRestoreDefaults = true,
}: TermListEditorProps) {
  const { t } = useTranslation("settings");
  const [draft, setDraft] = useState("");

  function addTerm() {
    const term = draft.trim();
    if (!term) return;
    setDraft("");
    if (terms.some((existing) => existing.toLowerCase() === term.toLowerCase())) return;
    onChange([...terms, term]);
  }

  function removeTerm(term: string) {
    onChange(terms.filter((existing) => existing !== term));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {terms.map((term) => (
          <Badge key={term} variant="secondary" className="gap-1 font-normal">
            {term}
            <button
              type="button"
              className="ml-0.5 text-muted-foreground hover:text-destructive"
              onClick={() => removeTerm(term)}
              aria-label={t("scraping.remove_term", { term })}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTerm();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={addTerm} disabled={!draft.trim()}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t("scraping.add_term")}
        </Button>
        {showRestoreDefaults && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            {t("scraping.restore_defaults")}
          </Button>
        )}
      </div>
    </div>
  );
}
