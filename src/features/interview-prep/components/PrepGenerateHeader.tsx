import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PrepGenerateHeaderProps {
  title: string;
  description: string;
  hasContent: boolean;
  isGenerating: boolean;
  disabled?: boolean;
  updatedAt?: number;
  language?: "en" | "es";
  onGenerate: () => void;
  onCancel: () => void;
}

/** Title row shared by the AI prep panels: generate / regenerate / cancel + freshness. */
export function PrepGenerateHeader({
  title,
  description,
  hasContent,
  isGenerating,
  disabled,
  updatedAt,
  language,
  onGenerate,
  onCancel,
}: PrepGenerateHeaderProps) {
  const { t, i18n } = useTranslation("interview-prep");
  const locale = i18n.language === "es" ? es : enUS;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
        {hasContent && updatedAt && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {t("prep_ai.updated", {
              when: formatDistanceToNow(new Date(updatedAt), { addSuffix: true, locale }),
            })}
            {language && <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase">{language}</Badge>}
          </p>
        )}
      </div>
      {isGenerating ? (
        <Button variant="outline" size="sm" onClick={onCancel}>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t("prep_ai.cancel")}
          <X className="ml-2 h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button size="sm" variant={hasContent ? "outline" : "default"} onClick={onGenerate} disabled={disabled}>
          {hasContent ? <RefreshCw className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {hasContent ? t("prep_ai.regenerate") : t("prep_ai.generate")}
        </Button>
      )}
    </div>
  );
}
