import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Trash2,
  ExternalLink,
  FileText,
  Building2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/common/StatusBadge";
import { MatchScoreGauge } from "@/components/common/MatchScoreGauge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { ApplicationTimeline } from "@/features/applications/components/ApplicationTimeline";
import { ApplicationNotes } from "@/features/applications/components/ApplicationNotes";
import { useApplicationStore } from "@/stores/applicationStore";
import {
  getApplicationById,
  getJobById,
  getCompanyById,
  getCvById,
  getInterviewsByApplicationId,
} from "@/services/database";
import type {
  Application,
  ApplicationStatus,
  Interview,
  InterviewOutcome,
} from "@/types";
import type { Job, Company } from "@/types";
import type { CvRecord } from "@/types";

const STATUS_OPTIONS: ApplicationStatus[] = [
  "saved",
  "applied",
  "phone_screen",
  "interviewing",
  "technical",
  "final",
  "offered",
  "accepted",
  "rejected",
  "withdrawn",
];

export function ApplicationDetailPage() {
  const { t, i18n } = useTranslation("applications");
  const { t: tCommon } = useTranslation("common");
  const { appId } = useParams({ from: "/applications/$appId" });
  const navigate = useNavigate();
  const {
    updateStatus,
    deleteApplication,
    updateInterview,
  } = useApplicationStore();

  const [application, setApplication] = useState<Application | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [cv, setCv] = useState<CvRecord | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const dateLocale = i18n.language === "es" ? es : enUS;

  // Load application data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const app = await getApplicationById(appId);
        if (cancelled || !app) {
          if (!cancelled) setIsLoading(false);
          return;
        }
        setApplication(app);

        const [jobData, interviewData] = await Promise.all([
          getJobById(app.job_id).catch(() => null),
          getInterviewsByApplicationId(appId).catch(() => []),
        ]);

        if (cancelled) return;

        setJob(jobData);
        setInterviews(interviewData);

        if (jobData) {
          const companyData = await getCompanyById(jobData.company_id).catch(
            () => null,
          );
          if (!cancelled) setCompany(companyData);
        }

        const cvData = await getCvById(app.cv_id).catch(() => null);
        if (!cancelled) setCv(cvData);
      } catch {
        // Error handled by empty state
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [appId]);

  const handleStatusChange = useCallback(
    async (newStatus: string) => {
      if (!application) return;
      await updateStatus(application.id, newStatus as ApplicationStatus);
      setApplication((prev) =>
        prev
          ? {
              ...prev,
              status: newStatus as ApplicationStatus,
              updated_at: Date.now(),
            }
          : null,
      );
      toast.success(
        t("board.moved_to", { status: t(`status.${newStatus}`) }),
      );
    },
    [application, updateStatus, t],
  );

  const handleDelete = useCallback(async () => {
    if (!application) return;
    await deleteApplication(application.id);
    toast.success(t("detail.deleted"));
    void navigate({ to: "/applications" });
  }, [application, deleteApplication, navigate, t]);

  const handleInterviewOutcome = useCallback(
    async (interviewId: string, outcome: InterviewOutcome) => {
      await updateInterview(interviewId, { outcome });
      setInterviews((prev) =>
        prev.map((i) =>
          i.id === interviewId ? { ...i, outcome, updated_at: Date.now() } : i,
        ),
      );
    },
    [updateInterview],
  );

  const handleInterviewFeedback = useCallback(
    async (interviewId: string, feedback: string) => {
      await updateInterview(interviewId, { feedback });
      setInterviews((prev) =>
        prev.map((i) =>
          i.id === interviewId
            ? { ...i, feedback, updated_at: Date.now() }
            : i,
        ),
      );
    },
    [updateInterview],
  );

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingSkeleton variant="detail-page" />
      </PageContainer>
    );
  }

  if (!application) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <p className="text-muted-foreground">{tCommon("errors.not_found")}</p>
          <Link to="/applications">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {tCommon("actions.back")}
            </Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  const jobTitle =
    job?.title ?? `Application #${application.id.slice(0, 8)}`;
  const companyName = company?.name ?? "";

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/applications">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {tCommon("actions.back")}
              </Button>
            </Link>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{jobTitle}</h2>
              <div className="flex items-center gap-2 mt-1">
                {companyName && (
                  <span className="text-sm text-muted-foreground">
                    {companyName}
                  </span>
                )}
                <StatusBadge status={application.status} />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Select
              value={application.status}
              onValueChange={(v) => void handleStatusChange(v)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Link
              to="/applications/$appId/prep"
              params={{ appId: application.id }}
            >
              <Button variant="outline" size="sm">
                <BookOpen className="h-4 w-4 mr-2" />
                {t("detail.prep")}
              </Button>
            </Link>
            <Button variant="outline" size="sm">
              <Calendar className="h-4 w-4 mr-2" />
              {t("schedule_interview")}
            </Button>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          {/* Main content (70%) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>{t("detail.timeline")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ApplicationTimeline
                  application={application}
                  interviews={interviews}
                />
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle>{t("detail.notes")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ApplicationNotes
                  applicationId={application.id}
                  initialNotes={application.notes}
                />
              </CardContent>
            </Card>

            {/* Interviews */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t("detail.interviews")}</CardTitle>
                <Button variant="outline" size="sm">
                  <Calendar className="h-4 w-4 mr-2" />
                  {t("schedule_interview")}
                </Button>
              </CardHeader>
              <CardContent>
                {interviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {t("detail.no_interviews")}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {interviews.map((interview) => (
                      <Card key={interview.id}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                {tCommon(
                                  `interview_types.${interview.interview_type}`,
                                )}
                              </Badge>
                              <Badge
                                variant={
                                  interview.status === "completed"
                                    ? "secondary"
                                    : interview.status === "cancelled"
                                      ? "destructive"
                                      : "default"
                                }
                              >
                                {t(
                                  `interview.status_values.${interview.status}`,
                                  { defaultValue: interview.status },
                                )}
                              </Badge>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {format(
                                new Date(interview.scheduled_at),
                                "PPp",
                                { locale: dateLocale },
                              )}
                            </span>
                          </div>

                          {interview.interviewer_name && (
                            <p className="text-sm">
                              <span className="text-muted-foreground">
                                {t("interview.interviewer")}:{" "}
                              </span>
                              {interview.interviewer_name}
                              {interview.interviewer_role &&
                                ` (${interview.interviewer_role})`}
                            </p>
                          )}

                          {(interview.location || interview.meeting_url) && (
                            <p className="text-sm">
                              <span className="text-muted-foreground">
                                {t("interview.location")}:{" "}
                              </span>
                              {interview.meeting_url ? (
                                <Button
                                  variant="link"
                                  className="h-auto p-0 text-sm"
                                  onClick={() =>
                                    void open(interview.meeting_url)
                                  }
                                >
                                  {interview.meeting_url}
                                </Button>
                              ) : (
                                interview.location
                              )}
                            </p>
                          )}

                          <Separator />

                          {/* Outcome select */}
                          <div className="space-y-2">
                            <Label className="text-xs">
                              {t("interview.outcome")}
                            </Label>
                            <Select
                              value={interview.outcome}
                              onValueChange={(v) =>
                                void handleInterviewOutcome(
                                  interview.id,
                                  v as InterviewOutcome,
                                )
                              }
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">
                                  {t("interview.outcome_values.pending")}
                                </SelectItem>
                                <SelectItem value="passed">
                                  {t("interview.outcome_values.passed")}
                                </SelectItem>
                                <SelectItem value="failed">
                                  {t("interview.outcome_values.failed")}
                                </SelectItem>
                                <SelectItem value="cancelled">
                                  {t("interview.outcome_values.cancelled")}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Feedback */}
                          <div className="space-y-2">
                            <Label className="text-xs">
                              {t("interview.feedback")}
                            </Label>
                            <Textarea
                              value={interview.feedback}
                              onChange={(e) =>
                                void handleInterviewFeedback(
                                  interview.id,
                                  e.target.value,
                                )
                              }
                              placeholder={t(
                                "interview.feedback_placeholder",
                              )}
                              className="min-h-[80px]"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar (30%) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Job summary */}
            {job && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {t("detail.job")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm font-medium">{job.title}</p>
                  {companyName && (
                    <p className="text-sm text-muted-foreground">
                      {companyName}
                    </p>
                  )}
                  {job.location && (
                    <p className="text-xs text-muted-foreground">
                      {job.location}
                    </p>
                  )}
                  {job.source_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => void open(job.source_url)}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-2" />
                      {t("actions.open_posting")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* CV used */}
            {cv && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {t("detail.cv_used")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium">{cv.name}</p>
                  <Link to="/cv/$cvId" params={{ cvId: cv.id }}>
                    <Button variant="link" className="h-auto p-0 text-xs">
                      {t("detail.view_cv")}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Interview prep */}
            <Card>
              <CardContent className="p-4">
                <Link
                  to="/applications/$appId/prep"
                  params={{ appId: application.id }}
                >
                  <Button variant="outline" className="w-full">
                    <BookOpen className="h-4 w-4 mr-2" />
                    {t("detail.prep")}
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Glassdoor reviews link */}
            {company?.glassdoor_url && (
              <Card>
                <CardContent className="p-4">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => void open(company.glassdoor_url)}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t("detail.glassdoor_reviews")}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Applied date */}
            {application.applied_at && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">
                    {t("detail.applied_date")}
                  </p>
                  <p className="text-sm font-medium mt-1">
                    {format(
                      new Date(application.applied_at),
                      "PPP",
                      { locale: dateLocale },
                    )}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Delete */}
            <Card className="border-destructive/30">
              <CardContent className="p-4">
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setConfirmDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("detail.delete_application")}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={t("detail.confirm_delete_title")}
        description={t("detail.confirm_delete_description")}
        variant="destructive"
        onConfirm={() => void handleDelete()}
      />
    </PageContainer>
  );
}
