import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, AlertCircle, Sparkles, Check, ArrowRight, Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCvRefine } from "../hooks/useCvRefine";
import { useCvStore } from "@/stores/cvStore";
import { useLlmAvailability } from "@/features/llm/hooks/useLlmAvailability";
import { CvChatPanel } from "@/features/llm/components/CvChatPanel";
import { ParsedCvEditor } from "./ParsedCvEditor";
import type { ParsedCv, CvExperience, CvEducation, CvProject, CvLanguage } from "@/types";

interface CvRefineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cvId: string;
  rawText: string;
  current: ParsedCv;
  onAccepted?: () => void;
}

interface FieldDiff {
  label: string;
  before: string;
  after: string;
}

function arrJoin(arr: string[]): string {
  return arr.length === 0 ? "—" : arr.join(", ");
}

function expSummary(e: CvExperience): string {
  return `${e.title || "?"} @ ${e.company || "?"} (${e.start_date || "?"}–${e.end_date ?? "present"})`;
}
function eduSummary(e: CvEducation): string {
  return `${e.degree || "?"} — ${e.institution || "?"}`;
}
function projSummary(p: CvProject): string {
  return p.name || "(unnamed)";
}
function langSummary(l: CvLanguage): string {
  return `${l.name}${l.level ? ` (${l.level})` : ""}`;
}

function computeDiffs(before: ParsedCv, after: ParsedCv): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const scalarKeys: Array<keyof ParsedCv> = [
    "full_name",
    "email",
    "phone",
    "location",
    "linkedin_url",
    "github_url",
    "portfolio_url",
    "summary",
  ];
  for (const key of scalarKeys) {
    const b = String(before[key] ?? "");
    const a = String(after[key] ?? "");
    if (b !== a) {
      diffs.push({ label: key, before: b || "—", after: a || "—" });
    }
  }

  const bTech = before.skills?.technical ?? [];
  const aTech = after.skills?.technical ?? [];
  if (bTech.join("|") !== aTech.join("|")) {
    diffs.push({
      label: "skills.technical",
      before: arrJoin(bTech),
      after: arrJoin(aTech),
    });
  }
  const bSoft = before.skills?.soft ?? [];
  const aSoft = after.skills?.soft ?? [];
  if (bSoft.join("|") !== aSoft.join("|")) {
    diffs.push({
      label: "skills.soft",
      before: arrJoin(bSoft),
      after: arrJoin(aSoft),
    });
  }

  const bExp = before.experience.map(expSummary).join(" | ");
  const aExp = after.experience.map(expSummary).join(" | ");
  if (bExp !== aExp) {
    diffs.push({
      label: `experience (${before.experience.length} → ${after.experience.length})`,
      before: before.experience.map(expSummary).join("\n") || "—",
      after: after.experience.map(expSummary).join("\n") || "—",
    });
  }

  const bEdu = before.education.map(eduSummary).join(" | ");
  const aEdu = after.education.map(eduSummary).join(" | ");
  if (bEdu !== aEdu) {
    diffs.push({
      label: `education (${before.education.length} → ${after.education.length})`,
      before: before.education.map(eduSummary).join("\n") || "—",
      after: after.education.map(eduSummary).join("\n") || "—",
    });
  }

  if (before.certifications.join("|") !== after.certifications.join("|")) {
    diffs.push({
      label: "certifications",
      before: arrJoin(before.certifications),
      after: arrJoin(after.certifications),
    });
  }

  const bProj = before.projects.map(projSummary).join(" | ");
  const aProj = after.projects.map(projSummary).join(" | ");
  if (bProj !== aProj) {
    diffs.push({
      label: `projects (${before.projects.length} → ${after.projects.length})`,
      before: before.projects.map(projSummary).join("\n") || "—",
      after: after.projects.map(projSummary).join("\n") || "—",
    });
  }

  const bLang = before.languages.map(langSummary).join(" | ");
  const aLang = after.languages.map(langSummary).join(" | ");
  if (bLang !== aLang) {
    diffs.push({
      label: "languages",
      before: before.languages.map(langSummary).join("\n") || "—",
      after: after.languages.map(langSummary).join("\n") || "—",
    });
  }

  return diffs;
}

export function CvRefineDialog({
  open,
  onOpenChange,
  cvId,
  rawText,
  current,
  onAccepted,
}: CvRefineDialogProps) {
  const { t } = useTranslation("cv");
  const {
    proposed,
    isRefining,
    isChatting,
    chatHistory,
    error,
    chatError,
    refine,
    refineWithChat,
    setProposedManually,
    reset,
  } = useCvRefine();
  const updateCvData = useCvStore((s) => s.updateCvData);
  const { hasProvider: hasLlmProvider } = useLlmAvailability();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    if (!hasLlmProvider) return;
    if (!rawText) return;
    void refine(rawText, current);
  }, [open, rawText, current, refine, reset, hasLlmProvider]);

  const diffs = useMemo(
    () => (proposed ? computeDiffs(current, proposed) : []),
    [proposed, current],
  );

  const handleChatSend = useCallback(
    async (message: string) => {
      await refineWithChat(rawText, message);
    },
    [refineWithChat, rawText],
  );

  const handleAccept = useCallback(async () => {
    if (!proposed) return;
    setIsSaving(true);
    try {
      await updateCvData(cvId, proposed);
      toast.success(t("refine.success"));
      onAccepted?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }, [proposed, cvId, updateCvData, t, onAccepted, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            {t("refine.dialog_title")}
          </DialogTitle>
          <DialogDescription>{t("refine.dialog_description")}</DialogDescription>
        </DialogHeader>

        {!hasLlmProvider ? (
          <div className="py-8 text-center space-y-3">
            <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">{t("refine.no_provider")}</p>
            <Link to="/settings">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                {t("llm.go_to_settings")}
              </Button>
            </Link>
          </div>
        ) : !rawText ? (
          <div className="py-8 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">{t("refine.no_raw_text")}</p>
          </div>
        ) : isRefining ? (
          <div className="py-10 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">{t("refine.refining")}</p>
            <p className="text-xs text-muted-foreground">{t("refine.refining_hint")}</p>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t("refine.error_title")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : proposed ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <Tabs defaultValue="diff">
                <TabsList className="grid w-full grid-cols-2 mb-2">
                  <TabsTrigger value="diff">
                    {t("refine.tab_diff", { defaultValue: "Diff" })}{" "}
                    <Badge variant="secondary" className="ml-1.5 text-[10px]">
                      {diffs.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="edit">
                    {t("refine.tab_edit", { defaultValue: "Edit" })}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="diff" className="mt-0">
                  {diffs.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      {t("refine.no_changes")}
                    </p>
                  ) : (
                    <ScrollArea className="h-[480px] rounded-md border">
                      <div className="p-3 space-y-3">
                        {diffs.map((d) => (
                          <div key={d.label} className="space-y-1.5">
                            <p className="text-xs font-semibold font-mono text-muted-foreground">
                              {d.label}
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/20 p-2">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                                  {t("refine.current_label")}
                                </p>
                                <pre className="text-xs whitespace-pre-wrap font-sans">
                                  {d.before}
                                </pre>
                              </div>
                              <div className="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/20 p-2">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                                  <ArrowRight className="h-3 w-3" />
                                  {t("refine.proposed_label")}
                                </p>
                                <pre className="text-xs whitespace-pre-wrap font-sans">
                                  {d.after}
                                </pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </TabsContent>
                <TabsContent value="edit" className="mt-0">
                  <ScrollArea className="h-[480px] rounded-md border">
                    <div className="p-3">
                      <ParsedCvEditor value={proposed} onChange={setProposedManually} />
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
            <div>
              <CvChatPanel
                history={chatHistory}
                isRefining={isChatting}
                error={chatError}
                onSend={handleChatSend}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t("refine.discard_changes")}
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!proposed || diffs.length === 0 || isSaving || isRefining}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            {t("refine.accept_changes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
