import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useApplicationStore } from "@/stores/applicationStore";
import { KanbanColumn } from "./KanbanColumn";
import { ApplicationCard } from "./ApplicationCard";
import { QuickApplyDialog } from "./QuickApplyDialog";
import {
  useKanban,
  PRIMARY_STATUSES,
  CLOSED_STATUSES,
} from "../hooks/useKanban";
import type { EnrichedApplication } from "../hooks/useApplications";
import type { ApplicationStatus } from "@/types";

interface KanbanBoardProps {
  applications: EnrichedApplication[];
  onReload: () => Promise<void>;
}

export function KanbanBoard({ applications, onReload }: KanbanBoardProps) {
  const { t } = useTranslation("applications");
  const { updateStatus } = useApplicationStore();
  const [quickApplyOpen, setQuickApplyOpen] = useState(false);
  const [quickApplyStatus, setQuickApplyStatus] = useState<ApplicationStatus>("saved");

  const {
    columns,
    activeApplication,
    showClosed,
    handleDragStart,
    handleDragOver,
    handleDragEnd: kanbanDragEnd,
    handleDragCancel,
    toggleClosed,
  } = useKanban(applications);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleDragEnd = useCallback(
    async (event: Parameters<typeof kanbanDragEnd>[0]) => {
      const result = kanbanDragEnd(event);
      if (!result) return;

      const { appId, newStatus } = result;

      // Optimistic update is handled by the store
      await updateStatus(appId, newStatus);
      toast.success(
        t("board.moved_to", { status: t(`status.${newStatus}`) }),
      );
    },
    [kanbanDragEnd, updateStatus, t],
  );

  const handleAddClick = useCallback((status: ApplicationStatus) => {
    setQuickApplyStatus(status);
    setQuickApplyOpen(true);
  }, []);

  const handleQuickApplyClose = useCallback(
    async (created: boolean) => {
      setQuickApplyOpen(false);
      if (created) {
        await onReload();
      }
    },
    [onReload],
  );

  const closedCount = CLOSED_STATUSES.reduce(
    (sum, s) => sum + (columns.get(s)?.length ?? 0),
    0,
  );

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={(event) => void handleDragEnd(event)}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 280px)" }}>
          {/* Primary columns */}
          {PRIMARY_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              applications={columns.get(status) ?? []}
              onAddClick={handleAddClick}
            />
          ))}

          {/* Closed section separator */}
          <div className="flex-shrink-0 flex flex-col items-center">
            <Separator orientation="vertical" className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              className="my-2 text-xs text-muted-foreground"
              onClick={toggleClosed}
            >
              {showClosed ? (
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 mr-1" />
              )}
              {t("board.closed_section", { count: closedCount })}
            </Button>
            <Separator orientation="vertical" className="flex-1" />
          </div>

          {/* Closed columns */}
          {showClosed &&
            CLOSED_STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                applications={columns.get(status) ?? []}
                isCollapsed
                onAddClick={handleAddClick}
              />
            ))}
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeApplication ? (
            <ApplicationCard
              application={activeApplication}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <QuickApplyDialog
        open={quickApplyOpen}
        onClose={handleQuickApplyClose}
        initialStatus={quickApplyStatus}
      />
    </>
  );
}
