import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "@tanstack/react-router";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Mic,
  Star,
  Shield,
  HelpCircle,
  CheckSquare,
  Building2,
} from "lucide-react";
import { getApplicationById, getJobById, getCvById, getCompanyById } from "@/services/database";
import { useCvStore } from "@/stores/cvStore";
import { PitchBuilder } from "@/features/interview-prep/components/PitchBuilder";
import { StarStoryBank } from "@/features/interview-prep/components/StarStoryBank";
import { StrengthsWeaknesses } from "@/features/interview-prep/components/StrengthsWeaknesses";
import { QuestionsBank } from "@/features/interview-prep/components/QuestionsBank";
import { InterviewChecklist } from "@/features/interview-prep/components/InterviewChecklist";
import type { Application, Job, CvRecord, Company } from "@/types";

export function InterviewPrepPage() {
  const { t } = useTranslation("interview-prep");
  const { appId } = useParams({ from: "/applications/$appId/prep" });

  const [application, setApplication] = useState<Application | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [appCv, setAppCv] = useState<CvRecord | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null);

  const cvs = useCvStore((s) => s.cvs);
  const fetchCvs = useCvStore((s) => s.fetchCvs);

  // Load application data on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoadingData(true);
      try {
        const [app, allCvsResult] = await Promise.all([
          getApplicationById(appId),
          fetchCvs(),
        ]);
        if (cancelled) return;

        setApplication(app);

        if (app) {
          const [jobData, cvData] = await Promise.all([
            getJobById(app.job_id),
            getCvById(app.cv_id),
          ]);
          if (cancelled) return;
          setJob(jobData);
          setAppCv(cvData);
          setSelectedCvId(app.cv_id);

          if (jobData) {
            const companyData = await getCompanyById(jobData.company_id);
            if (!cancelled) setCompany(companyData);
          }
        }
      } catch (err) {
        console.error("Failed to load interview prep data:", err);
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [appId, fetchCvs]);

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
              </p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="pitch">
          <TabsList className="grid w-full grid-cols-6">
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

          {/* Company Brief - Coming Soon */}
          <TabsContent value="company" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {t("company_brief.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  {t("coming_soon")}
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
