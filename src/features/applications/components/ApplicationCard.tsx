import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDistanceToNow } from "date-fns";
import { es, enUS } from "date-fns/locale";
import {
  GripVertical,
  MoreHorizontal,
  Eye,
  ExternalLink,
  BookOpen,
  Archive,
  CalendarPlus,
} from "lucide-react";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MatchScoreGauge } from "@/components/common/MatchScoreGauge";
import { useApplicationStore, type ScheduleResult } from "@/stores/applicationStore";
import { InterviewScheduler } from "./InterviewScheduler";
import type { EnrichedApplication } from "../hooks/useApplications";

interface ApplicationCardProps {
  application: EnrichedApplication;
  isDragOverlay?: boolean;
}

const COMPANY_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-amber-500",
];

function getCompanyColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COMPANY_COLORS[Math.abs(hash) % COMPANY_COLORS.length];
}

export function ApplicationCard({
  application,
  isDragOverlay = false,
}: ApplicationCardProps) {
  const { t, i18n } = useTranslation("applications");
  const navigate = useNavigate();
  const { updateStatus } = useApplicationStore();
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: application.id,
    disabled: isDragOverlay,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const companyName = application.company?.name ?? application.job?.company_id ?? "";
  const jobTitle = application.job?.title ?? `Application #${application.id.slice(0, 8)}`;
  const sourceUrl = application.job?.source_url ?? application.job?.apply_url ?? "";
  const dateLocale = i18n.language === "es" ? es : enUS;

  const appliedDate = application.applied_at
    ? formatDistanceToNow(new Date(application.applied_at), {
        addSuffix: true,
        locale: dateLocale,
      })
    : application.created_at
      ? formatDistanceToNow(new Date(application.created_at), {
          addSuffix: true,
          locale: dateLocale,
        })
      : null;

  const nextInterview = application.interviews.find(
    (i) => i.status === "scheduled" && i.scheduled_at > Date.now(),
  );

  const cvName = application.cv?.name ?? null;

  const handleViewDetails = useCallback(() => {
    void navigate({
      to: "/applications/$appId",
      params: { appId: application.id },
    });
  }, [navigate, application.id]);

  const handleOpenPosting = useCallback(async () => {
    if (sourceUrl) {
      await open(sourceUrl);
    }
  }, [sourceUrl]);

  const handleInterviewPrep = useCallback(() => {
    void navigate({
      to: "/applications/$appId/prep",
      params: { appId: application.id },
    });
  }, [navigate, application.id]);

  const handleScheduled = useCallback(
    (result?: ScheduleResult) => {
      setScheduleOpen(false);
      toast.success(
        result?.advancedTo
          ? t("interview.scheduled_and_moved", { status: t(`status.${result.advancedTo}`) })
          : t("interview.scheduled"),
      );
    },
    [t],
  );

  const handleArchive = useCallback(async () => {
    await updateStatus(application.id, "withdrawn");
  }, [updateStatus, application.id]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const cardContent = (
    <Card
      role={isDragOverlay ? undefined : "button"}
      tabIndex={isDragOverlay ? undefined : 0}
      aria-label={t("actions.view_details")}
      onClick={isDragOverlay ? undefined : handleViewDetails}
      onKeyDown={(e) => {
        if (!isDragOverlay && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleViewDetails();
        }
      }}
      className={`min-w-0 overflow-hidden cursor-pointer hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isDragOverlay ? "shadow-lg ring-2 ring-primary/30 cursor-grabbing" : ""
      } ${application.closed_reason === "ghosted" ? "opacity-60" : ""}`}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          {/* Drag handle */}
          <div
            className="mt-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
            onClick={stop}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-4 w-4" />
          </div>

          {/* Company avatar */}
          <div
            className={`flex-shrink-0 h-8 w-8 rounded-full ${getCompanyColor(companyName)} flex items-center justify-center text-white text-xs font-bold`}
          >
            {companyName.charAt(0).toUpperCase() || "?"}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" title={jobTitle}>{jobTitle}</p>
            <p className="text-xs text-muted-foreground truncate">
              {companyName}
            </p>
          </div>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                aria-label={t("actions.more")}
                onClick={stop}
                onKeyDown={stop}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={stop}>
              <DropdownMenuItem onClick={handleViewDetails}>
                <Eye className="h-4 w-4 mr-2" />
                {t("actions.view_details")}
              </DropdownMenuItem>
              {sourceUrl && (
                <DropdownMenuItem onClick={() => void handleOpenPosting()}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t("actions.open_posting")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
                <CalendarPlus className="h-4 w-4 mr-2" />
                {t("schedule_interview")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleInterviewPrep}>
                <BookOpen className="h-4 w-4 mr-2" />
                {t("actions.interview_prep")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleArchive()}>
                <Archive className="h-4 w-4 mr-2" />
                {t("actions.archive")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          {appliedDate && (
            <span className="text-[11px] text-muted-foreground">
              {appliedDate}
            </span>
          )}

          {nextInterview && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
              {t("card.next_interview", {
                date: formatDistanceToNow(
                  new Date(nextInterview.scheduled_at),
                  { addSuffix: true, locale: dateLocale },
                ),
              })}
            </Badge>
          )}

          {application.closed_reason === "ghosted" && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground">
              {t("closed_reason.ghosted")}
            </Badge>
          )}

          {cvName && (
            <Badge
              variant="secondary"
              className="text-[10px] h-5 px-1.5"
            >
              {cvName}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (isDragOverlay) {
    return cardContent;
  }

  return (
    <div ref={setNodeRef} style={style}>
      {cardContent}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("interview.schedule_interview")} — {jobTitle}
            </DialogTitle>
          </DialogHeader>
          {scheduleOpen && (
            <InterviewScheduler
              applicationId={application.id}
              onSave={handleScheduled}
              onCancel={() => setScheduleOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
