import { toast } from "sonner";
import { sendNotification } from "@/services/notifications";
import { getAllApplicationEvents, getAllApplications, getAllInterviews } from "@/services/database";
import { computeAllActions } from "@/lib/applications/follow-up-rules";
import type { Interview } from "@/types";
import i18n from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Active timer tracking — so we can cancel if the component unmounts or
// the interview is rescheduled / deleted.
// ---------------------------------------------------------------------------

const activeTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

function clearTimersForInterview(interviewId: string): void {
  const timers = activeTimers.get(interviewId);
  if (timers) {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    activeTimers.delete(interviewId);
  }
}

// ---------------------------------------------------------------------------
// scheduleInterviewReminder
// ---------------------------------------------------------------------------

export function scheduleInterviewReminder(interview: Interview): void {
  clearTimersForInterview(interview.id);

  const now = Date.now();
  const scheduledMs = interview.scheduled_at;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const t = i18n.getFixedT(null, "onboarding");

  // 24 hours before
  const twentyFourHBefore = scheduledMs - 24 * 60 * 60 * 1000;
  if (twentyFourHBefore > now) {
    const delay = twentyFourHBefore - now;
    const timer = setTimeout(() => {
      const title = t("notifications.interview_reminder_title");
      const body = t("notifications.interview_24h");
      toast.info(body, { description: new Date(scheduledMs).toLocaleString() });
      void sendNotification(title, body);
    }, delay);
    timers.push(timer);
  }

  // 1 hour before
  const oneHBefore = scheduledMs - 60 * 60 * 1000;
  if (oneHBefore > now) {
    const delay = oneHBefore - now;
    const timer = setTimeout(() => {
      const title = t("notifications.interview_reminder_title");
      const body = t("notifications.interview_1h");
      toast.warning(body, {
        description: new Date(scheduledMs).toLocaleString(),
        duration: 10000,
      });
      void sendNotification(title, body);
    }, delay);
    timers.push(timer);
  }

  if (timers.length > 0) {
    activeTimers.set(interview.id, timers);
  }
}

// ---------------------------------------------------------------------------
// notifyNewJobs
// ---------------------------------------------------------------------------

export function notifyNewJobs(count: number, source: string): void {
  if (count <= 0) return;

  const t = i18n.getFixedT(null, "onboarding");
  const title = t("notifications.new_jobs_title");
  const body = t("notifications.new_jobs_body", { count, source });

  toast.success(body, { description: source });
  void sendNotification(title, body);
}

// ---------------------------------------------------------------------------
// notifyAtsComplete
// ---------------------------------------------------------------------------

export function notifyAtsComplete(score: number): void {
  const t = i18n.getFixedT(null, "onboarding");
  const title = t("notifications.ats_complete_title");
  const body = t("notifications.ats_complete_body", { score });

  toast.success(body);
  void sendNotification(title, body);
}

// ---------------------------------------------------------------------------
// checkAndNotifyUpcomingInterviews
// ---------------------------------------------------------------------------

export async function checkAndNotifyUpcomingInterviews(): Promise<void> {
  try {
    const interviews = await getAllInterviews();
    const now = Date.now();
    const twentyFourHFromNow = now + 24 * 60 * 60 * 1000;

    const upcoming = interviews.filter(
      (interview) =>
        interview.status === "scheduled" &&
        interview.scheduled_at > now &&
        interview.scheduled_at <= twentyFourHFromNow
    );

    // Schedule in-session reminders for all upcoming interviews
    for (const interview of upcoming) {
      scheduleInterviewReminder(interview);
    }

    // Show a summary notification if there are upcoming interviews
    if (upcoming.length > 0) {
      const t = i18n.getFixedT(null, "onboarding");
      const title = t("notifications.upcoming_interviews");
      const body = t("notifications.upcoming_interviews_body", {
        count: upcoming.length,
      });
      toast.info(body, { duration: 8000 });
      void sendNotification(title, body);
    }
  } catch (error) {
    console.error("[notifications] Failed to check upcoming interviews:", error);
  }
}

// ---------------------------------------------------------------------------
// checkAndNotifyPendingFollowUps — one gentle nudge per app launch
// ---------------------------------------------------------------------------

export async function checkAndNotifyPendingFollowUps(): Promise<void> {
  try {
    const [applications, interviews, events] = await Promise.all([
      getAllApplications(),
      getAllInterviews(),
      getAllApplicationEvents(),
    ]);
    const now = Date.now();
    const pending = computeAllActions(applications, interviews, events, now).filter(
      (a) => (a.kind === "follow_up" || a.kind === "thank_you") && a.due_at <= now,
    );
    if (pending.length === 0) return;

    const t = i18n.getFixedT(null, "onboarding");
    const title = t("notifications.follow_ups_title");
    const body = t("notifications.follow_ups_body", { count: pending.length });
    toast.info(body, { duration: 8000 });
    void sendNotification(title, body);
  } catch (error) {
    console.error("[notifications] Failed to check follow-ups:", error);
  }
}
