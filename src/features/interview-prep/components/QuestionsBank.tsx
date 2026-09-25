import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import {
  Sparkles,
  AlertTriangle,
  Plus,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { createLlmService } from "@/lib/llm";
import { getConfig } from "@/services/llm";
import {
  getInterviewPrepByApplicationId,
  upsertInterviewPrep,
} from "@/services/database";
import { useSettingsStore } from "@/stores/settingsStore";
import { ulid } from "ulid";
import { defaultQuestionCategories } from "../data/default-questions";
import type { Job, InterviewPrep } from "@/types";
import type { LlmProviderConfig } from "@/lib/llm/providers/base";

interface QuestionsBankProps {
  job: Job | null;
  applicationId: string;
  companyName: string;
}

interface CompanyQuestion {
  category: string;
  question: string;
  rationale: string;
}

export function QuestionsBank({
  job,
  applicationId,
  companyName,
}: QuestionsBankProps) {
  const { t } = useTranslation("interview-prep");
  const activeProvider = useSettingsStore((s) => s.llm.active_provider);
  const hasLlm = activeProvider !== null;

  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(
    new Set(),
  );
  const [companyQuestions, setCompanyQuestions] = useState<CompanyQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [prepId, setPrepId] = useState<string | null>(null);
  const [copiedSelected, setCopiedSelected] = useState(false);

  // Custom question dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customQuestion, setCustomQuestion] = useState("");
  const [customRationale, setCustomRationale] = useState("");
  const [customCategory, setCustomCategory] = useState("growth_retention");

  // Load persisted data
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setIsLoading(true);
      try {
        const prep = await getInterviewPrepByApplicationId(applicationId);
        if (cancelled) return;
        if (prep) {
          setPrepId(prep.id);
          setCompanyQuestions(prep.custom_questions);
        }
      } catch (err) {
        console.error("Failed to load questions:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const getProviderConfig =
    useCallback(async (): Promise<LlmProviderConfig | null> => {
      const { llm } = useSettingsStore.getState();
      if (!llm.active_provider) return null;
      return getConfig(llm.active_provider);
    }, []);

  const persistQuestions = useCallback(
    async (questions: CompanyQuestion[]) => {
      try {
        const existing =
          await getInterviewPrepByApplicationId(applicationId);
        const now = Date.now();
        const prep: InterviewPrep = existing
          ? {
              ...existing,
              custom_questions: questions,
              updated_at: now,
            }
          : {
              id: prepId ?? ulid(),
              application_id: applicationId,
              pitch_casual: "",
              pitch_formal: "",
              pitch_technical: "",
              strengths: [],
              weaknesses: [],
              company_brief: "",
              custom_questions: questions,
              checklist_state: {
                pre_interview: {},
                video_call_setup: {},
                during_interview: {},
                closing: {},
                post_interview: {},
              },
              created_at: now,
              updated_at: now,
            };
        await upsertInterviewPrep(prep);
        if (!prepId) setPrepId(prep.id);
      } catch (err) {
        console.error("Failed to persist questions:", err);
      }
    },
    [applicationId, prepId],
  );

  const handleGenerateCompanyQuestions = useCallback(async () => {
    if (!job) return;
    setIsGenerating(true);
    try {
      const config = await getProviderConfig();
      if (!config) {
        toast.error(t("questions.no_llm"));
        return;
      }
      const service = createLlmService(config);
      const result = await service.generateCompanyQuestions(
        companyName || "",
        [],
        job,
      );
      setCompanyQuestions(result);
      await persistQuestions(result);
      toast.success(t("questions.generated_success"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  }, [job, companyName, getProviderConfig, persistQuestions, t]);

  const toggleQuestion = useCallback((questionId: string) => {
    setSelectedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }, []);

  const handleAddCustomQuestion = useCallback(() => {
    if (!customQuestion.trim()) return;
    const newQ: CompanyQuestion = {
      category: customCategory,
      question: customQuestion.trim(),
      rationale: customRationale.trim(),
    };
    const updated = [...companyQuestions, newQ];
    setCompanyQuestions(updated);
    persistQuestions(updated);
    setCustomQuestion("");
    setCustomRationale("");
    setDialogOpen(false);
    toast.success(t("questions.added_success"));
  }, [
    customQuestion,
    customRationale,
    customCategory,
    companyQuestions,
    persistQuestions,
    t,
  ]);

  const handleRemoveCompanyQuestion = useCallback(
    (index: number) => {
      const updated = companyQuestions.filter((_, i) => i !== index);
      setCompanyQuestions(updated);
      persistQuestions(updated);
    },
    [companyQuestions, persistQuestions],
  );

  // Build the list of selected question texts for copy
  const selectedQuestionTexts = useMemo(() => {
    const texts: string[] = [];
    for (const category of defaultQuestionCategories) {
      for (const q of category.questions) {
        if (selectedQuestions.has(q.id)) {
          texts.push(t(q.questionKey));
        }
      }
    }
    for (let i = 0; i < companyQuestions.length; i++) {
      if (selectedQuestions.has(`company_${i}`)) {
        texts.push(companyQuestions[i].question);
      }
    }
    return texts;
  }, [selectedQuestions, companyQuestions, t]);

  const handleCopySelected = useCallback(async () => {
    if (selectedQuestionTexts.length === 0) return;
    try {
      await navigator.clipboard.writeText(
        selectedQuestionTexts.map((q, i) => `${i + 1}. ${q}`).join("\n"),
      );
      setCopiedSelected(true);
      setTimeout(() => setCopiedSelected(false), 2000);
      toast.success(t("questions.copied_success"));
    } catch {
      toast.error(t("common:errors.copy_failed"));
    }
  }, [selectedQuestionTexts, t]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {t("questions.bank_title")}
        </h3>
        <Button
          onClick={handleGenerateCompanyQuestions}
          disabled={isGenerating || !job}
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {t("questions.generate_company")}
        </Button>
      </div>

      {/* No LLM Warning */}
      {!hasLlm && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("questions.no_llm_title")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{t("questions.no_llm_description")}</span>
            <Link to="/settings">
              <Button variant="outline" size="sm">
                {t("questions.go_to_settings")}
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Pre-built questions by category */}
      <div>
        <h4 className="text-sm font-semibold mb-3">
          {t("questions.prebuilt_title")}
        </h4>
        <Accordion type="multiple" defaultValue={["growth_retention"]}>
          {defaultQuestionCategories.map((category) => (
            <AccordionItem key={category.id} value={category.id}>
              <AccordionTrigger className="text-sm font-medium">
                {t(category.labelKey)}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({category.questions.length})
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {category.questions.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={q.id}
                        checked={selectedQuestions.has(q.id)}
                        onCheckedChange={() => toggleQuestion(q.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor={q.id}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {t(q.questionKey)}
                        </label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t(q.rationaleKey)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* Company-Specific Questions */}
      {companyQuestions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">
              {t("questions.company_specific_title")}
            </h4>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateCompanyQuestions}
              disabled={isGenerating}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-1 ${isGenerating ? "animate-spin" : ""}`}
              />
              {t("questions.regenerate")}
            </Button>
          </div>
          <div className="space-y-2">
            {companyQuestions.map((q, i) => (
              <div
                key={`company_${i}`}
                className="flex items-start gap-3 rounded-md border p-3"
              >
                <Checkbox
                  id={`company_${i}`}
                  checked={selectedQuestions.has(`company_${i}`)}
                  onCheckedChange={() => toggleQuestion(`company_${i}`)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">
                      {q.category}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{q.question}</p>
                  {q.rationale && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {q.rationale}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveCompanyQuestion(i)}
                  className="shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Custom Question */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t("questions.add_custom")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("questions.add_custom_title")}</DialogTitle>
            <DialogDescription>
              {t("questions.add_custom_description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="custom-category">
                {t("questions.category")}
              </Label>
              <Select
                value={customCategory}
                onValueChange={setCustomCategory}
              >
                <SelectTrigger id="custom-category" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {defaultQuestionCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {t(c.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="custom-question">
                {t("questions.question")}
              </Label>
              <Input
                id="custom-question"
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                placeholder={t("questions.question_placeholder")}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="custom-rationale">
                {t("questions.rationale")}
              </Label>
              <Textarea
                id="custom-rationale"
                value={customRationale}
                onChange={(e) => setCustomRationale(e.target.value)}
                placeholder={t("questions.rationale_placeholder")}
                className="mt-1"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleAddCustomQuestion}
              disabled={!customQuestion.trim()}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("questions.add_button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Selected Questions Summary */}
      {selectedQuestionTexts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                {t("questions.selected_title", {
                  count: selectedQuestionTexts.length,
                })}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={handleCopySelected}>
                {copiedSelected ? (
                  <Check className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1" />
                )}
                {t("questions.copy_selected")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              {selectedQuestionTexts.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
