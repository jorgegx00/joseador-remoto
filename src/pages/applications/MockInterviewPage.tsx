import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { toast } from "sonner";
import { ulid } from "ulid";
import {
  ArrowLeft,
  BookMarked,
  Check,
  Loader2,
  Mic,
  RotateCcw,
  Send,
  Square,
  Trash2,
  User,
  X,
} from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { resolveMaterialLanguage, toMaterialLanguage, type MaterialLanguage } from "@/lib/llm/language";
import { insertStarStory } from "@/services/database";
import { useApplicationPrepData } from "@/features/interview-prep/hooks/useApplicationPrepData";
import { useMockInterview } from "@/features/interview-prep/hooks/useMockInterview";
import {
  RoundSelect,
  defaultRoundKey,
  resolveRound,
  roundKey,
} from "@/features/interview-prep/components/RoundPrepPanel";
import type { MockCoaching, MockReport } from "@/lib/llm/prep-schemas";
import type { MockSession, ParsedCv } from "@/types";

const QUESTION_COUNTS = [4, 6, 8] as const;

function CoachingNote({ coaching }: { coaching: MockCoaching }) {
  const { t } = useTranslation("interview-prep");
  const checks: Array<[boolean, string]> = [
    [coaching.uses_evidence, t("mock.check.evidence")],
    [coaching.has_result, t("mock.check.result")],
    [coaching.relevant_to_role, t("mock.check.relevance")],
  ];
  return (
    <div className="ml-10 space-y-2 rounded-lg border border-dashed bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap gap-3 text-xs">
        {checks.map(([ok, label]) => (
          <span key={label} className={cn("flex items-center gap-1", ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
            {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {label}
          </span>
        ))}
      </div>
      {coaching.what_worked.length > 0 && (
        <p>
          <span className="font-medium">{t("mock.worked")}:</span> {coaching.what_worked.join(" ")}
        </p>
      )}
      {coaching.to_improve.length > 0 && (
        <p>
          <span className="font-medium">{t("mock.improve")}:</span> {coaching.to_improve.join(" ")}
        </p>
      )}
      {coaching.cv_fact_to_use && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{t("mock.cv_fact")}:</span> {coaching.cv_fact_to_use}
        </p>
      )}
      {coaching.stronger_opening && (
        <p className="text-xs italic text-muted-foreground">
          <span className="font-medium not-italic">{t("mock.stronger_opening")}:</span> “{coaching.stronger_opening}”
        </p>
      )}
    </div>
  );
}

function ReportView({
  report,
  cvId,
  cv,
  onAgain,
}: {
  report: MockReport;
  cvId: string | null;
  cv: ParsedCv | null;
  onAgain: () => void;
}) {
  const { t } = useTranslation("interview-prep");
  const [added, setAdded] = useState<Set<number>>(new Set());

  const addStory = async (i: number) => {
    if (!cvId) return;
    const story = report.stories_to_prepare[i];
    const source = story.source.toLowerCase();
    const idx = cv?.experience.findIndex(
      (e) => (e.company && source.includes(e.company.toLowerCase())) || (e.title && source.includes(e.title.toLowerCase())),
    );
    const now = Date.now();
    try {
      await insertStarStory({
        id: ulid(),
        cv_id: cvId,
        experience_index: idx !== undefined && idx >= 0 ? idx : 0,
        title: story.title,
        situation: "",
        task: "",
        action: "",
        result: "",
        skills_demonstrated: [story.competency],
        is_user_edited: false,
        created_at: now,
        updated_at: now,
      });
      setAdded((prev) => new Set(prev).add(i));
      toast.success(t("mock.story_added"));
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("mock.report_title")}</CardTitle>
        <CardDescription>{report.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 font-medium">{t("mock.strengths")}</p>
            <ul className="list-disc space-y-1 pl-5">
              {report.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-medium">{t("mock.recurring_gaps")}</p>
            <ul className="list-disc space-y-1 pl-5">
              {report.recurring_gaps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
        {report.stories_to_prepare.length > 0 && (
          <div>
            <p className="mb-1 font-medium">{t("mock.stories_to_prepare")}</p>
            <div className="space-y-2">
              {report.stories_to_prepare.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-lg border p-2">
                  <div className="min-w-0">
                    <p className="font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.competency} · {s.source}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!cvId || added.has(i)}
                    onClick={() => void addStory(i)}
                  >
                    <BookMarked className="mr-2 h-3.5 w-3.5" />
                    {added.has(i) ? t("mock.story_added_short") : t("mock.add_story")}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        {report.review_topics.length > 0 && (
          <div>
            <p className="mb-1 font-medium">{t("mock.review_topics")}</p>
            <div className="flex flex-wrap gap-1.5">
              {report.review_topics.map((topic, i) => (
                <Badge key={i} variant="secondary">
                  {topic}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <Button onClick={onAgain}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {t("mock.again")}
        </Button>
      </CardContent>
    </Card>
  );
}

export function MockInterviewPage() {
  const { t, i18n } = useTranslation("interview-prep");
  const { t: tApps } = useTranslation("applications");
  const { appId } = useParams({ from: "/applications/$appId/mock" });
  const search = useSearch({ from: "/applications/$appId/mock" });
  const { application, job, cv, interviews, isLoading } = useApplicationPrepData(appId);
  const parsedCv = cv?.parsed_data ?? null;
  const locale = i18n.language === "es" ? es : enUS;

  const mock = useMockInterview(appId, parsedCv, job);
  const { session, busy } = mock;

  const [key, setKey] = useState<string>(() =>
    search.interview ? search.interview : roundKey({ type: search.type }),
  );
  useEffect(() => {
    if (!search.interview && !search.type) setKey(defaultRoundKey(interviews));
  }, [interviews, search.interview, search.type]);

  const [count, setCount] = useState<string>("6");
  const autoLanguage = resolveMaterialLanguage(job, i18n.language);
  const [language, setLanguage] = useState<"auto" | MaterialLanguage>("auto");
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session?.turns.length, busy]);

  const current = session?.turns[session.turns.length - 1];
  const awaitingAnswer = !!session && session.status === "active" && !!current && !current.answer && busy === null;
  const pastSessions = useMemo(() => mock.sessions.filter((s) => s.id !== session?.id), [mock.sessions, session?.id]);

  const start = () => {
    const { interview, type } = resolveRound(key, interviews);
    void mock.start({
      interviewType: type,
      interviewId: interview?.id ?? "",
      totalQuestions: parseInt(count, 10),
      language: language === "auto" ? autoLanguage : language,
      coachingLanguage: toMaterialLanguage(i18n.language),
    });
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void mock.answer(text);
  };

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingSkeleton variant="detail-page" />
      </PageContainer>
    );
  }

  const sessionLabel = (s: MockSession) =>
    `${tApps(`interview.type.${s.interview_type}`)} · ${format(new Date(s.created_at), "PPp", { locale })}`;

  return (
    <PageContainer>
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/applications/$appId/prep" params={{ appId }} search={{}}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("common:actions.back")}
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t("mock.title")}</h2>
            {job && (
              <p className="text-sm text-muted-foreground">
                {job.title}
                {job.company_name ? ` · ${job.company_name}` : ""}
              </p>
            )}
          </div>
        </div>

        {!application || !parsedCv || !job ? (
          <p className="text-sm text-muted-foreground">{t("prep_ai.missing_cv_or_job")}</p>
        ) : !session ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t("mock.setup_title")}</CardTitle>
                <CardDescription>{t("mock.setup_description")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("mock.round")}</Label>
                  <RoundSelect value={key} onChange={setKey} interviews={interviews} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("mock.questions")}</Label>
                    <Select value={count} onValueChange={setCount}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUESTION_COUNTS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {t("mock.questions_option", { count: n })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("mock.language")}</Label>
                    <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          {t("prep_ai.language_auto", { lang: t(`prep_ai.language_name.${autoLanguage}`) })}
                        </SelectItem>
                        <SelectItem value="en">{t("prep_ai.language_name.en")}</SelectItem>
                        <SelectItem value="es">{t("prep_ai.language_name.es")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t("mock.coaching_note")}</p>
                <Button onClick={start} disabled={busy !== null}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
                  {t("mock.start")}
                </Button>
              </CardContent>
            </Card>

            {pastSessions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("mock.past_sessions")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pastSessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                      <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => mock.open(s)}>
                        {sessionLabel(s)}
                      </button>
                      <Badge variant={s.status === "completed" ? "secondary" : "outline"}>
                        {t(`mock.status.${s.status}`)}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={t("mock.delete")}
                        onClick={() => void mock.remove(s.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {sessionLabel(session)} ·{" "}
                {t("mock.progress", {
                  current: Math.min(session.turns.length, session.total_questions),
                  total: session.total_questions,
                })}
              </p>
              <div className="flex gap-2">
                {session.status === "active" && session.turns.some((turn) => turn.answer) && (
                  <Button size="sm" variant="outline" onClick={() => void mock.endNow()} disabled={busy !== null}>
                    <Square className="mr-2 h-3.5 w-3.5" />
                    {t("mock.end")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => mock.open(null)} disabled={busy !== null}>
                  {t("mock.leave")}
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {session.turns.map((turn, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Mic className="h-4 w-4 text-primary" />
                    </div>
                    <div className="rounded-lg bg-muted px-3 py-2 text-sm">
                      <p>{turn.question}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {turn.is_follow_up && (
                          <Badge variant="outline" className="mr-1.5 h-4 px-1 text-[10px]">
                            {t("mock.follow_up")}
                          </Badge>
                        )}
                        {turn.intent}
                      </p>
                    </div>
                  </div>
                  {turn.answer && (
                    <div className="flex flex-row-reverse gap-2">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm">{turn.answer}</div>
                    </div>
                  )}
                  {turn.coaching && <CoachingNote coaching={turn.coaching} />}
                </div>
              ))}

              {busy && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {busy === "report" ? t("mock.writing_report") : t("mock.thinking")}
                  <Button size="sm" variant="ghost" className="h-7" onClick={mock.cancel}>
                    {t("prep_ai.cancel")}
                  </Button>
                </p>
              )}

              {mock.stalled && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{t("mock.stalled")}</span>
                  <Button size="sm" variant="outline" onClick={() => void mock.retry()}>
                    <RotateCcw className="mr-2 h-3.5 w-3.5" />
                    {t("mock.retry")}
                  </Button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {awaitingAnswer && (
              <div className="space-y-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={t("mock.answer_placeholder")}
                  rows={5}
                  autoFocus
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{t("mock.send_hint")}</p>
                  <Button onClick={send} disabled={!draft.trim()}>
                    <Send className="mr-2 h-4 w-4" />
                    {t("mock.send")}
                  </Button>
                </div>
              </div>
            )}

            {session.status === "completed" && session.report && (
              <ReportView
                report={session.report}
                cvId={cv?.id ?? null}
                cv={parsedCv}
                onAgain={() => mock.open(null)}
              />
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
