import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Save } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCvStore } from "@/stores/cvStore";
import { pickDefaultCv } from "@/lib/cv/cv-document";
import { useApplicationStore } from "@/stores/applicationStore";
import type { Job } from "@/types";

interface ApplyDialogProps {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplyDialog({
  job,
  open: isOpen,
  onOpenChange,
}: ApplyDialogProps) {
  const { t } = useTranslation("jobs");
  const { t: tCommon } = useTranslation("common");
  const { cvs, fetchCvs } = useCvStore();
  const { createApplication } = useApplicationStore();

  const [selectedCvId, setSelectedCvId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void fetchCvs();
    }
  }, [isOpen, fetchCvs]);

  // Tracks a manual pick so a CV refetch doesn't override the user's choice.
  const cvTouchedRef = useRef(false);

  useEffect(() => {
    if (isOpen) cvTouchedRef.current = false;
  }, [isOpen, job.id]);

  // Auto-select the CV tailored for this job, else the primary / newest upload.
  useEffect(() => {
    if (!isOpen || cvTouchedRef.current) return;
    const preferred = pickDefaultCv(cvs, job.id);
    if (preferred) setSelectedCvId(preferred.id);
  }, [isOpen, cvs, job.id]);

  const handleCvChange = useCallback((id: string) => {
    cvTouchedRef.current = true;
    setSelectedCvId(id);
  }, []);

  const handleApplyAndOpen = useCallback(async () => {
    if (!selectedCvId) return;
    setIsSubmitting(true);
    try {
      await createApplication(job.id, selectedCvId);
      if (job.apply_url) {
        await open(job.apply_url);
      }
      toast.success(t("apply.application_saved"));
      onOpenChange(false);
      setNotes("");
    } catch (err) {
      toast.error(tCommon("errors.generic_error"));
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedCvId, job, createApplication, onOpenChange, t, tCommon]);

  const handleSaveOnly = useCallback(async () => {
    if (!selectedCvId) return;
    setIsSubmitting(true);
    try {
      await createApplication(job.id, selectedCvId);
      toast.success(t("apply.application_saved"));
      onOpenChange(false);
      setNotes("");
    } catch (err) {
      toast.error(tCommon("errors.generic_error"));
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedCvId, job.id, createApplication, onOpenChange, t, tCommon]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("apply.dialog_title")}</DialogTitle>
          <DialogDescription>
            {t("apply.dialog_description", { title: job.title })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* CV Selection */}
          <div className="space-y-2">
            <Label>{t("apply.select_cv")}</Label>
            <Select value={selectedCvId} onValueChange={handleCvChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("apply.select_cv_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {cvs.map((cv) => (
                  <SelectItem key={cv.id} value={cv.id}>
                    <div className="flex items-center gap-2">
                      <span>{cv.name}</span>
                      {cv.is_primary && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1">
                          {t("apply.primary")}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t("apply.notes_label")}</Label>
            <Textarea
              placeholder={t("apply.notes_placeholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-20"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => void handleSaveOnly()}
            disabled={!selectedCvId || isSubmitting}
          >
            <Save className="h-4 w-4 mr-2" />
            {t("apply.just_save")}
          </Button>
          <Button
            onClick={() => void handleApplyAndOpen()}
            disabled={!selectedCvId || isSubmitting}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            {t("apply.open_and_save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
