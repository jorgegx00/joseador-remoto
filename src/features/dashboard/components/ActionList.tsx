import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow, format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { toast } from "sonner";
import {
  BookOpen,
  CheckCheck,
  Clock,
  Coffee,
  FileCode,
  Heart,
  Mail,
  MoreHorizontal,
  Reply,
  Ghost,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApplicationStore } from "@/stores/applicationStore";
import type { ActionBucket, PipelineActionKind } from "@/lib/applications/follow-up-rules";
import type { ActionItem } from "../hooks/usePipelineActions";

const KIND_ICONS: Record<PipelineActionKind, LucideIcon> = {
  follow_up: Mail,
  thank_you: Heart,
  prepare: BookOpen,
  take_home_due: FileCode,
  maybe_ghosted: Ghost,
};

const BUCKETS: ActionBucket[] = ["attention", "today", "week"];

interface ActionListProps {
  groups: Record<ActionBucket, ActionItem[]>;
  total: number;
  onChanged: () => void;
  /** Opens the message drafter; omitted until an LLM drafter is available. */
  onDraft?: (item: ActionItem) => void;
}

export function ActionList({ groups, total, onChanged, onDraft }: ActionListProps) {
  const { t, i18n } = useTranslation("dashboard");
  const { t: tApps } = useTranslation("applications");
  const navigate = useNavigate();
  const { logMessageSent, markHeardBack, snooze, updateStatus } = useApplicationStore();
  const locale = i18n.language === "es" ? es : enUS;

  const run = useCallback(
    async (fn: () => Promise<void>, message: string) => {
      await fn();
      toast.success(message);
      onChanged();
    },
    [onChanged],
  );

  const openPrep = useCallback(
    (item: ActionItem) =>
      void navigate({
        to: "/applications/$appId/prep",
        params: { appId: item.application_id },
        search: item.interview_id ? { interview: item.interview_id } : {},
      }),
    [navigate],
  );

  const primary = (item: ActionItem) => {
    switch (item.kind) {
      case "prepare":
      case "take_home_due":
        return (
          <Button size="sm" variant="secondary" onClick={() => openPrep(item)}>
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
            {t("actions_list.open_prep")}
          </Button>
        );
      case "follow_up":
      case "thank_you":
        return onDraft ? (
          <Button size="sm" variant="secondary" onClick={() => onDraft(item)}>
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            {t("actions_list.draft")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void run(
                () => logMessageSent(item.application_id, item.kind as "follow_up" | "thank_you", item.interview_id),
                t("actions_list.marked_sent"),
              )
            }
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            {t("actions_list.mark_sent")}
          </Button>
        );
      case "maybe_ghosted":
        return (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void run(
                () => updateStatus(item.application_id, "rejected", "ghosted"),
                t("actions_list.closed_ghosted"),
              )
            }
          >
            <Ghost className="h-3.5 w-3.5 mr-1.5" />
            {t("actions_list.mark_ghosted")}
          </Button>
        );
    }
  };

  const secondary = (item: ActionItem) => {
    const waitingOnThem = item.kind === "follow_up" || item.kind === "maybe_ghosted";
    const canMarkSent = (item.kind === "follow_up" || item.kind === "thank_you") && onDraft;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("actions_list.more")}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canMarkSent && (
            <DropdownMenuItem
              onClick={() =>
                void run(
                  () => logMessageSent(item.application_id, item.kind as "follow_up" | "thank_you", item.interview_id),
                  t("actions_list.marked_sent"),
                )
              }
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              {t("actions_list.mark_sent")}
            </DropdownMenuItem>
          )}
          {waitingOnThem && (
            <>
              <DropdownMenuItem
                onClick={() => void run(() => markHeardBack(item.application_id), t("actions_list.heard_back_done"))}
              >
                <Reply className="h-4 w-4 mr-2" />
                {t("actions_list.heard_back")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void run(
                    () => snooze(item.application_id, item.kind === "maybe_ghosted" ? 7 : 3),
                    t("actions_list.snoozed"),
                  )
                }
              >
                <Clock className="h-4 w-4 mr-2" />
                {item.kind === "maybe_ghosted" ? t("actions_list.snooze_week") : t("actions_list.snooze_3d")}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem
            onClick={() =>
              void navigate({ to: "/applications/$appId", params: { appId: item.application_id } })
            }
          >
            <BookOpen className="h-4 w-4 mr-2" />
            {t("actions_list.view_application")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const when = (item: ActionItem) => {
    if (item.kind === "prepare" || item.kind === "take_home_due") {
      return format(new Date(item.due_at), "EEE d MMM, p", { locale });
    }
    return formatDistanceToNow(new Date(item.due_at), { addSuffix: true, locale });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("actions_list.title")}</CardTitle>
        <CardDescription>
          {total > 0 ? t("actions_list.subtitle", { count: total }) : t("actions_list.subtitle_empty")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <Coffee className="h-5 w-5 flex-shrink-0" />
            <span>{t("actions_list.empty")}</span>
          </div>
        ) : (
          <div className="space-y-5">
            {BUCKETS.filter((b) => groups[b].length > 0).map((bucket) => (
              <div key={bucket} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t(`actions_list.bucket.${bucket}`)}
                </p>
                {groups[bucket].map((item) => {
                  const Icon = KIND_ICONS[item.kind];
                  const company = item.companyName || item.jobTitle || "…";
                  return (
                    <div
                      key={`${item.kind}-${item.application_id}-${item.interview_id ?? ""}`}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {t(`actions_list.kind.${item.kind}`, {
                            company,
                            round: item.interview
                              ? tApps(`interview.type.${item.interview.interview_type}`)
                              : "",
                          })}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[item.jobTitle, when(item)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {primary(item)}
                      {secondary(item)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
