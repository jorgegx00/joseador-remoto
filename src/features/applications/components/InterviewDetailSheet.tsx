import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useNavigate } from "@tanstack/react-router";
import {
  Clock,
  MapPin,
  User,
  ExternalLink,
  FileText,
  Briefcase,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useApplicationStore } from "@/stores/applicationStore";
import { getJobById, getCompanyById } from "@/services/database";
import { getInterviewTypeColor } from "./InterviewCard";
import { InterviewScheduler } from "./InterviewScheduler";
import type { Interview, InterviewOutcome } from "@/types";
import type { Job, Company } from "@/types";

interface InterviewDetailSheetProps {
  interview: Interview | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
}

const OUTCOME_OPTIONS: InterviewOutcome[] = ["passed", "failed", "pending", "cancelled"];

export function InterviewDetailSheet({
  interview,
  open: isOpen,
  onOpenChange,
  onUpdate,
}: InterviewDetailSheetProps) {
  const { t } = useTranslation("applications");
  const navigate = useNavigate();
  const { updateInterview, deleteInterview } = useApplicationStore();

  const [job, setJob] = useState<Job | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [outcome, setOutcome] = useState<InterviewOutcome>("pending");
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

  // Load related job and company data
  useEffect(() => {
    if (!interview) {
      setJob(null);
      setCompany(null);
      return;
    }

    let cancelled = false;

    async function loadRelated() {
      if (!interview) return;
      // Need to find the application first to get job_id
      const { applications } = useApplicationStore.getState();
      const application = applications.find(
        (a) => a.id === interview.application_id,
      );
      if (!application || cancelled) return;

      const jobData = await getJobById(application.job_id).catch(() => null);
      if (cancelled) return;
      setJob(jobData);

      if (jobData) {
        const companyData = await getCompanyById(jobData.company_id).catch(
          () => null,
        );
        if (!cancelled) setCompany(companyData);
      }
    }

    void loadRelated();
    setFeedback(interview.feedback ?? "");
    setOutcome(interview.outcome ?? "pending");

    return () => {
      cancelled = true;
    };
  }, [interview]);

  const handleDelete = useCallback(async () => {
    if (!interview) return;
    await deleteInterview(interview.id);
    onOpenChange(false);
    onUpdate?.();
  }, [interview, deleteInterview, onOpenChange, onUpdate]);

  const handleSaveFeedback = useCallback(async () => {
    if (!interview) return;
    setIsSavingFeedback(true);
    try {
      await updateInterview(interview.id, {
        feedback,
        outcome,
        status: "completed",
      });
      onUpdate?.();
    } finally {
      setIsSavingFeedback(false);
    }
  }, [interview, feedback, outcome, updateInterview, onUpdate]);

  const handleOpenUrl = useCallback(async () => {
    if (interview?.meeting_url) {
      await open(interview.meeting_url);
    }
  }, [interview]);

  const handleStartPrep = useCallback(() => {
    if (!interview) return;
    void navigate({
      to: "/applications/$appId/prep",
      params: { appId: interview.application_id },
    });
    onOpenChange(false);
  }, [interview, navigate, onOpenChange]);

  const handleEditSave = useCallback(() => {
    setShowEditDialog(false);
    onUpdate?.();
  }, [onUpdate]);

  if (!interview) return null;

  const scheduledDate = new Date(interview.scheduled_at);
  const isPast = scheduledDate.getTime() < Date.now();
  const colors = getInterviewTypeColor(interview.interview_type);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("interview.interview_details")}</SheetTitle>
            <SheetDescription>
              {format(scheduledDate, "PPP")}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 px-4 pb-6">
            {/* Type + Status */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                className={colors.bg}
                variant="secondary"
              >
                {t(`interview.type.${interview.interview_type}`)}
              </Badge>
              <Badge variant="outline">
                {t(`interview.status_label.${interview.status}`)}
              </Badge>
            </div>

            {/* Date & Time */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Clock className="size-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {format(scheduledDate, "PPP")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(scheduledDate, "HH:mm")} - {interview.duration_minutes}{" "}
                    {t("interview.duration_option." + String(interview.duration_minutes) as "15" | "30" | "45" | "60" | "90" | "120", { defaultValue: interview.duration_minutes + " min" })}
                  </p>
                </div>
              </div>

              {/* Location / Meeting URL */}
              {(interview.location || interview.meeting_url) && (
                <div className="flex items-center gap-3">
                  <MapPin className="size-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    {interview.location && (
                      <p className="text-sm">{interview.location}</p>
                    )}
                    {interview.meeting_url && (
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={handleOpenUrl}
                      >
                        <ExternalLink className="size-3 mr-1" />
                        {t("interview.open_link")}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Interviewer */}
              {(interview.interviewer_name || interview.interviewer_role) && (
                <div className="flex items-center gap-3">
                  <User className="size-4 text-muted-foreground shrink-0" />
                  <div>
                    {interview.interviewer_name && (
                      <p className="text-sm font-medium">
                        {interview.interviewer_name}
                      </p>
                    )}
                    {interview.interviewer_role && (
                      <p className="text-xs text-muted-foreground">
                        {interview.interviewer_role}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              {interview.notes && (
                <div className="flex items-start gap-3">
                  <FileText className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {interview.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Application info */}
            {job && (
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  {t("interview.application_info")}
                </p>
                <div className="flex items-center gap-2">
                  <Briefcase className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{job.title}</p>
                    {company && (
                      <p className="text-xs text-muted-foreground">
                        {company.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Post-interview feedback section */}
            {isPast && (
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-medium">
                  {t("interview.post_interview")}
                </p>

                <div className="space-y-2">
                  <Label>{t("interview.outcome")}</Label>
                  <Select
                    value={outcome}
                    onValueChange={(v) => setOutcome(v as InterviewOutcome)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTCOME_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {t(`interview.outcome_label.${o}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("interview.feedback")}</Label>
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder={t("interview.feedback_placeholder")}
                    rows={3}
                  />
                </div>

                <Button
                  onClick={handleSaveFeedback}
                  disabled={isSavingFeedback}
                  size="sm"
                  className="w-full"
                >
                  {isSavingFeedback
                    ? t("status.saving", { ns: "common" })
                    : t("interview.save_feedback")}
                </Button>
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-2">
              <Button
                onClick={handleStartPrep}
                className="w-full"
              >
                {t("interview.start_prep")}
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowEditDialog(true)}
                  className="flex-1"
                >
                  {t("actions.edit", { ns: "common" })}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex-1"
                >
                  {t("interview.delete_interview")}
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("interview.edit_interview")}</DialogTitle>
          </DialogHeader>
          <InterviewScheduler
            applicationId={interview.application_id}
            interview={interview}
            onSave={handleEditSave}
            onCancel={() => setShowEditDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t("interview.delete_confirm_title")}
        description={t("interview.delete_confirm_description")}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
