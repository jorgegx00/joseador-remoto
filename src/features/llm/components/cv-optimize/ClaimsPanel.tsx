import { useTranslation } from "react-i18next";
import { ShieldAlert, Check, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ClaimsPanelProps {
  addedSkills: string[];
  acknowledgedSkills: string[];
  unsupportedFigures: string[];
  newTech: string[];
  disabled: boolean;
  onAcknowledge: (skill: string) => void;
  onAllowFigure: (figure: string) => void;
  /** Sends a chat instruction to the refinement loop. */
  onFixWithAi: (instruction: string) => void;
}

/**
 * "Things to double-check before you send this CV": skills newly claimed from the job
 * post (be ready to discuss them), figures that don't appear in the source CV, and tech
 * terms that are in neither the CV nor the job post.
 */
export function ClaimsPanel({
  addedSkills,
  acknowledgedSkills,
  unsupportedFigures,
  newTech,
  disabled,
  onAcknowledge,
  onAllowFigure,
  onFixWithAi,
}: ClaimsPanelProps) {
  const { t } = useTranslation("generation");
  const acknowledged = new Set(acknowledgedSkills.map((s) => s.toLowerCase()));
  const total = addedSkills.length + unsupportedFigures.length + newTech.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          {t("claims.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("claims.description")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 && <p className="text-xs text-muted-foreground">{t("claims.empty")}</p>}

        {unsupportedFigures.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-red-700 dark:text-red-300">
                {t("claims.figures_title", { count: unsupportedFigures.length })}
              </h4>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={disabled}
                onClick={() =>
                  onFixWithAi(t("chat.tmpl_remove_figures", { list: unsupportedFigures.join(", ") }))
                }
              >
                <Wand2 className="h-3.5 w-3.5 mr-1" />
                {t("claims.remove_all_figures")}
              </Button>
            </div>
            <ul className="space-y-1.5">
              {unsupportedFigures.map((fig) => (
                <li key={fig} className="flex items-center justify-between gap-2 rounded-md bg-red-50 px-2 py-1.5 dark:bg-red-950/30">
                  <span className="text-xs font-medium">{fig}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px]"
                    disabled={disabled}
                    onClick={() => onAllowFigure(fig)}
                  >
                    {t("claims.figure_is_accurate")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {addedSkills.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              {t("claims.skills_title", { count: addedSkills.length })}
            </h4>
            <p className="text-[11px] text-muted-foreground">{t("claims.skills_hint")}</p>
            <ul className="space-y-1.5">
              {addedSkills.map((skill) => {
                const isAck = acknowledged.has(skill.toLowerCase());
                return (
                  <li
                    key={skill}
                    className="flex items-center justify-between gap-2 rounded-md bg-amber-50 px-2 py-1.5 dark:bg-amber-950/30"
                  >
                    <span className="text-xs font-medium">{skill}</span>
                    <div className="flex items-center gap-1">
                      {isAck ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                          <Check className="h-3 w-3" />
                          {t("claims.acknowledged")}
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px]"
                          onClick={() => onAcknowledge(skill)}
                        >
                          {t("claims.can_discuss")}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px]"
                        disabled={disabled}
                        onClick={() => onFixWithAi(t("chat.tmpl_remove_skill", { skill }))}
                      >
                        {t("claims.remove_with_ai")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {newTech.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-xs font-semibold text-red-700 dark:text-red-300">
              {t("claims.tech_title", { count: newTech.length })}
            </h4>
            <p className="text-[11px] text-muted-foreground">{t("claims.tech_hint")}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {newTech.map((term) => (
                <span key={term} className="rounded bg-red-50 px-1.5 py-0.5 text-xs dark:bg-red-950/30">
                  {term}
                </span>
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-[11px]"
                disabled={disabled}
                onClick={() => onFixWithAi(t("chat.tmpl_remove_tech", { list: newTech.join(", ") }))}
              >
                {t("claims.remove_with_ai")}
              </Button>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
