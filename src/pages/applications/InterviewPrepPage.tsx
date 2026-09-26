import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearch, useNavigate, Link } from "@tanstack/react-router";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Mic,
  Star,
  Shield,
  HelpCircle,
  CheckSquare,
  Building2,
  Target,
  ListChecks,
  Languages,
} from "lucide-react";
import { useCvStore } from "@/stores/cvStore";
import { resolveMaterialLanguage, type MaterialLanguage } from "@/lib/llm/language";
import { useApplicationPrepData } from "@/features/interview-prep/hooks/useApplicationPrepData";
import { useGlassdoorReviews } from "@/features/interview-prep/hooks/useGlassdoorReviews";
import { GapBriefPanel } from "@/features/interview-prep/components/GapBriefPanel";
import { RoundPrepPanel, defaultRoundKey } from "@/features/interview-prep/components/RoundPrepPanel";
import { QuickStudyPlan } from "@/features/interview-prep/components/QuickStudyPlan";
import type { PlanSource } from "@/lib/llm/prep-schemas";
import { CompanyBrief } from "@/features/interview-prep/components/CompanyBrief";
import { GlassdoorReviews } from "@/features/interview-prep/components/GlassdoorReviews";
import { PitchBuilder } from "@/features/interview-prep/components/PitchBuilder";
import { StarStoryBank } from "@/features/interview-prep/components/StarStoryBank";
import { StrengthsWeaknesses } from "@/features/interview-prep/components/StrengthsWeaknesses";
import { QuestionsBank } from "@/features/interview-prep/components/QuestionsBank";
import { InterviewChecklist } from "@/features/interview-prep/components/InterviewChecklist";
export function InterviewPrepPage() {
  const { t, i18n } = useTranslation("interview-prep");
  const { appId } = useParams({ from: "/applications/$appId/prep" });
  const search = useSearch({ from: "/applications/$appId/prep" });

  const { application, job, company, cv: appCv, interviews } = useApplicationPrepData(appId);
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null);
  const [languageOverride, setLanguageOverride] = useState<"auto" | MaterialLanguage>("auto");

  const cvs = useCvStore((s) => s.cvs);
  const fetchCvs = useCvStore((s) => s.fetchCvs);
  const { reviews } = useGlassdoorReviews(company?.id ?? "");

  useEffect(() => {
    void fetchCvs();
  }, [fetchCvs]);

  useEffect(() => {
    if (application) setSelectedCvId((cur) => cur ?? application.cv_id);
  }, [application]);

  const navigate = useNavigate();
  const [tab, setTab] = useState("round");
  const [roundKeyState, setRoundKey] = useState<string | null>(null);
  // Interviews load after the first render; default to the requested / next round then.
  const roundKey = roundKeyState ?? defaultRoundKey(interviews, search.interview);
  const selectedInterview = interviews.find((i) => i.id === roundKey) ?? null;

  const openSource = (source: PlanSource) => {
    const tabs: Partial<Record<PlanSource, string>> = {
      fit: "fit",
      round_pack: "round",
      stories: "star",
      pitch: "pitch",
      strengths: "strengths",
    };
    if (source === "mock") {
      void navigate({
        to: "/applications/$appId/mock",
        params: { appId },
        search: selectedInterview ? { interview: selectedInterview.id } : {},
      });
    } else if (tabs[source]) {
      setTab(tabs[source]);
    }
  };

  const autoLanguage = resolveMaterialLanguage(job, i18n.language);
  const language = languageOverride === "auto" ? autoLanguage : languageOverride;

  const parsedCv = useMemo(() => {
    const cv = cvs.find((c) => c.id === selectedCvId) ?? appCv;
    return cv?.parsed_data ?? null;
  }, [cvs, selectedCvId, appCv]);

  const handleCvChange = (cvId: string) => {
    setSelectedCvId(cvId);
  };

  return (
    <PageContainer>
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/applications/$appId" params={{ appId }}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("common:actions.back")}
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {t("title")}
            </h2>
            {job && (
              <p className="text-sm text-muted-foreground">
                {job.title}
                {company?.name ? ` · ${company.name}` : ""}
              </p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Languages className="h-4 w-4 text-muted-foreground" />
            <Select
              value={languageOverride}
              onValueChange={(v) => setLanguageOverride(v as typeof languageOverride)}
            >
              <SelectTrigger className="h-8 w-[190px]" aria-label={t("prep_ai.language")}>
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
            <Link
              to="/applications/$appId/mock"
              params={{ appId }}
              search={search.interview ? { interview: search.interview } : {}}
            >
              <Button size="sm">
                <Mic className="h-4 w-4 mr-2" />
                {t("mock.open")}
              </Button>
            </Link>
          </div>
        </div>

        {/* Tabs */}
        {selectedInterview && (
          <QuickStudyPlan interview={selectedInterview} variant="full" onOpenSource={openSource} />
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="round" className="flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("tabs.round_prep")}</span>
            </TabsTrigger>
            <TabsTrigger value="fit" className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("tabs.fit")}</span>
            </TabsTrigger>
            <TabsTrigger value="pitch" className="flex items-center gap-1.5">
              <Mic className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("tabs.pitch")}</span>
            </TabsTrigger>
            <TabsTrigger value="star" className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {t("tabs.star_stories")}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="strengths"
              className="flex items-center gap-1.5"
            >
              <Shield className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {t("tabs.strengths_weaknesses")}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="questions"
              className="flex items-center gap-1.5"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("tabs.questions")}</span>
            </TabsTrigger>
            <TabsTrigger
              value="checklist"
              className="flex items-center gap-1.5"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("tabs.checklist")}</span>
            </TabsTrigger>
            <TabsTrigger value="company" className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {t("tabs.company_brief")}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="round" className="mt-4">
            <RoundPrepPanel
              applicationId={appId}
              cvId={selectedCvId}
              cv={parsedCv}
              job={job}
              interviews={interviews}
              roundKey={roundKey}
              onRoundKeyChange={setRoundKey}
              language={language}
            />
          </TabsContent>

          <TabsContent value="fit" className="mt-4">
            <GapBriefPanel applicationId={appId} cv={parsedCv} job={job} language={language} />
          </TabsContent>

          {/* Pitch Tab */}
          <TabsContent value="pitch" className="mt-4">
            <PitchBuilder cv={parsedCv} applicationId={appId} />
          </TabsContent>

          {/* STAR Stories Tab */}
          <TabsContent value="star" className="mt-4">
            <StarStoryBank
              cvs={cvs}
              selectedCvId={selectedCvId}
              onCvChange={handleCvChange}
            />
          </TabsContent>

          {/* Strengths & Weaknesses */}
          <TabsContent value="strengths" className="mt-4">
            <StrengthsWeaknesses
              cv={parsedCv}
              job={job}
              applicationId={appId}
            />
          </TabsContent>

          {/* Questions to Ask */}
          <TabsContent value="questions" className="mt-4">
            <QuestionsBank
              job={job}
              applicationId={appId}
              companyName={company?.name ?? ""}
            />
          </TabsContent>

          {/* Checklist */}
          <TabsContent value="checklist" className="mt-4">
            <InterviewChecklist applicationId={appId} />
          </TabsContent>

          {/* Company brief from stored Glassdoor interview reviews (legacy data) */}
          <TabsContent value="company" className="mt-4 space-y-6">
            <CompanyBrief
              companyName={company?.name ?? ""}
              companyId={company?.id ?? ""}
              jobTitle={job?.title ?? ""}
              reviews={reviews}
              jobId={job?.id}
            />
            {company && reviews.length > 0 && (
              <GlassdoorReviews companyId={company.id} companyName={company.name} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
