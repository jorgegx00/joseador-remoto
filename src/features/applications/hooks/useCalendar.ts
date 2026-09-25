import { useState, useCallback, useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  addMonths,
  addWeeks,
  addDays,
  subMonths,
  subWeeks,
  subDays,
  eachDayOfInterval,
  isSameDay,
  isWithinInterval,
} from "date-fns";
import type { Interview } from "@/types";

export type CalendarView = "month" | "week" | "day";

export function useCalendar(interviews: Interview[]) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>("month");

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const goNext = useCallback(() => {
    setCurrentDate((prev) => {
      if (view === "month") return addMonths(prev, 1);
      if (view === "week") return addWeeks(prev, 1);
      return addDays(prev, 1);
    });
  }, [view]);

  const goPrevious = useCallback(() => {
    setCurrentDate((prev) => {
      if (view === "month") return subMonths(prev, 1);
      if (view === "week") return subWeeks(prev, 1);
      return subDays(prev, 1);
    });
  }, [view]);

  const goToDate = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  const viewRange = useMemo(() => {
    if (view === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      // Include partial weeks at start and end
      const rangeStart = startOfWeek(monthStart, { weekStartsOn: 1 });
      const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
      return { start: rangeStart, end: rangeEnd };
    }
    if (view === "week") {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      return { start: weekStart, end: weekEnd };
    }
    // Day view
    return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
  }, [currentDate, view]);

  const daysInView = useMemo(() => {
    return eachDayOfInterval({ start: viewRange.start, end: viewRange.end });
  }, [viewRange]);

  const interviewsInView = useMemo(() => {
    return interviews.filter((interview) => {
      const interviewDate = new Date(interview.scheduled_at);
      return isWithinInterval(interviewDate, {
        start: viewRange.start,
        end: viewRange.end,
      });
    });
  }, [interviews, viewRange]);

  const getInterviewsForDay = useCallback(
    (day: Date) => {
      return interviews.filter((interview) => {
        const interviewDate = new Date(interview.scheduled_at);
        return isSameDay(interviewDate, day);
      });
    },
    [interviews],
  );

  return {
    currentDate,
    view,
    setView,
    goToToday,
    goNext,
    goPrevious,
    goToDate,
    viewRange,
    daysInView,
    interviewsInView,
    getInterviewsForDay,
  };
}
