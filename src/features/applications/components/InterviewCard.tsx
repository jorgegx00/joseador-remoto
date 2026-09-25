import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Interview, InterviewType } from "@/types";
import type { Job } from "@/types";

const typeColorMap: Record<InterviewType, { bg: string; border: string; dot: string }> = {
  phone_screen: { bg: "bg-gray-100 dark:bg-gray-800", border: "border-l-gray-400", dot: "bg-gray-400" },
  technical: { bg: "bg-blue-50 dark:bg-blue-950", border: "border-l-blue-500", dot: "bg-blue-500" },
  behavioral: { bg: "bg-green-50 dark:bg-green-950", border: "border-l-green-500", dot: "bg-green-500" },
  system_design: { bg: "bg-purple-50 dark:bg-purple-950", border: "border-l-purple-500", dot: "bg-purple-500" },
  hiring_manager: { bg: "bg-amber-50 dark:bg-amber-950", border: "border-l-amber-500", dot: "bg-amber-500" },
  final: { bg: "bg-red-50 dark:bg-red-950", border: "border-l-red-500", dot: "bg-red-500" },
  take_home: { bg: "bg-cyan-50 dark:bg-cyan-950", border: "border-l-cyan-500", dot: "bg-cyan-500" },
};

interface InterviewCardProps {
  interview: Interview;
  job?: Job | null;
  compact?: boolean;
  onClick?: () => void;
}

export function InterviewCard({ interview, job, compact = false, onClick }: InterviewCardProps) {
  const { t } = useTranslation("applications");
  const colors = typeColorMap[interview.interview_type];
  const scheduledDate = new Date(interview.scheduled_at);

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 w-full text-left px-1 py-0.5 rounded text-xs hover:bg-accent/50 transition-colors truncate"
      >
        <span className={cn("size-2 rounded-full shrink-0", colors.dot)} />
        <span className="truncate">
          {t(`interview.type.${interview.interview_type}`)}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border-l-4 p-2 transition-colors hover:ring-1 hover:ring-ring/30",
        colors.bg,
        colors.border,
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {t(`interview.type.${interview.interview_type}`)}
        </Badge>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {format(scheduledDate, "HH:mm")}
        </span>
      </div>
      {job && (
        <p className="text-xs font-medium mt-1 truncate">{job.title}</p>
      )}
      {interview.interviewer_name && (
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {interview.interviewer_name}
        </p>
      )}
    </button>
  );
}

export function getInterviewTypeColor(type: InterviewType) {
  return typeColorMap[type];
}
