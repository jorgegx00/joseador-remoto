import { useState, useCallback, useMemo } from "react";
import type { DragStartEvent, DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import type { ApplicationStatus } from "@/types";
import type { EnrichedApplication } from "./useApplications";

export const PRIMARY_STATUSES: ApplicationStatus[] = [
  "saved",
  "applied",
  "phone_screen",
  "interviewing",
  "technical",
  "final",
  "offered",
];

export const CLOSED_STATUSES: ApplicationStatus[] = [
  "accepted",
  "rejected",
  "withdrawn",
];

export const ALL_STATUSES: ApplicationStatus[] = [
  ...PRIMARY_STATUSES,
  ...CLOSED_STATUSES,
];

export function useKanban(applications: EnrichedApplication[]) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const columns = useMemo(() => {
    const map = new Map<ApplicationStatus, EnrichedApplication[]>();

    for (const status of ALL_STATUSES) {
      map.set(status, []);
    }

    for (const app of applications) {
      const list = map.get(app.status);
      if (list) {
        list.push(app);
      }
    }

    return map;
  }, [applications]);

  const activeApplication = useMemo(() => {
    if (!activeId) return null;
    return applications.find((a) => a.id === activeId) ?? null;
  }, [activeId, applications]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) : null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent): { appId: string; newStatus: ApplicationStatus } | null => {
      const { active, over } = event;
      setActiveId(null);
      setOverId(null);

      if (!over) return null;

      const appId = String(active.id);
      const app = applications.find((a) => a.id === appId);
      if (!app) return null;

      // The over.id could be a column id (status) or another card id
      let targetStatus: ApplicationStatus | undefined;

      // Check if over.id is a status (column droppable)
      if (ALL_STATUSES.includes(over.id as ApplicationStatus)) {
        targetStatus = over.id as ApplicationStatus;
      } else {
        // over.id is a card id, find its status
        const overApp = applications.find((a) => a.id === String(over.id));
        if (overApp) {
          targetStatus = overApp.status;
        }
      }

      if (!targetStatus || targetStatus === app.status) return null;

      return { appId, newStatus: targetStatus };
    },
    [applications],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOverId(null);
  }, []);

  const toggleClosed = useCallback(() => {
    setShowClosed((prev) => !prev);
  }, []);

  return {
    columns,
    activeId,
    activeApplication,
    overId,
    showClosed,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    toggleClosed,
  };
}
