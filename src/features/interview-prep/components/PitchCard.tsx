import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import type { PitchVariant } from "@/types";

interface PitchCardProps {
  variant: PitchVariant;
  pitch: string;
  onRegenerate: () => void;
  onChange: (text: string) => void;
  isGenerating: boolean;
}

const VARIANT_COLORS: Record<PitchVariant, string> = {
  casual: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  formal: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  technical: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

export function PitchCard({
  variant,
  pitch,
  onRegenerate,
  onChange,
  isGenerating,
}: PitchCardProps) {
  const { t } = useTranslation("interview-prep");

  const wordCount = pitch.trim() ? pitch.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.round(wordCount / 2.5);

  if (isGenerating) {
    return (
      <Card>
        <CardHeader>
          <Badge className={VARIANT_COLORS[variant]}>
            {t(`pitch.${variant}`)}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Badge className={VARIANT_COLORS[variant]}>
          {t(`pitch.${variant}`)}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRegenerate}
          disabled={isGenerating}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          {t("pitch.regenerate")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={pitch}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("pitch.placeholder")}
          className="min-h-[120px] resize-y"
          rows={5}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t("pitch.word_count", { count: wordCount })}
          </span>
          <span>
            ~{estimatedSeconds} {t("pitch.seconds")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
