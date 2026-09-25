import { useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useApplicationStore } from "@/stores/applicationStore";
import { useCalendar } from "@/features/applications/hooks/useCalendar";
import { useInterviews } from "@/features/applications/hooks/useInterviews";
import { CalendarMonthView } from "@/features/applications/components/CalendarMonthView";
import { CalendarWeekView } from "@/features/applications/components/CalendarWeekView";
import { CalendarDayView } from "@/features/applications/components/CalendarDayView";
import type { CalendarView } from "@/features/applications/hooks/useCalendar";

export function CalendarPage() {
  const { t } = useTranslation("applications");
  const { fetchApplications } = useApplicationStore();
  const { interviews, reload: reloadInterviews } = useInterviews();

  const {
    currentDate,
    view,
    setView,
    goToToday,
    goNext,
    goPrevious,
    goToDate,
    interviewsInView,
  } = useCalendar(interviews);

  useEffect(() => {
    void fetchApplications();
  }, [fetchApplications]);

  const handleDayClick = useCallback(
    (date: Date) => {
      goToDate(date);
      setView("day");
    },
    [goToDate, setView],
  );

  const handleInterviewsChange = useCallback(() => {
    void reloadInterviews();
  }, [reloadInterviews]);

  const handleViewChange = useCallback(
    (value: string) => {
      setView(value as CalendarView);
    },
    [setView],
  );

  const dateDisplay =
    view === "day"
      ? format(currentDate, "PPPP")
      : view === "week"
        ? format(currentDate, "MMMM yyyy")
        : format(currentDate, "MMMM yyyy");

  return (
    <PageContainer>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <CalendarIcon className="size-6 text-primary" />
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                {t("calendar.title")}
              </h2>
              <p className="text-muted-foreground text-sm capitalize">
                {dateDisplay}
              </p>
            </div>
          </div>

          {/* View switcher */}
          <Tabs value={view} onValueChange={handleViewChange}>
            <TabsList>
              <TabsTrigger value="month">{t("calendar.month")}</TabsTrigger>
              <TabsTrigger value="week">{t("calendar.week")}</TabsTrigger>
              <TabsTrigger value="day">{t("calendar.day")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={goPrevious}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            {t("calendar.today")}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={goNext}>
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Calendar content */}
        {view === "month" && (
          <CalendarMonthView
            currentDate={currentDate}
            interviews={interviewsInView}
            onDayClick={handleDayClick}
            onInterviewsChange={handleInterviewsChange}
          />
        )}

        {view === "week" && (
          <CalendarWeekView
            currentDate={currentDate}
            interviews={interviewsInView}
            onInterviewsChange={handleInterviewsChange}
          />
        )}

        {view === "day" && (
          <CalendarDayView
            currentDate={currentDate}
            interviews={interviewsInView}
            onInterviewsChange={handleInterviewsChange}
          />
        )}

        {/* Empty state */}
        {interviews.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarIcon className="size-12 mx-auto mb-4 opacity-50" />
            <p>{t("calendar.no_interviews")}</p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
