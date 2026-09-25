import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { useApplicationStore } from "@/stores/applicationStore";
import { useJobStore } from "@/stores/jobStore";
import { useCvStore } from "@/stores/cvStore";
import { pickDefaultCv } from "@/lib/cv/cv-document";
import type { ApplicationStatus } from "@/types";

interface QuickApplyDialogProps {
  open: boolean;
  onClose: (created: boolean) => void | Promise<void>;
  initialStatus?: ApplicationStatus;
  preselectedJobId?: string;
}

export function QuickApplyDialog({
  open,
  onClose,
  initialStatus = "saved",
  preselectedJobId,
}: QuickApplyDialogProps) {
  const { t } = useTranslation("applications");
  const { t: tCommon } = useTranslation("common");
  const { createApplication } = useApplicationStore();
  const { jobs, fetchJobs } = useJobStore();
  const { cvs, fetchCvs } = useCvStore();

  const [selectedJobId, setSelectedJobId] = useState(preselectedJobId ?? "");
  const [selectedCvId, setSelectedCvId] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>(initialStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load jobs and CVs when dialog opens
  useEffect(() => {
    if (open) {
      void fetchJobs();
      void fetchCvs();
      setStatus(initialStatus);
      if (preselectedJobId) {
        setSelectedJobId(preselectedJobId);
      }
    }
  }, [open, fetchJobs, fetchCvs, initialStatus, preselectedJobId]);

  // Tracks a manual pick so a CV refetch / job change doesn't override the user's choice.
  const cvTouchedRef = useRef(false);

  useEffect(() => {
    if (open) cvTouchedRef.current = false;
  }, [open]);

  // Auto-select the CV tailored for the selected job, else the primary / newest upload.
  useEffect(() => {
    if (!open || cvTouchedRef.current) return;
    const preferred = pickDefaultCv(cvs, selectedJobId || null);
    if (preferred) setSelectedCvId(preferred.id);
  }, [open, cvs, selectedJobId]);

  const handleCvChange = useCallback((id: string) => {
    cvTouchedRef.current = true;
    setSelectedCvId(id);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedJobId || !selectedCvId) return;

    setIsSubmitting(true);
    try {
      await createApplication(selectedJobId, selectedCvId);
      toast.success(t("quick_apply.created"));
      setSelectedJobId("");
      setSelectedCvId("");
      setNotes("");
      await onClose(true);
    } catch {
      toast.error(tCommon("errors.generic_error"));
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedJobId, selectedCvId, createApplication, onClose, t, tCommon]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        void onClose(false);
      }
    },
    [onClose],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("quick_apply.title")}</DialogTitle>
          <DialogDescription>{t("quick_apply.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Job selection */}
          {!preselectedJobId && (
            <div className="space-y-2">
              <Label>{t("quick_apply.select_job")}</Label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={t("quick_apply.select_job_placeholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {jobs.slice(0, 50).map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      <span className="truncate">{job.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* CV selection */}
          <div className="space-y-2">
            <Label>{t("quick_apply.select_cv")}</Label>
            <Select value={selectedCvId} onValueChange={handleCvChange}>
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={t("quick_apply.select_cv_placeholder")}
                />
              </SelectTrigger>
              <SelectContent>
                {cvs.map((cv) => (
                  <SelectItem key={cv.id} value={cv.id}>
                    <div className="flex items-center gap-2">
                      <span>{cv.name}</span>
                      {cv.is_primary && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-4 px-1"
                        >
                          {t("quick_apply.primary")}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Initial status */}
          <div className="space-y-2">
            <Label>{t("quick_apply.initial_status")}</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as ApplicationStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="saved">{t("status.saved")}</SelectItem>
                <SelectItem value="applied">{t("status.applied")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t("quick_apply.notes")}</Label>
            <Textarea
              placeholder={t("quick_apply.notes_placeholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-20"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => void onClose(false)}>
            {tCommon("actions.cancel")}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!selectedJobId || !selectedCvId || isSubmitting}
          >
            {tCommon("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
