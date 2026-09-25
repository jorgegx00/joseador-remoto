import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SaveChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unsupportedFigures: string[];
  unacknowledgedSkills: string[];
  truncated: boolean;
  onReview: () => void;
  onSaveAnyway: () => void;
}

/** Last check before saving: invented-looking figures, unacknowledged new claims, truncation. */
export function SaveChecklistDialog({
  open,
  onOpenChange,
  unsupportedFigures,
  unacknowledgedSkills,
  truncated,
  onReview,
  onSaveAnyway,
}: SaveChecklistDialogProps) {
  const { t } = useTranslation("generation");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            {t("save_check.title")}
          </DialogTitle>
          <DialogDescription>{t("save_check.description")}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          {unsupportedFigures.length > 0 && (
            <li>
              <span className="font-medium">{t("save_check.figures", { count: unsupportedFigures.length })}</span>{" "}
              <span className="text-muted-foreground">{unsupportedFigures.join(", ")}</span>
            </li>
          )}
          {unacknowledgedSkills.length > 0 && (
            <li>
              <span className="font-medium">{t("save_check.claims", { count: unacknowledgedSkills.length })}</span>{" "}
              <span className="text-muted-foreground">{unacknowledgedSkills.join(", ")}</span>
            </li>
          )}
          {truncated && <li className="font-medium">{t("save_check.truncated")}</li>}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onReview}>
            {t("save_check.review_now")}
          </Button>
          <Button type="button" onClick={onSaveAnyway}>
            {t("save_check.save_anyway")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
