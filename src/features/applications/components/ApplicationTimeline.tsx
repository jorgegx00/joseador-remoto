import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import {
  Bookmark,
  Send,
  Phone,
  Users,
  Code,
  Trophy,
  Gift,
  CheckCircle,
  XCircle,
  LogOut,
  Calendar,
  Mail,
  CircleCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Application, ApplicationEvent, ApplicationStatus, Interview } from "@/types";

interface ApplicationTimelineProps {
  application: Application;
  interviews: Interview[];
  /** Recorded history; applications created before it existed fall back to a reconstruction. */
  events?: ApplicationEvent[];
}

interface TimelineEvent {
  id: string;
  date: number;
  type: "status_change" | "interview" | "created";
  icon: LucideIcon;
  iconColor: string;
  title: string;
  description: string;
}

const STATUS_ICONS: Record<ApplicationStatus, LucideIcon> = {
  saved: Bookmark,
  applied: Send,
  phone_screen: Phone,
  interviewing: Users,
  technical: Code,
  final: Trophy,
  offered: Gift,
  accepted: CheckCircle,
  rejected: XCircle,
  withdrawn: LogOut,
};

const STATUS_DOT_COLORS: Record<ApplicationStatus, string> = {
  saved: "text-gray-500 bg-gray-100 dark:bg-gray-800",
  applied: "text-blue-500 bg-blue-100 dark:bg-blue-900",
  phone_screen: "text-cyan-500 bg-cyan-100 dark:bg-cyan-900",
  interviewing: "text-indigo-500 bg-indigo-100 dark:bg-indigo-900",
  technical: "text-purple-500 bg-purple-100 dark:bg-purple-900",
  final: "text-violet-500 bg-violet-100 dark:bg-violet-900",
  offered: "text-green-500 bg-green-100 dark:bg-green-900",
  accepted: "text-emerald-500 bg-emerald-100 dark:bg-emerald-900",
  rejected: "text-red-500 bg-red-100 dark:bg-red-900",
  withdrawn: "text-yellow-500 bg-yellow-100 dark:bg-yellow-900",
};

export function ApplicationTimeline({
  application,
  interviews,
  events: history = [],
}: ApplicationTimelineProps) {
  const { t, i18n } = useTranslation("applications");
  const dateLocale = i18n.language === "es" ? es : enUS;

  const events = useMemo(() => {
    const result: TimelineEvent[] = [];

    // Application created event
    result.push({
      id: "created",
      date: application.created_at,
      type: "created",
      icon: Bookmark,
      iconColor: STATUS_DOT_COLORS.saved,
      title: t("timeline.created"),
      description: t("timeline.application_created"),
    });

    const statusEvents = history.filter((e) => e.type === "status_change" && e.to_status);
    const recordedApplied = statusEvents.some((e) => e.to_status === "applied");

    for (const e of statusEvents) {
      const to = e.to_status!;
      result.push({
        id: e.id,
        date: e.created_at,
        type: "status_change",
        icon: STATUS_ICONS[to],
        iconColor: STATUS_DOT_COLORS[to],
        title: t("timeline.status_changed"),
        description: e.payload.closed_reason === "ghosted"
          ? t("timeline.marked_ghosted")
          : t("timeline.moved_to", { status: t(`status.${to}`) }),
      });
    }

    for (const e of history) {
      if (e.type === "message_sent" && e.payload.message_kind) {
        result.push({
          id: e.id,
          date: e.created_at,
          type: "status_change",
          icon: Mail,
          iconColor: "text-sky-500 bg-sky-100 dark:bg-sky-900",
          title: t(`timeline.message_sent.${e.payload.message_kind}`),
          description: "",
        });
      } else if (e.type === "interview_completed") {
        result.push({
          id: e.id,
          date: e.created_at,
          type: "interview",
          icon: CircleCheck,
          iconColor: "text-emerald-500 bg-emerald-100 dark:bg-emerald-900",
          title: t("timeline.interview_completed"),
          description: e.payload.interview_type
            ? t(`interview.type.${e.payload.interview_type}`, { defaultValue: e.payload.interview_type })
            : "",
        });
      }
    }

    // Applied event (legacy applications without recorded history)
    if (application.applied_at && !recordedApplied) {
      result.push({
        id: "applied",
        date: application.applied_at,
        type: "status_change",
        icon: Send,
        iconColor: STATUS_DOT_COLORS.applied,
        title: t("timeline.status_changed"),
        description: t("timeline.moved_to", {
          status: t("status.applied"),
        }),
      });
    }

    // Current status event (if beyond applied)
    const advancedStatuses: ApplicationStatus[] = [
      "phone_screen",
      "interviewing",
      "technical",
      "final",
      "offered",
      "accepted",
      "rejected",
      "withdrawn",
    ];

    if (statusEvents.length === 0 && advancedStatuses.includes(application.status)) {
      const StatusIcon = STATUS_ICONS[application.status];
      result.push({
        id: `status-${application.status}`,
        date: application.updated_at,
        type: "status_change",
        icon: StatusIcon,
        iconColor: STATUS_DOT_COLORS[application.status],
        title: t("timeline.status_changed"),
        description: t("timeline.moved_to", {
          status: t(`status.${application.status}`),
        }),
      });
    }

    // Interview events
    for (const interview of interviews) {
      result.push({
        id: `interview-${interview.id}`,
        date: interview.scheduled_at,
        type: "interview",
        icon: Calendar,
        iconColor: "text-blue-500 bg-blue-100 dark:bg-blue-900",
        title: t("timeline.interview_scheduled"),
        description: t("timeline.interview_detail", {
          type: t(`interview.types.${interview.interview_type}`, {
            defaultValue: interview.interview_type,
          }),
          interviewer: interview.interviewer_name || t("timeline.unknown_interviewer"),
        }),
      });
    }

    // Sort by date descending (most recent first)
    result.sort((a, b) => b.date - a.date);

    return result;
  }, [application, interviews, history, t]);

  return (
    <div className="relative space-y-0">
      {events.map((event, index) => {
        const Icon = event.icon;
        const isLast = index === events.length - 1;

        return (
          <div key={event.id} className="relative flex gap-4 pb-6">
            {/* Connecting line */}
            {!isLast && (
              <div className="absolute left-4 top-10 w-0.5 h-[calc(100%-24px)] bg-border" />
            )}

            {/* Icon dot */}
            <div
              className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${event.iconColor}`}
            >
              <Icon className="h-4 w-4" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-sm font-medium">{event.title}</p>
              {event.description && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {event.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(event.date), "PPp", { locale: dateLocale })}
              </p>
            </div>
          </div>
        );
      })}

      {events.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t("timeline.no_events")}
        </p>
      )}
    </div>
  );
}
