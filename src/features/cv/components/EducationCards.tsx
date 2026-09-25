import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, MapPin } from "lucide-react";
import type { CvEducation } from "@/types";

interface EducationCardsProps {
  education: CvEducation[];
}

export function EducationCards({ education }: EducationCardsProps) {
  const { t } = useTranslation("cv");

  if (education.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        {t("viewer.no_education")}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {education.map((edu, index) => (
        <Card key={`${edu.institution}-${edu.degree}-${index}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2 shrink-0">
                <GraduationCap className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-sm truncate">
                  {edu.institution}
                </h4>
                <p className="text-sm text-foreground/80">
                  {edu.degree}
                  {edu.field && ` - ${edu.field}`}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <span>
                    {edu.start_date} - {edu.end_date}
                  </span>
                  {edu.location && (
                    <>
                      <span className="text-border">|</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {edu.location}
                      </span>
                    </>
                  )}
                </div>
                {edu.honors.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {edu.honors.map((honor) => (
                      <Badge
                        key={honor}
                        variant="outline"
                        className="bg-amber-50 text-amber-700 text-xs dark:bg-amber-900/20 dark:text-amber-300"
                      >
                        {honor}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
