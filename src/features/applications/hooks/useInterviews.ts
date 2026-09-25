import { useEffect, useMemo, useCallback } from "react";
import { useApplicationStore } from "@/stores/applicationStore";
import { isSameDay, isBefore, isAfter, startOfDay } from "date-fns";
import type { Interview } from "@/types";

export function useInterviews() {
  const {
    interviews,
    isLoading,
    error,
    fetchInterviews,
  } = useApplicationStore();

  useEffect(() => {
    void fetchInterviews();
  }, [fetchInterviews]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, Interview[]>();
    for (const interview of interviews) {
      const dateKey = startOfDay(new Date(interview.scheduled_at)).toISOString();
      const existing = groups.get(dateKey) ?? [];
      existing.push(interview);
      groups.set(dateKey, existing);
    }
    // Sort each group by scheduled_at
    for (const [key, value] of groups) {
      groups.set(
        key,
        value.sort((a, b) => a.scheduled_at - b.scheduled_at),
      );
    }
    return groups;
  }, [interviews]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return interviews
      .filter(
        (i) =>
          isAfter(new Date(i.scheduled_at), now) && i.status === "scheduled",
      )
      .sort((a, b) => a.scheduled_at - b.scheduled_at);
  }, [interviews]);

  const past = useMemo(() => {
    const now = new Date();
    return interviews
      .filter(
        (i) =>
          isBefore(new Date(i.scheduled_at), now) ||
          i.status === "completed" ||
          i.status === "cancelled",
      )
      .sort((a, b) => b.scheduled_at - a.scheduled_at);
  }, [interviews]);

  const todayInterviews = useMemo(() => {
    const today = new Date();
    return interviews
      .filter((i) => isSameDay(new Date(i.scheduled_at), today))
      .sort((a, b) => a.scheduled_at - b.scheduled_at);
  }, [interviews]);

  const reload = useCallback(async () => {
    await fetchInterviews();
  }, [fetchInterviews]);

  return {
    interviews,
    groupedByDate,
    upcoming,
    past,
    todayInterviews,
    isLoading,
    error,
    reload,
  };
}
