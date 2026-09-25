import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import type { CvExportFormat } from "@/lib/cv/export/types";

export type SaveExportChoice = CvExportFormat | "none";

interface SaveTailoredCvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  /** A tailored CV already exists for this CV + job (saving updates it). */
  isUpdate: boolean;
  isSaving: boolean;
  onConfirm: (opts: { name: string; format: SaveExportChoice; asNew: boolean }) => void;
}

const FORMATS: SaveExportChoice[] = ["pdf", "docx", "md", "none"];

/**
 * Save the optimized CV into the CV list (name it), and optionally export a file through
 * the native Save As dialog right after. Mount it with a `key` that changes on open so the
 * form resets to `defaultName` each time.
 */
export function SaveTailoredCvDialog({
  open,
  onOpenChange,
  defaultName,
  isUpdate,
  isSaving,
  onConfirm,
}: SaveTailoredCvDialogProps) {
  const { t } = useTranslation("generation");
  const [name, setName] = useState(defaultName);
  const [format, setFormat] = useState<SaveExportChoice>("pdf");
  const [asNew, setAsNew] = useState(false);

  const submit = () => onConfirm({ name: name.trim() || defaultName, format, asNew });

  return (
    <Dialog open={open} onOpenChange={(v) => !isSaving && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isUpdate && !asNew ? t("save.dialog_title_update") : t("save.dialog_title")}</DialogTitle>
          <DialogDescription>{t("save.dialog_description")}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="tailored-cv-name">{t("save.name_label")}</Label>
            <Input
              id="tailored-cv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>{t("save.export_label")}</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as SaveExportChoice)}
              className="grid grid-cols-2 gap-2"
            >
              {FORMATS.map((f) => (
                <Label
                  key={f}
                  htmlFor={`export-${f}`}
                  className="flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm font-normal has-[[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem id={`export-${f}`} value={f} />
                  {t(`save.format_${f}`)}
                </Label>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">{t("save.export_hint")}</p>
          </div>

          {isUpdate && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={asNew} onCheckedChange={(v) => setAsNew(v === true)} />
              {t("save.as_new")}
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSaving} onClick={() => onOpenChange(false)}>
              {t("save.cancel")}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isUpdate && !asNew ? t("save.confirm_update") : t("save.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
