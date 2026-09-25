import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format, setHours, setMinutes, startOfDay } from "date-fns";
import { CalendarIcon, ExternalLink } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  COMMON_TIMEZONES,
  formatTimeInZone,
  localTimezone,
  timezoneLabel,
} from "@/lib/applications/timezones";
import { useApplicationStore, type ScheduleResult } from "@/stores/applicationStore";
import type { Interview, InterviewType } from "@/types";

const INTERVIEW_TYPES: InterviewType[] = [
  "phone_screen",
  "technical",
  "behavioral",
  "system_design",
  "hiring_manager",
  "final",
  "take_home",
];

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;
// 06–23: cross-timezone rounds (e.g. Europe from the Americas) often fall early or late.
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);
const UNKNOWN_TZ = "__unknown__";
const MINUTES = [0, 15, 30, 45] as const;

interface InterviewSchedulerProps {
  applicationId: string;
  interview?: Interview;
  /** Receives the scheduling result for new interviews (undefined on edit). */
  onSave: (result?: ScheduleResult) => void;
  onCancel: () => void;
}

export function InterviewScheduler({
  applicationId,
  interview,
  onSave,
  onCancel,
}: InterviewSchedulerProps) {
  const { t, i18n } = useTranslation("applications");
  const { scheduleInterview, updateInterview } = useApplicationStore();

  const existingDate = interview ? new Date(interview.scheduled_at) : null;

  const [date, setDate] = useState<Date | undefined>(
    existingDate ? startOfDay(existingDate) : undefined,
  );
  const [hour, setHour] = useState<string>(
    existingDate ? String(existingDate.getHours()) : "9",
  );
  const [minute, setMinute] = useState<string>(
    existingDate ? String(existingDate.getMinutes()) : "0",
  );
  const [duration, setDuration] = useState<string>(
    interview ? String(interview.duration_minutes) : "60",
  );
  const [interviewType, setInterviewType] = useState<string>(
    interview?.interview_type ?? "",
  );
  const [meetingUrl, setMeetingUrl] = useState(interview?.meeting_url ?? "");
  const [interviewerName, setInterviewerName] = useState(
    interview?.interviewer_name ?? "",
  );
  const [interviewerRole, setInterviewerRole] = useState(
    interview?.interviewer_role ?? "",
  );
  const [interviewerTz, setInterviewerTz] = useState(
    interview?.interviewer_timezone || UNKNOWN_TZ,
  );
  const [notes, setNotes] = useState(interview?.notes ?? "");
  const [dateError, setDateError] = useState(false);
  const [typeError, setTypeError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const handleSave = useCallback(async () => {
    let hasError = false;

    if (!date) {
      setDateError(true);
      hasError = true;
    } else {
      setDateError(false);
    }

    if (!interviewType) {
      setTypeError(true);
      hasError = true;
    } else {
      setTypeError(false);
    }

    if (hasError) return;

    setIsSaving(true);

    const scheduledDate = setMinutes(
      setHours(date!, parseInt(hour, 10)),
      parseInt(minute, 10),
    );
    const scheduledAt = scheduledDate.getTime();
    const timezone = interviewerTz === UNKNOWN_TZ ? "" : interviewerTz;

    try {
      if (interview) {
        await updateInterview(interview.id, {
          scheduled_at: scheduledAt,
          duration_minutes: parseInt(duration, 10),
          interview_type: interviewType as InterviewType,
          meeting_url: meetingUrl,
          interviewer_name: interviewerName,
          interviewer_role: interviewerRole,
          interviewer_timezone: timezone,
          notes,
        });
        onSave();
      } else {
        const result = await scheduleInterview(applicationId, {
          application_id: applicationId,
          scheduled_at: scheduledAt,
          duration_minutes: parseInt(duration, 10),
          interview_type: interviewType as InterviewType,
          location: "",
          meeting_url: meetingUrl,
          interviewer_name: interviewerName,
          interviewer_role: interviewerRole,
          interviewer_timezone: timezone,
          notes,
          feedback: "",
          outcome: "pending",
          status: "scheduled",
        });
        if (!result) {
          toast.error(t("interview.save_failed"));
          return;
        }
        onSave(result);
      }
    } catch {
      // Error is handled by the store
    } finally {
      setIsSaving(false);
    }
  }, [
    date,
    hour,
    minute,
    duration,
    interviewType,
    meetingUrl,
    interviewerName,
    interviewerRole,
    interviewerTz,
    notes,
    interview,
    applicationId,
    scheduleInterview,
    updateInterview,
    onSave,
    t,
  ]);

  const tzOptions = useMemo(() => {
    const zones: string[] = [...COMMON_TIMEZONES];
    for (const z of [localTimezone(), interviewerTz]) {
      if (z && z !== UNKNOWN_TZ && !zones.includes(z)) zones.push(z);
    }
    return zones;
  }, [interviewerTz]);

  const theirTime = useMemo(() => {
    if (!date || interviewerTz === UNKNOWN_TZ || interviewerTz === localTimezone()) return null;
    const ms = setMinutes(setHours(date, parseInt(hour, 10)), parseInt(minute, 10)).getTime();
    return formatTimeInZone(ms, interviewerTz, i18n.language);
  }, [date, hour, minute, interviewerTz, i18n.language]);

  const handleOpenLink = useCallback(async () => {
    if (meetingUrl) {
      await open(meetingUrl);
    }
  }, [meetingUrl]);

  return (
    <div className="space-y-4">
      {/* Date picker */}
      <div className="space-y-2">
        <Label className={cn(dateError && "text-destructive")}>
          {t("interview.date")} *
        </Label>
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !date && "text-muted-foreground",
                dateError && "border-destructive",
              )}
            >
              <CalendarIcon className="mr-2 size-4" />
              {date ? format(date, "PPP") : t("interview.date")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => {
                setDate(d);
                setDateError(false);
                setDatePickerOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        {dateError && (
          <p className="text-xs text-destructive">{t("interview.date_required")}</p>
        )}
      </div>

      {/* Time: hour + minute */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{t("interview.hour")}</Label>
          <Select value={hour} onValueChange={setHour}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {String(h).padStart(2, "0")}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("interview.minute")}</Label>
          <Select value={minute} onValueChange={setMinute}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MINUTES.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  :{String(m).padStart(2, "0")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Interviewer timezone: the picker above is always local time */}
      <div className="space-y-2">
        <Label>{t("interview.interviewer_timezone")}</Label>
        <Select value={interviewerTz} onValueChange={setInterviewerTz}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNKNOWN_TZ}>{t("interview.timezone_unknown")}</SelectItem>
            {tzOptions.map((z) => (
              <SelectItem key={z} value={z}>
                {timezoneLabel(z)}
                {z === localTimezone() ? ` (${t("interview.timezone_yours")})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {theirTime && (
          <p className="text-xs text-muted-foreground">
            {t("interview.their_time", { time: theirTime })}
          </p>
        )}
      </div>

      {/* Duration */}
      <div className="space-y-2">
        <Label>{t("interview.duration")}</Label>
        <Select value={duration} onValueChange={setDuration}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATION_OPTIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {t(`interview.duration_option.${d}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Interview Type */}
      <div className="space-y-2">
        <Label className={cn(typeError && "text-destructive")}>
          {t("interview.interview_type")} *
        </Label>
        <Select
          value={interviewType}
          onValueChange={(v) => {
            setInterviewType(v);
            setTypeError(false);
          }}
        >
          <SelectTrigger className={cn("w-full", typeError && "border-destructive")}>
            <SelectValue placeholder={t("interview.interview_type")} />
          </SelectTrigger>
          <SelectContent>
            {INTERVIEW_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`interview.type.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {typeError && (
          <p className="text-xs text-destructive">{t("interview.type_required")}</p>
        )}
      </div>

      {/* Meeting URL */}
      <div className="space-y-2">
        <Label>{t("interview.meeting_url")}</Label>
        <div className="flex gap-2">
          <Input
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="https://..."
            className="flex-1"
          />
          {meetingUrl && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleOpenLink}
              title={t("interview.open_link")}
            >
              <ExternalLink className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Interviewer Name */}
      <div className="space-y-2">
        <Label>{t("interview.interviewer_name")}</Label>
        <Input
          value={interviewerName}
          onChange={(e) => setInterviewerName(e.target.value)}
        />
      </div>

      {/* Interviewer Role */}
      <div className="space-y-2">
        <Label>{t("interview.interviewer_role")}</Label>
        <Input
          value={interviewerRole}
          onChange={(e) => setInterviewerRole(e.target.value)}
          placeholder={t("interview.interviewer_role_placeholder")}
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>{t("interview.preparation_notes")}</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("interview.notes_placeholder")}
          rows={3}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          {t("actions.cancel", { ns: "common" })}
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving
            ? t("status.saving", { ns: "common" })
            : t("actions.save", { ns: "common" })}
        </Button>
      </div>
    </div>
  );
}
