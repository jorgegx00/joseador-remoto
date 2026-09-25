import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  startOfWeek,
  addDays,
  format,
  isToday,
  isSameDay,
  getHours,
  getMinutes,
} from "date-fns";
import { cn } from "@/lib/utils";
import { getInterviewTypeColor } from "./InterviewCard";
import { InterviewDetailSheet } from "./InterviewDetailSheet";
import type { Interview } from "@/types";

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 - 20:00
const HOUR_HEIGHT_PX = 64;

interface CalendarWeekViewProps {
  currentDate: Date;
  interviews: Interview[];
  onInterviewsChange?: () => void;
}

interface PositionedInterview {
  interview: Interview;
  top: number;
  height: number;
  dayIndex: number;
}

export function CalendarWeekView({
  currentDate,
  interviews,
  onInterviewsChange,
}: CalendarWeekViewProps) {
  const { t } = useTranslation("applications");
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const positioned = useMemo<PositionedInterview[]>(() => {
    return interviews
      .filter((interview) => {
        const d = new Date(interview.scheduled_at);
        return weekDays.some((day) => isSameDay(d, day));
      })
      .map((interview) => {
        const d = new Date(interview.scheduled_at);
        const dayIndex = weekDays.findIndex((day) => isSameDay(d, day));
        const hours = getHours(d);
        const minutes = getMinutes(d);
        const startOffset = hours - 8; // offset from 8:00
        const top = (startOffset + minutes / 60) * HOUR_HEIGHT_PX;
        const durationHours = interview.duration_minutes / 60;
        const height = Math.max(durationHours * HOUR_HEIGHT_PX, 24); // min 24px
        return { interview, top, height, dayIndex };
      })
      .filter((p) => p.dayIndex >= 0);
  }, [interviews, weekDays]);

  const handleInterviewClick = (interview: Interview) => {
    setSelectedInterview(interview);
    setSheetOpen(true);
  };

  const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        {/* Header: day columns */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/50">
          <div className="py-2 px-1" />
          {weekDays.map((day, i) => (
            <div
              key={i}
              className={cn(
                "py-2 px-1 text-center border-l",
                isToday(day) && "bg-primary/10",
              )}
            >
              <p className="text-xs font-medium text-muted-foreground">
                {t(`calendar.day_names.${dayKeys[i]}`)}
              </p>
              <p
                className={cn(
                  "text-lg font-bold",
                  isToday(day) && "text-primary",
                )}
              >
                {format(day, "d")}
              </p>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div className="relative overflow-auto max-h-[calc(100vh-280px)]">
          <div
            className="grid grid-cols-[60px_repeat(7,1fr)]"
            style={{ height: HOURS.length * HOUR_HEIGHT_PX }}
          >
            {/* Hour labels */}
            <div className="relative border-r">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute w-full border-b flex items-start justify-end pr-2 pt-0.5"
                  style={{
                    top: (hour - 8) * HOUR_HEIGHT_PX,
                    height: HOUR_HEIGHT_PX,
                  }}
                >
                  <span className="text-[10px] text-muted-foreground">
                    {String(hour).padStart(2, "0")}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day, dayIdx) => (
              <div
                key={dayIdx}
                className={cn(
                  "relative border-l",
                  isToday(day) && "bg-primary/5",
                )}
              >
                {/* Hour grid lines */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute w-full border-b"
                    style={{
                      top: (hour - 8) * HOUR_HEIGHT_PX,
                      height: HOUR_HEIGHT_PX,
                    }}
                  />
                ))}

                {/* Interview blocks */}
                {positioned
                  .filter((p) => p.dayIndex === dayIdx)
                  .map((p) => {
                    const colors = getInterviewTypeColor(
                      p.interview.interview_type,
                    );
                    const scheduledDate = new Date(p.interview.scheduled_at);
                    return (
                      <button
                        type="button"
                        key={p.interview.id}
                        className={cn(
                          "absolute left-0.5 right-0.5 rounded-md border-l-3 px-1.5 py-0.5 text-left overflow-hidden cursor-pointer transition-opacity hover:opacity-90 z-10",
                          colors.bg,
                          colors.border,
                        )}
                        style={{
                          top: p.top,
                          height: p.height,
                        }}
                        onClick={() => handleInterviewClick(p.interview)}
                      >
                        <p className="text-[10px] font-medium truncate">
                          {t(`interview.type.${p.interview.interview_type}`)}
                        </p>
                        <p className="text-[9px] text-muted-foreground truncate">
                          {format(scheduledDate, "HH:mm")}
                        </p>
                        {p.height > 40 && p.interview.interviewer_name && (
                          <p className="text-[9px] text-muted-foreground truncate">
                            {p.interview.interviewer_name}
                          </p>
                        )}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
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
