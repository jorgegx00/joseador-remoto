import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  format,
} from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { InterviewCard } from "./InterviewCard";
import { InterviewDetailSheet } from "./InterviewDetailSheet";
import type { Interview } from "@/types";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

interface CalendarMonthViewProps {
  currentDate: Date;
  interviews: Interview[];
  onDayClick: (date: Date) => void;
  onInterviewsChange?: () => void;
}

export function CalendarMonthView({
  currentDate,
  interviews,
  onDayClick,
  onInterviewsChange,
}: CalendarMonthViewProps) {
  const { t } = useTranslation("applications");
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const rangeStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  }, [currentDate]);

  const interviewsByDay = useMemo(() => {
    const map = new Map<string, Interview[]>();
    for (const interview of interviews) {
      const dateKey = format(new Date(interview.scheduled_at), "yyyy-MM-dd");
      const existing = map.get(dateKey) ?? [];
      existing.push(interview);
      map.set(dateKey, existing);
    }
    return map;
  }, [interviews]);

  const handleInterviewClick = (interview: Interview) => {
    setSelectedInterview(interview);
    setSheetOpen(true);
  };

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        {/* Day of week headers */}
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {DAY_KEYS.map((day) => (
            <div
              key={day}
              className="py-2 px-1 text-center text-xs font-medium text-muted-foreground"
            >
              {t(`calendar.day_names.${day}`)}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const dayInterviews = interviewsByDay.get(dateKey) ?? [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isCurrentDay = isToday(day);

            return (
              <button
                type="button"
                key={dateKey}
                className={cn(
                  "min-h-[100px] border-b border-r p-1 text-left transition-colors hover:bg-accent/30",
                  !isCurrentMonth && "bg-muted/20",
                )}
                onClick={() => onDayClick(day)}
              >
                {/* Day number */}
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center size-6 text-xs rounded-full",
                      !isCurrentMonth && "text-muted-foreground/50",
                      isCurrentDay &&
                        "bg-primary text-primary-foreground font-bold",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {dayInterviews.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                      {dayInterviews.length}
                    </Badge>
                  )}
                </div>

                {/* Interview indicators (max 2) */}
                <div className="space-y-0.5">
                  {dayInterviews.slice(0, 2).map((interview) => (
                    <div
                      key={interview.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInterviewClick(interview);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          handleInterviewClick(interview);
                        }
                      }}
                    >
                      <InterviewCard
                        interview={interview}
                        compact
                      />
                    </div>
                  ))}
                  {dayInterviews.length > 2 && (
                    <p className="text-[10px] text-muted-foreground pl-1">
                      +{dayInterviews.length - 2}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <InterviewDetailSheet
        interview={selectedInterview}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdate={onInterviewsChange}
      />
    </>
  );
}
