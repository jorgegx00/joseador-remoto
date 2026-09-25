import { useTranslation } from "react-i18next";
import { differenceInMonths, parse, isValid } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import type { CvExperience } from "@/types";

interface ExperienceTimelineProps {
  experiences: CvExperience[];
}

function parseDateSafe(dateStr: string): Date | null {
  // Try common formats
  const formats = ["yyyy-MM-dd", "yyyy-MM", "MM/yyyy", "yyyy"];
  for (const fmt of formats) {
    const parsed = parse(dateStr, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  // Fallback: try native parsing
  const native = new Date(dateStr);
  return isValid(native) ? native : null;
}

function formatDuration(startStr: string, endStr: string | null, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const start = parseDateSafe(startStr);
  const end = endStr ? parseDateSafe(endStr) : new Date();

  if (!start || !end) return "";

  const totalMonths = differenceInMonths(end, start);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  const parts: string[] = [];
  if (years > 0) {
    parts.push(t("viewer.years", { count: years }));
  }
  if (months > 0) {
    parts.push(t("viewer.months", { count: months }));
  }
  if (parts.length === 0) {
    parts.push(t("viewer.months", { count: 1 }));
  }

  return parts.join(" ");
}

export function ExperienceTimeline({ experiences }: ExperienceTimelineProps) {
  const { t } = useTranslation("cv");

  if (experiences.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        {t("viewer.no_experience")}
      </p>
    );
  }

  // Sort by start date descending (most recent first)
  const sorted = [...experiences].sort((a, b) => {
    const dateA = parseDateSafe(a.start_date);
    const dateB = parseDateSafe(b.start_date);
    if (!dateA || !dateB) return 0;
    return dateB.getTime() - dateA.getTime();
  });

  return (
    <div className="relative pl-6">
      {/* Vertical timeline line */}
      <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />

      <div className="space-y-4">
        {sorted.map((exp, index) => (
          <div key={`${exp.company}-${exp.title}-${index}`} className="relative">
            {/* Timeline dot */}
            <div className="absolute -left-6 top-4 h-[9px] w-[9px] rounded-full border-2 border-primary bg-background" />

            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <h4 className="font-semibold text-sm">{exp.title}</h4>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="font-medium">{exp.company}</span>
                      {exp.location && (
                        <>
                          <span className="text-border">|</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {exp.location}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <span>
                    {exp.start_date} - {exp.end_date ?? t("viewer.present")}
                  </span>
                  <span className="text-border">|</span>
                  <span>{formatDuration(exp.start_date, exp.end_date, t)}</span>
                </div>

                {exp.description && (
                  <p className="text-sm text-foreground/80 mb-2">
                    {exp.description}
                  </p>
                )}

                {exp.achievements.length > 0 && (
                  <ul className="list-disc list-inside space-y-0.5 mb-2">
                    {exp.achievements.map((achievement, i) => (
                      <li key={i} className="text-sm text-foreground/80">
                        {achievement}
                      </li>
                    ))}
                  </ul>
                )}

                {exp.technologies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {exp.technologies.map((tech) => (
                      <Badge
                        key={tech}
                        variant="outline"
                        className="bg-blue-50 text-blue-700 text-xs dark:bg-blue-900/20 dark:text-blue-300"
                      >
                        {tech}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
