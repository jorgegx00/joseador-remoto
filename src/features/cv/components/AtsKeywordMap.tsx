import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { KeywordMatch } from "@/types/ats";

interface AtsKeywordMapProps {
  keywordMatches: KeywordMatch;
}

export function AtsKeywordMap({ keywordMatches }: AtsKeywordMapProps) {
  const { t } = useTranslation("cv");

  const { matched, missing, partial } = keywordMatches;
  const totalKeywords = matched.length + missing.length;
  const percentage =
    totalKeywords > 0 ? Math.round((matched.length / totalKeywords) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {t("ats.keyword_map_title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("ats.keyword_summary", {
            matched: matched.length,
            total: totalKeywords,
            percentage,
          })}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Found Keywords */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {t("ats.keyword_found")}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {matched.length > 0 ? (
                matched.map((kw) => (
                  <Badge
                    key={kw.keyword}
                    variant="outline"
                    className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                  >
                    {kw.keyword}
                    <span className="ml-1 text-[10px] opacity-70">
                      {t("ats.keyword_count", { count: kw.count })}
                    </span>
                  </Badge>
                ))
              ) : (
                <p className="text-xs text-muted-foreground italic">--</p>
              )}
            </div>
          </div>

          {/* Missing Keywords */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-red-700 dark:text-red-400">
              {t("ats.keyword_missing")}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {missing.length > 0 ? (
                missing.map((kw) => (
                  <Badge
                    key={kw.keyword}
                    variant="outline"
                    className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
                  >
                    {kw.keyword}
                    {kw.importance >= 8 && (
                      <span className="ml-0.5 text-[10px] font-bold">!</span>
                    )}
                  </Badge>
                ))
              ) : (
                <p className="text-xs text-muted-foreground italic">--</p>
              )}
            </div>
          </div>
        </div>

        {/* Partial Matches */}
        {partial.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {t("ats.keyword_partial")}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {partial.map((kw) => (
                  <Badge
                    key={kw.keyword}
                    variant="outline"
                    className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                  >
                    {kw.keyword}
                    <span className="ml-1 text-[10px] opacity-70">
                      ({kw.foundAs})
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
