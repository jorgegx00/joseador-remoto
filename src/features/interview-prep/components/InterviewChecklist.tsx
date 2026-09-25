import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckSquare,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useChecklist } from "../hooks/useChecklist";
import {
  checklistSections,
  type ChecklistSection as ChecklistSectionType,
} from "../data/checklist-items";
import type { ChecklistState } from "@/types";

interface InterviewChecklistProps {
  applicationId: string;
}

export function InterviewChecklist({
  applicationId,
}: InterviewChecklistProps) {
  const { t } = useTranslation("interview-prep");
  const {
    checklistState,
    isLoading,
    totalItems,
    completedItems,
    progressPercent,
    sectionProgress,
    toggleItem,
    resetChecklist,
    load,
  } = useChecklist();

  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  useEffect(() => {
    load(applicationId);
  }, [applicationId, load]);

  const handleReset = useCallback(async () => {
    await resetChecklist(applicationId);
    setResetDialogOpen(false);
    toast.success(t("checklist.reset_success"));
  }, [resetChecklist, applicationId, t]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {t("checklist.preparation_title")}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t("checklist.progress_label", {
              completed: completedItems,
              total: totalItems,
            })}
          </p>
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t("checklist.overall_progress")}
          </span>
          <span className="font-medium">{progressPercent}%</span>
        </div>
        <Progress value={progressPercent} className="h-3" />
      </div>

      {/* Checklist Sections */}
      <div className="space-y-4">
        {checklistSections.map((section) => (
          <ChecklistSectionCard
            key={section.id}
            section={section}
            checklistState={checklistState}
            sectionProgress={sectionProgress}
            onToggle={(itemId) =>
              toggleItem(section.id, itemId, applicationId)
            }
          />
        ))}
      </div>

      {/* Reset Button */}
      <div className="flex justify-end">
        <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-destructive">
              <RotateCcw className="h-4 w-4 mr-2" />
              {t("checklist.reset_button")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("checklist.reset_title")}</DialogTitle>
              <DialogDescription>
                {t("checklist.reset_description")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">
                  {t("checklist.cancel")}
                </Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleReset}>
                {t("checklist.confirm_reset")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChecklistSectionCard
// ---------------------------------------------------------------------------

interface ChecklistSectionCardProps {
  section: ChecklistSectionType;
  checklistState: ChecklistState;
  sectionProgress: (
    sectionId: keyof ChecklistState,
  ) => { completed: number; total: number };
  onToggle: (itemId: string) => void;
}

function ChecklistSectionCard({
  section,
  checklistState,
  sectionProgress,
  onToggle,
}: ChecklistSectionCardProps) {
  const { t } = useTranslation("interview-prep");
  const [expandedTips, setExpandedTips] = useState<Set<string>>(new Set());

  const { completed, total } = sectionProgress(section.id);
  const sectionPercent =
    total > 0 ? Math.round((completed / total) * 100) : 0;

  const toggleTip = (itemId: string) => {
    setExpandedTips((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const sectionState = checklistState[section.id] ?? {};

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            {t(section.labelKey)}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {t("checklist.section_progress", {
              completed,
              total,
            })}
          </span>
        </div>
        <Progress value={sectionPercent} className="h-1.5 mt-2" />
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {section.items.map((item) => {
          const isChecked = !!sectionState[item.id];
          const hasTip = !!item.tipKey;
          const isTipExpanded = expandedTips.has(item.id);

          return (
            <div key={item.id}>
              <div
                className={`flex items-start gap-3 rounded-md p-2 transition-colors hover:bg-muted/50 ${
                  isChecked ? "opacity-70" : ""
                }`}
              >
                <Checkbox
                  id={`checklist-${section.id}-${item.id}`}
                  checked={isChecked}
                  onCheckedChange={() => onToggle(item.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor={`checklist-${section.id}-${item.id}`}
                    className={`text-sm cursor-pointer ${
                      isChecked ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {t(item.labelKey)}
                  </label>
                </div>
                {hasTip && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => toggleTip(item.id)}
                  >
                    {isTipExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
              {hasTip && isTipExpanded && item.tipKey && (
                <div className="ml-9 mb-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                  {t(item.tipKey)}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
