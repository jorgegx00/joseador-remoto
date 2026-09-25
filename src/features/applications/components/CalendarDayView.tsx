import { useMemo, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { format, isSameDay, getHours, getMinutes, setHours, setMinutes } from "date-fns";
import { ExternalLink, User, FileText, Plus } from "lucide-react";
import { open as shellOpen } from "@tauri-apps/plugin-shell";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getJobById, getCompanyById } from "@/services/database";
import { useApplicationStore } from "@/stores/applicationStore";
import { getInterviewTypeColor } from "./InterviewCard";
import { InterviewDetailSheet } from "./InterviewDetailSheet";
import { InterviewScheduler } from "./InterviewScheduler";
import type { Interview } from "@/types";
import type { Job, Company } from "@/types";

const HOURS_RANGE = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 - 20:00
const HOUR_HEIGHT_PX = 80;

interface CalendarDayViewProps {
  currentDate: Date;
  interviews: Interview[];
  onInterviewsChange?: () => void;
}

interface InterviewWithContext {
  interview: Interview;
  job: Job | null;
  company: Company | null;
}

export function CalendarDayView({
  currentDate,
  interviews,
  onInterviewsChange,
}: CalendarDayViewProps) {
  const { t } = useTranslation("applications");
  const { applications } = useApplicationStore();
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [schedulerHour, setSchedulerHour] = useState(9);
  const [enrichedInterviews, setEnrichedInterviews] = useState<InterviewWithContext[]>([]);

  const dayInterviews = useMemo(
    () =>
      interviews
        .filter((i) => isSameDay(new Date(i.scheduled_at), currentDate))
        .sort((a, b) => a.scheduled_at - b.scheduled_at),
    [interviews, currentDate],
  );

  // Enrich interviews with job/company data
  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      const results: InterviewWithContext[] = [];
      for (const interview of dayInterviews) {
        const app = applications.find(
          (a) => a.id === interview.application_id,
        );
        let job: Job | null = null;
        let company: Company | null = null;
        if (app) {
          job = await getJobById(app.job_id).catch(() => null);
          if (job) {
            company = await getCompanyById(job.company_id).catch(() => null);
          }
        }
        if (cancelled) return;
        results.push({ interview, job, company });
      }
      if (!cancelled) setEnrichedInterviews(results);
    }

    void loadContext();
    return () => {
      cancelled = true;
    };
  }, [dayInterviews, applications]);

  const handleEmptySlotClick = useCallback((hour: number) => {
    setSchedulerHour(hour);
    setShowScheduler(true);
  }, []);

  const handleInterviewClick = (interview: Interview) => {
    setSelectedInterview(interview);
    setSheetOpen(true);
  };

  const handleOpenUrl = async (url: string) => {
    await shellOpen(url);
  };

  // Determine which application to use for new interviews on empty slot
  // Use the first available application
  const defaultApplicationId = applications.length > 0 ? applications[0].id : "";

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <div className="relative overflow-auto max-h-[calc(100vh-220px)]">
          <div style={{ height: HOURS_RANGE.length * HOUR_HEIGHT_PX }}>
            {HOURS_RANGE.map((hour) => {
              const slotInterviews = enrichedInterviews.filter(({ interview }) => {
                const h = getHours(new Date(interview.scheduled_at));
                return h === hour;
              });

              return (
                <div
                  key={hour}
                  className="flex border-b"
                  style={{ height: HOUR_HEIGHT_PX }}
                >
                  {/* Time label */}
                  <div className="w-16 shrink-0 border-r flex items-start justify-end pr-2 pt-1">
                    <span className="text-xs text-muted-foreground">
                      {String(hour).padStart(2, "0")}:00
                    </span>
                  </div>

                  {/* Slot content */}
                  <div className="flex-1 relative group">
                    {slotInterviews.length > 0 ? (
                      <div className="p-1 space-y-1 h-full overflow-auto">
                        {slotInterviews.map(({ interview, job, company }) => {
                          const colors = getInterviewTypeColor(
                            interview.interview_type,
                          );
                          const scheduledDate = new Date(interview.scheduled_at);

                          return (
                            <Card
                              key={interview.id}
                              className={cn(
                                "cursor-pointer border-l-4 hover:shadow-md transition-shadow",
                                colors.border,
                              )}
                              onClick={() => handleInterviewClick(interview)}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-sm font-medium">
                                        {format(scheduledDate, "HH:mm")}
                                      </span>
                                      <Badge variant="secondary" className="text-[10px]">
                                        {t(`interview.type.${interview.interview_type}`)}
                                      </Badge>
                                    </div>

                                    {job && (
                                      <p className="text-sm truncate">
                                        {job.title}
                                        {company && (
                                          <span className="text-muted-foreground">
                                            {" "}
                                            - {company.name}
                                          </span>
                                        )}
                                      </p>
                                    )}

                                    {interview.interviewer_name && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <User className="size-3 text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground">
                                          {interview.interviewer_name}
                                        </span>
                                      </div>
                                    )}

                                    {interview.meeting_url && (
                                      <Button
                                        variant="link"
                                        size="sm"
                                        className="h-auto p-0 text-xs mt-1"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void handleOpenUrl(interview.meeting_url);
                                        }}
                                      >
                                        <ExternalLink className="size-3 mr-1" />
                                        {t("interview.open_link")}
                                      </Button>
                                    )}

                                    {interview.notes && (
                                      <div className="flex items-start gap-1 mt-1">
                                        <FileText className="size-3 text-muted-foreground shrink-0 mt-0.5" />
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                          {interview.notes}
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  <Button
                                    size="xs"
                                    variant="secondary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleInterviewClick(interview);
                                    }}
                                  >
                                    {t("interview.start_prep")}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleEmptySlotClick(hour)}
                      >
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Plus className="size-3" />
                          {t("calendar.click_to_add")}
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <InterviewDetailSheet
        interview={selectedInterview}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdate={onInterviewsChange}
      />

      {/* New interview dialog for empty slot clicks */}
      {defaultApplicationId && (
        <Dialog open={showScheduler} onOpenChange={setShowScheduler}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("interview.schedule_interview")}</DialogTitle>
            </DialogHeader>
            <InterviewScheduler
              applicationId={defaultApplicationId}
              onSave={() => {
                setShowScheduler(false);
                onInterviewsChange?.();
              }}
              onCancel={() => setShowScheduler(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
