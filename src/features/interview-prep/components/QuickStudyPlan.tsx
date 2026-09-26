import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, formatDistanceToNowStrict, isToday, isTomorrow } from "date-fns";
import { es, enUS } from "date-fns/locale";
import {
  AlertCircle,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Loader2,
  NotebookPen,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  BUDGET_OPTIONS,
  localDateKey,
  planWindow,
  tasksForDate,
  type PlanDay,
  type PlanTask,
  type StudyPlanDoc,
} from "@/lib/applications/study-plan";
import type { PlanSource } from "@/lib/llm/prep-schemas";
import { useStudyPlanStore } from "@/stores/studyPlanStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Interview } from "@/types";

/** Subscribes to one interview's plan and triggers load / auto-generation. */
export function useStudyPlan(interview: Interview | null) {
  const id = interview?.id ?? "";
  const doc = useStudyPlanStore((s) => s.docs[id]);
  const outdated = useStudyPlanStore((s) => s.outdated[id] ?? false);
  const status = useStudyPlanStore((s) => s.status[id] ?? "idle");
  const step = useStudyPlanStore((s) => s.step[id] ?? null);
  const ensure = useStudyPlanStore((s) => s.ensure);
  const notLoaded = doc === undefined;

  useEffect(() => {
    if (interview && notLoaded) void ensure(interview);
    // Re-run when the round changes or the cached plan was invalidated.
  }, [id, interview?.scheduled_at, interview?.interview_type, interview?.status, notLoaded, ensure]);

  return { doc: doc ?? null, loaded: !notLoaded, outdated, status, step };
}

type Variant = "inline" | "compact" | "full";

interface QuickStudyPlanProps {
  interview: Interview;
  variant?: Variant;
  /** Full variant: jump to the prep material a task comes from. */
  onOpenSource?: (source: PlanSource) => void;
  className?: string;
}

function TaskRow({
  task,
  done,
  onToggle,
  onOpenSource,
}: {
  task: PlanTask;
  done: boolean;
  onToggle: () => void;
  onOpenSource?: (source: PlanSource) => void;
}) {
  const { t } = useTranslation("interview-prep");
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <Checkbox checked={done} onCheckedChange={onToggle} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className={cn("text-sm", done && "text-muted-foreground line-through")}>{task.title}</span>
        <span className="ml-1.5 text-xs text-muted-foreground">· {t("quick_plan.minutes", { count: task.minutes })}</span>
        {!done && task.detail && <span className="block text-xs text-muted-foreground">{task.detail}</span>}
      </span>
      {onOpenSource ? (
        <Badge
          variant="outline"
          className="h-5 shrink-0 cursor-pointer px-1.5 text-[10px] hover:bg-accent"
          onClick={(e) => {
            e.preventDefault();
            onOpenSource(task.source);
          }}
        >
          {t(`quick_plan.source.${task.source}`)}
        </Badge>
      ) : (
        <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
          {t(`quick_plan.source.${task.source}`)}
        </Badge>
      )}
    </label>
  );
}

function dayLabel(date: string, t: (k: string) => string, locale: Locale): string {
  const d = new Date(`${date}T12:00:00`);
  if (isToday(d)) return t("quick_plan.today");
  if (isTomorrow(d)) return t("quick_plan.tomorrow");
  return format(d, "EEE d MMM", { locale });
}

type Locale = typeof enUS;

function DayBlock({
  day,
  doc,
  interviewId,
  onOpenSource,
  highlight,
}: {
  day: PlanDay;
  doc: StudyPlanDoc;
  interviewId: string;
  onOpenSource?: (source: PlanSource) => void;
  highlight: boolean;
}) {
  const { t, i18n } = useTranslation("interview-prep");
  const toggleTask = useStudyPlanStore((s) => s.toggleTask);
  const locale = i18n.language === "es" ? es : enUS;
  const total = day.tasks.reduce((n, task) => n + task.minutes, 0);
  const done = day.tasks.filter((task) => doc.progress[task.id]).length;
  return (
    <div className={cn("rounded-lg border p-3", highlight && "border-primary/50 bg-primary/5")}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {dayLabel(day.date, t, locale)} <span className="font-normal text-muted-foreground">· {day.focus}</span>
        </p>
        <span className="shrink-0 text-xs text-muted-foreground">
          {done}/{day.tasks.length} · {t("quick_plan.minutes", { count: total })}
        </span>
      </div>
      {day.tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          done={!!doc.progress[task.id]}
          onToggle={() => void toggleTask(interviewId, task.id)}
          onOpenSource={onOpenSource}
        />
      ))}
    </div>
  );
}

function FullPlan({
  doc,
  interviewId,
  onOpenSource,
}: {
  doc: StudyPlanDoc;
  interviewId: string;
  onOpenSource?: (source: PlanSource) => void;
}) {
  const { t } = useTranslation("interview-prep");
  const [showPast, setShowPast] = useState(false);
  const today = localDateKey(Date.now());
  const past = doc.plan.days.filter((d) => d.date < today);
  const upcoming = doc.plan.days.filter((d) => d.date >= today);
  const { plan } = doc;

  return (
    <div className="space-y-4">
      {plan.key_messages.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("quick_plan.key_messages")}
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {plan.key_messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        {past.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowPast((v) => !v)}>
            {showPast ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
            {t("quick_plan.earlier_days", { count: past.length })}
          </Button>
        )}
        {(showPast ? [...past, ...upcoming] : upcoming).map((day) => (
          <DayBlock
            key={day.date}
            day={day}
            doc={doc}
            interviewId={interviewId}
            onOpenSource={onOpenSource}
            highlight={day.date === today}
          />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border p-3 text-sm">
          <p className="mb-2 flex items-center gap-1.5 font-medium">
            <NotebookPen className="h-4 w-4" />
            {t("quick_plan.cheat_sheet")}
          </p>
          <p className="mb-2 italic">“{plan.cheat_sheet.opener}”</p>
          {plan.cheat_sheet.stories.length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground">{t("quick_plan.stories")}</p>
              <ul className="mb-2 list-disc pl-5">
                {plan.cheat_sheet.stories.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {plan.cheat_sheet.numbers.length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground">{t("quick_plan.numbers")}</p>
              <ul className="mb-2 list-disc pl-5">
                {plan.cheat_sheet.numbers.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {plan.cheat_sheet.questions_to_ask.length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground">{t("quick_plan.ask_them")}</p>
              <ul className="list-disc pl-5">
                {plan.cheat_sheet.questions_to_ask.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border p-3 text-sm">
            <p className="mb-2 flex items-center gap-1.5 font-medium">
              <ClipboardCheck className="h-4 w-4" />
              {t("quick_plan.day_of")}
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {plan.day_of.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          {plan.not_ready.length > 0 && (
            <div className="rounded-lg border border-dashed p-3 text-sm">
              <p className="mb-2 flex items-center gap-1.5 font-medium">
                <AlertCircle className="h-4 w-4" />
                {t("quick_plan.not_ready")}
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {plan.not_ready.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function QuickStudyPlan({ interview, variant = "compact", onOpenSource, className }: QuickStudyPlanProps) {
  const { t, i18n } = useTranslation("interview-prep");
  const { t: tApps } = useTranslation("applications");
  const locale = i18n.language === "es" ? es : enUS;
  const { doc, loaded, outdated, status, step } = useStudyPlan(interview);
  const generate = useStudyPlanStore((s) => s.generate);
  const setBudget = useStudyPlanStore((s) => s.setBudget);
  const cancel = useStudyPlanStore((s) => s.cancel);
  const defaultBudget = useStudyPlanStore((s) => s.defaultBudget);
  const hasLlm = useSettingsStore((s) => s.llm.active_provider !== null);
  const [expanded, setExpanded] = useState(variant === "full");

  const win = planWindow(Date.now(), interview.scheduled_at);
  if (!win || interview.status === "cancelled" || interview.status === "completed") return null;

  const content = doc?.content ?? null;
  const today = localDateKey(Date.now());
  const todays = content ? tasksForDate(content, today) : [];
  const nextDay = content?.plan.days.find((d) => d.date > today) ?? null;
  const generating = status === "generating";
  const round = tApps(`interview.type.${interview.interview_type}`);
  const when = new Date(interview.scheduled_at);
  const countdown = t("quick_plan.countdown", {
    round,
    in: win.daysUntil === 0
      ? t("quick_plan.today_at", { time: format(when, "p", { locale }) })
      : `${formatDistanceToNowStrict(when, { locale, unit: "day", roundingMethod: "ceil" })} · ${format(when, "EEE p", { locale })}`,
  });

  const statusLine = generating ? (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {t(`quick_plan.step.${step ?? "queued"}`)}
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => cancel(interview.id)}>
        <X className="mr-1 h-3.5 w-3.5" />
        {t("prep_ai.cancel")}
      </Button>
    </div>
  ) : !content && loaded ? (
    hasLlm ? (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          {status === "error"
            ? t("quick_plan.failed")
            : win.startsLater
              ? t("quick_plan.ready_later")
              : t("quick_plan.none")}
        </span>
        <Button size="sm" variant="outline" className="h-7" onClick={() => void generate(interview)}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          {t("quick_plan.generate")}
        </Button>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">{t("prep_ai.no_llm")}</p>
    )
  ) : null;

  const todayList = content && (
    <div>
      {todays.length > 0 ? (
        todays.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            done={!!content.progress[task.id]}
            onToggle={() => void useStudyPlanStore.getState().toggleTask(interview.id, task.id)}
          />
        ))
      ) : win.mode === "same_day" ? (
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {content.plan.day_of.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      ) : nextDay ? (
        <p className="text-sm text-muted-foreground">
          {t("quick_plan.next_day", {
            day: format(new Date(`${nextDay.date}T12:00:00`), "EEE d MMM", { locale }),
            focus: nextDay.focus,
          })}
        </p>
      ) : null}
    </div>
  );

  // Dashboard row: just today's tasks (the row already names the round and date).
  if (variant === "inline") {
    return <div className={cn("space-y-1", className)}>{statusLine ?? todayList}</div>;
  }

  const refreshButton = content && !generating && (
    <Button
      size="sm"
      variant={outdated ? "secondary" : "ghost"}
      className="h-7 px-2"
      onClick={() => void generate(interview)}
      title={t("quick_plan.refresh")}
    >
      <RefreshCw className="h-3.5 w-3.5" />
      {outdated && <span className="ml-1.5">{t("quick_plan.outdated")}</span>}
    </Button>
  );

  if (variant === "compact") {
    return (
      <div className={cn("space-y-2 rounded-lg border bg-muted/30 p-3", className)}>
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{countdown}</span>
          </p>
          {refreshButton}
        </div>
        {statusLine}
        {content && (
          <>
            <p className="text-sm font-medium">{content.plan.headline}</p>
            {todays.length > 0 && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("quick_plan.today")}</p>
            )}
            {todayList}
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
              {expanded ? t("quick_plan.hide_full") : t("quick_plan.show_full")}
            </Button>
            {expanded && <FullPlan doc={content} interviewId={interview.id} onOpenSource={onOpenSource} />}
          </>
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" />
              {t("quick_plan.title")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{countdown}</p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(content?.meta.budget ?? defaultBudget)}
              onValueChange={(v) => void setBudget(interview, Number(v))}
              disabled={generating || !hasLlm}
            >
              <SelectTrigger className="h-8 w-[150px]" aria-label={t("quick_plan.budget")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUDGET_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {t(`quick_plan.budget_option.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {refreshButton}
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-3", generating && content && "opacity-60")}>
        {statusLine}
        {content && (
          <>
            <p className="font-medium">{content.plan.headline}</p>
            {win.startsLater && <p className="text-xs text-muted-foreground">{t("quick_plan.starts_on", { date: format(new Date(`${content.meta.dates[0]}T12:00:00`), "EEE d MMM", { locale }) })}</p>}
            {expanded && <FullPlan doc={content} interviewId={interview.id} onOpenSource={onOpenSource} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}
