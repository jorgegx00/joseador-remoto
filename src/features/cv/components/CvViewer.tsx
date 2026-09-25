import { useTranslation } from "react-i18next";
import {
  Mail,
  Phone,
  Link2,
  Code2,
  MapPin,
  Globe,
  Award,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ExperienceTimeline } from "./ExperienceTimeline";
import { EducationCards } from "./EducationCards";
import { SkillBadges } from "./SkillBadges";
import type { ParsedCv } from "@/types";

interface CvViewerProps {
  data: ParsedCv;
}

const LANGUAGE_LEVEL_PROGRESS: Record<string, number> = {
  native: 100,
  fluent: 90,
  advanced: 75,
  intermediate: 50,
  basic: 25,
};

export function CvViewer({ data }: CvViewerProps) {
  const { t } = useTranslation("cv");

  return (
    <div className="space-y-6">
      {/* Contact Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">
          {data.full_name || t("viewer.unnamed")}
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {data.email && (
            <a
              href={`mailto:${data.email}`}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              {data.email}
            </a>
          )}
          {data.phone && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              {data.phone}
            </span>
          )}
          {data.linkedin_url && (
            <a
              href={data.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Link2 className="h-3.5 w-3.5" />
              LinkedIn
            </a>
          )}
          {data.github_url && (
            <a
              href={data.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Code2 className="h-3.5 w-3.5" />
              GitHub
            </a>
          )}
          {data.portfolio_url && (
            <a
              href={data.portfolio_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              Portfolio
            </a>
          )}
          {data.location && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {data.location}
            </span>
          )}
        </div>
      </div>

      {/* Summary */}
      {data.summary && (
        <div>
          <h3 className="text-base font-semibold mb-2">{t("sections.summary")}</h3>
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <p className="text-sm leading-relaxed text-foreground/80">
                {data.summary}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Separator />

      {/* Experience */}
      {data.experience.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3">
            {t("sections.experience")}
          </h3>
          <ExperienceTimeline experiences={data.experience} />
        </div>
      )}

      {data.experience.length > 0 && <Separator />}

      {/* Education */}
      {data.education.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3">
            {t("sections.education")}
          </h3>
          <EducationCards education={data.education} />
        </div>
      )}

      {data.education.length > 0 && <Separator />}

      {/* Skills */}
      {(data.skills.technical.length > 0 || data.skills.soft.length > 0) && (
        <div>
          <h3 className="text-base font-semibold mb-3">
            {t("sections.skills")}
          </h3>
          <SkillBadges skills={data.skills} />
        </div>
      )}

      {(data.skills.technical.length > 0 || data.skills.soft.length > 0) && (
        <Separator />
      )}

      {/* Certifications */}
      {data.certifications.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3">
            {t("sections.certifications")}
          </h3>
          <ul className="space-y-2">
            {data.certifications.map((cert, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <Award className="h-4 w-4 text-amber-500 shrink-0" />
                {cert}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.certifications.length > 0 && <Separator />}

      {/* Projects */}
      {data.projects.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3">
            {t("sections.projects")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.projects.map((project, index) => (
              <Card key={`${project.name}-${index}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="font-semibold text-sm">{project.name}</h4>
                    {project.url && (
                      <a
                        href={project.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    )}
                  </div>
                  {project.description && (
                    <p className="text-sm text-foreground/80 mb-2">
                      {project.description}
                    </p>
                  )}
                  {project.achievements.length > 0 && (
                    <ul className="list-disc list-inside space-y-0.5 mb-2">
                      {project.achievements.map((ach, i) => (
                        <li key={i} className="text-xs text-foreground/70">
                          {ach}
                        </li>
                      ))}
                    </ul>
                  )}
                  {project.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {project.technologies.map((tech) => (
                        <Badge
                          key={tech}
                          variant="outline"
                          className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                        >
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {data.projects.length > 0 && <Separator />}

      {/* Languages */}
      {data.languages.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3">
            {t("sections.languages")}
          </h3>
          <div className="flex flex-wrap gap-3">
            {data.languages.map((lang, index) => (
              <div
                key={`${lang.name}-${index}`}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 min-w-[160px]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{lang.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress
                      value={LANGUAGE_LEVEL_PROGRESS[lang.level] ?? 50}
                      className="h-1.5 flex-1"
                    />
                    <span className="text-xs text-muted-foreground capitalize shrink-0">
                      {t(`viewer.lang_level.${lang.level}`)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
