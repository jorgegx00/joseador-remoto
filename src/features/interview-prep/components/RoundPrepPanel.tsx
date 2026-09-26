import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { AlertTriangle, BookMarked, CalendarDays, HelpCircle, MessagesSquare, Mic, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { produceRoundPack } from "@/services/prep-generation";
import type { RoundPack } from "@/lib/llm/prep-schemas";
import type { MaterialLanguage } from "@/lib/llm/language";
import type { Interview, InterviewType, Job, ParsedCv } from "@/types";
import { usePrepDocument } from "../hooks/usePrepDocument";
import { PrepGenerateHeader } from "./PrepGenerateHeader";
import { NeedsInputCard } from "./NeedsInputCard";

export const ROUND_TYPES: InterviewType[] = [
  "phone_screen",
  "technical",
  "system_design",
  "behavioral",
  "hiring_manager",
  "final",
  "take_home",
];

/** Select value for a round: an interview id, or `type:<type>` for practice without a scheduled round. */
export function roundKey(sel: { interviewId?: string; type?: InterviewType }): string {
  return sel.interviewId ? sel.interviewId : `type:${sel.type ?? "phone_screen"}`;
}

export function resolveRound(
  key: string,
  interviews: Interview[],
): { interview: Interview | null; type: InterviewType } {
  if (key.startsWith("type:")) return { interview: null, type: key.slice(5) as InterviewType };
  const interview = interviews.find((i) => i.id === key) ?? null;
  return { interview, type: interview?.interview_type ?? "phone_screen" };
}

export function defaultRoundKey(interviews: Interview[], preferred?: string): string {
  if (preferred && interviews.some((i) => i.id === preferred)) return preferred;
  const next = interviews
    .filter((i) => i.status === "scheduled" && i.scheduled_at > Date.now())
    .sort((a, b) => a.scheduled_at - b.scheduled_at)[0];
  return next ? next.id : "type:phone_screen";
}

interface RoundSelectProps {
  value: string;
  onChange: (key: string) => void;
  interviews: Interview[];
}

export function RoundSelect({ value, onChange, interviews }: RoundSelectProps) {
  const { t, i18n } = useTranslation("interview-prep");
  const { t: tApps } = useTranslation("applications");
  const locale = i18n.language === "es" ? es : enUS;
  const scheduled = interviews.filter((i) => i.status !== "cancelled");
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-[320px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {scheduled.length > 0 && (
          <SelectGroup>
            <SelectLabel>{t("round_prep.scheduled_rounds")}</SelectLabel>
            {scheduled.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {tApps(`interview.type.${i.interview_type}`)} · {format(new Date(i.scheduled_at), "EEE d MMM", { locale })}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        <SelectGroup>
          <SelectLabel>{t("round_prep.practice_rounds")}</SelectLabel>
          {ROUND_TYPES.map((type) => (
            <SelectItem key={type} value={`type:${type}`}>
              {tApps(`interview.type.${type}`)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

interface RoundPrepPanelProps {
  applicationId: string;
  cvId: string | null;
  cv: ParsedCv | null;
  job: Job | null;
  interviews: Interview[];
  /** Selected round (see roundKey); controlled by the prep page so the quick plan follows it. */
  roundKey: string;
  onRoundKeyChange: (key: string) => void;
  language: MaterialLanguage;
}

export function RoundPrepPanel({
  applicationId,
  cvId,
  cv,
  job,
  interviews,
  roundKey: key,
  onRoundKeyChange: setKey,
  language,
}: RoundPrepPanelProps) {
  const { t } = useTranslation("interview-prep");
  const navigate = useNavigate();
  const { interview, type } = useMemo(() => resolveRound(key, interviews), [key, interviews]);
  const { doc, isLoading, isGenerating, hasLlm, generate, cancel } = usePrepDocument<RoundPack>(
    applicationId,
    "round_pack",
    key,
  );
  const pack = doc?.content ?? null;

  const handleGenerate = () => {
    if (!cv || !job) return;
    void generate(language, (llm, signal) =>
      produceRoundPack(llm, { applicationId, cvId, cv, job }, { interview, type }, language, signal),
    );
  };

  const practice = () =>
    void navigate({
      to: "/applications/$appId/mock",
      params: { appId: applicationId },
      search: interview ? { interview: interview.id } : { type },
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <RoundSelect value={key} onChange={setKey} interviews={interviews} />
        <Button variant="secondary" size="sm" onClick={practice}>
          <Mic className="mr-2 h-4 w-4" />
          {t("round_prep.practice")}
        </Button>
      </div>

      <PrepGenerateHeader
        title={t("round_prep.title")}
        description={t("round_prep.description")}
        hasContent={!!pack}
        isGenerating={isGenerating}
        disabled={!cv || !job || !hasLlm}
        updatedAt={doc?.updated_at}
        language={doc?.language}
        onGenerate={handleGenerate}
        onCancel={cancel}
      />

      {!hasLlm && <p className="text-sm text-muted-foreground">{t("prep_ai.no_llm")}</p>}
      {(!cv || !job) && <p className="text-sm text-muted-foreground">{t("prep_ai.missing_cv_or_job")}</p>}

      {(isLoading || (isGenerating && !pack)) && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!isLoading && !pack && !isGenerating && cv && job && hasLlm && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("round_prep.empty")}
        </p>
      )}

      {pack && (
        <div className={cn("space-y-4", isGenerating && "opacity-50")}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4" />
                {t("round_prep.focus")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">{pack.focus}</CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <HelpCircle className="h-4 w-4" />
                {t("round_prep.likely_questions")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {pack.likely_questions.map((q, i) => (
                  <AccordionItem key={i} value={String(i)}>
                    <AccordionTrigger className="text-left text-sm">{q.question}</AccordionTrigger>
                    <AccordionContent className="space-y-2 text-sm">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">{t("round_prep.why_asked")}:</span> {q.why_asked}
                      </p>
                      <ul className="list-disc space-y-1 pl-5">
                        {q.answer_outline.map((b, j) => (
                          <li key={j}>{b}</li>
                        ))}
                      </ul>
                      {q.story && (
                        <Badge variant="secondary" className="gap-1">
                          <BookMarked className="h-3 w-3" />
                          {q.story}
                        </Badge>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          {pack.study_plan.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarDays className="h-4 w-4" />
                  {t("round_prep.study_plan")}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {pack.study_plan.map((d, i) => (
                  <div key={i} className="space-y-1 rounded-lg border p-3">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      {t("round_prep.day", { day: d.day })}
                    </p>
                    <p className="text-sm font-medium">{d.topic}</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm">
                      {d.tasks.map((task, j) => (
                        <li key={j}>{task}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">{d.why}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <MessagesSquare className="h-4 w-4" />
                  {t("round_prep.questions_to_ask")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {pack.questions_to_ask.map((q, i) => (
                    <li key={i}>
                      <p>{q.question}</p>
                      <p className="text-xs text-muted-foreground">{q.why}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            {pack.pitfalls.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    {t("round_prep.pitfalls")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {pack.pitfalls.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          <NeedsInputCard items={pack.needs_input} />
        </div>
      )}
    </div>
  );
}
