import { useTranslation } from "react-i18next";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ApplicationCard } from "./ApplicationCard";
import type { ApplicationStatus } from "@/types";
import type { EnrichedApplication } from "../hooks/useApplications";

interface KanbanColumnProps {
  status: ApplicationStatus;
  applications: EnrichedApplication[];
  isCollapsed?: boolean;
  onAddClick: (status: ApplicationStatus) => void;
}

const COLUMN_ACCENT_COLORS: Record<ApplicationStatus, string> = {
  saved: "bg-gray-400",
  applied: "bg-blue-500",
  phone_screen: "bg-cyan-500",
  interviewing: "bg-indigo-500",
  technical: "bg-purple-500",
  final: "bg-violet-500",
  offered: "bg-green-500",
  accepted: "bg-emerald-500",
  rejected: "bg-red-500",
  withdrawn: "bg-yellow-500",
};

const COLUMN_COUNT_COLORS: Record<ApplicationStatus, string> = {
  saved: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  applied: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  phone_screen: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  interviewing: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  technical: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  final: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
  offered: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  withdrawn: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
};

export function KanbanColumn({
  status,
  applications,
  isCollapsed = false,
  onAddClick,
}: KanbanColumnProps) {
  const { t } = useTranslation("applications");

  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  const itemIds = applications.map((a) => a.id);

  if (isCollapsed) {
    return (
      <div className="min-w-[180px] max-w-[240px] flex-shrink-0">
        <div
          ref={setNodeRef}
          className={`rounded-lg border bg-muted/30 p-3 transition-colors ${
            isOver ? "ring-2 ring-primary/50 bg-primary/5" : ""
          }`}
        >
          <div className={`h-1 rounded-full mb-3 ${COLUMN_ACCENT_COLORS[status]}`} />
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              {t(`status.${status}`)}
            </h3>
            <Badge
              variant="secondary"
              className={`text-[10px] h-5 px-1.5 ${COLUMN_COUNT_COLORS[status]}`}
            >
              {applications.length}
            </Badge>
          </div>
          <SortableContext
            items={itemIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {applications.map((app) => (
                <ApplicationCard key={app.id} application={app} />
              ))}
            </div>
          </SortableContext>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-[290px] max-w-[290px] flex-shrink-0 flex flex-col">
      <div
        ref={setNodeRef}
        className={`rounded-lg border bg-muted/30 flex flex-col h-full transition-colors ${
          isOver ? "ring-2 ring-primary/50 bg-primary/5" : ""
        }`}
      >
        {/* Color accent at top */}
        <div className={`h-1 rounded-t-lg ${COLUMN_ACCENT_COLORS[status]}`} />

        {/* Column header */}
        <div className="flex items-center justify-between p-3 pb-2">
          <h3 className="text-sm font-semibold">
            {t(`status.${status}`)}
          </h3>
          <Badge
            variant="secondary"
            className={`text-xs ${COLUMN_COUNT_COLORS[status]}`}
          >
            {applications.length}
          </Badge>
        </div>

        {/* Cards area */}
        <SortableContext
          items={itemIds}
          strategy={verticalListSortingStrategy}
        >
          {/* Radix wraps the viewport content in a `display: table` div that grows with the
              longest title; force block layout so cards stay column-width and truncate. */}
          <ScrollArea className="flex-1 px-3 [&_[data-slot=scroll-area-viewport]>div]:block!">
            <div className="space-y-2 pb-2 min-h-[100px]">
              {applications.map((app) => (
                <ApplicationCard key={app.id} application={app} />
              ))}
            </div>
          </ScrollArea>
        </SortableContext>

        {/* Add button */}
        <div className="p-3 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={() => onAddClick(status)}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("new_application")}
          </Button>
        </div>
      </div>
    </div>
  );
}
