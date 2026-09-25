import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import {
  Sparkles,
  AlertTriangle,
  Plus,
  Pencil,
  Check,
  X,
  RefreshCw,
  Loader2,
  Trash2,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useStrengthsWeaknesses } from "../hooks/useStrengthsWeaknesses";
import type { ParsedCv, Job, StrengthEntry, WeaknessEntry } from "@/types";

interface StrengthsWeaknessesProps {
  cv: ParsedCv | null;
  job: Job | null;
  applicationId: string;
}

export function StrengthsWeaknesses({
  cv,
  job,
  applicationId,
}: StrengthsWeaknessesProps) {
  const { t } = useTranslation("interview-prep");
  const {
    strengths,
    weaknesses,
    isLoading,
    isGenerating,
    hasLlm,
    load,
    generate,
    regenerateStrength,
    regenerateWeakness,
    updateStrength,
    updateWeakness,
    addStrength,
    addWeakness,
    removeStrength,
    removeWeakness,
    save,
  } = useStrengthsWeaknesses();

  // Load data on mount
  useEffect(() => {
    load(applicationId);
  }, [applicationId, load]);

  // Auto-save on changes (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (strengths.length === 0 && weaknesses.length === 0) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      save(applicationId);
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [strengths, weaknesses, applicationId, save, isLoading]);

  const handleGenerate = useCallback(() => {
    if (!cv || !job) return;
    generate(cv, job, applicationId);
  }, [cv, job, applicationId, generate]);

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
          {t("strengths_weaknesses.prepare_title")}
        </h3>
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !cv || !job}
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {t("strengths_weaknesses.generate")}
        </Button>
      </div>

      {/* No LLM Warning */}
      {!hasLlm && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("strengths_weaknesses.no_llm_title")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{t("strengths_weaknesses.no_llm_description")}</span>
            <Link to="/settings">
              <Button variant="outline" size="sm">
                {t("strengths_weaknesses.go_to_settings")}
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Strengths Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
          <h4 className="text-base font-semibold text-green-700 dark:text-green-400">
            {t("strengths_weaknesses.strengths")}
          </h4>
        </div>

        {strengths.length === 0 && !isGenerating && (
          <Card className="border-dashed border-green-300 dark:border-green-700">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t("strengths_weaknesses.no_strengths")}
            </CardContent>
          </Card>
        )}

        {strengths.map((entry, index) => (
          <StrengthCard
            key={index}
            entry={entry}
            index={index}
            onUpdate={(e) => updateStrength(index, e)}
            onRegenerate={() => {
              if (cv && job) regenerateStrength(index, cv, job, applicationId);
            }}
            onRemove={() => removeStrength(index)}
            isGenerating={isGenerating}
          />
        ))}

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            addStrength({ strength: "", example: "", relevance: "" })
          }
          className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("strengths_weaknesses.add_strength")}
        </Button>
      </div>

      {/* Weaknesses Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <h4 className="text-base font-semibold text-amber-700 dark:text-amber-400">
            {t("strengths_weaknesses.weaknesses")}
          </h4>
        </div>

        {weaknesses.length === 0 && !isGenerating && (
          <Card className="border-dashed border-amber-300 dark:border-amber-700">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t("strengths_weaknesses.no_weaknesses")}
            </CardContent>
          </Card>
        )}

        {weaknesses.map((entry, index) => (
          <WeaknessCard
            key={index}
            entry={entry}
            index={index}
            onUpdate={(e) => updateWeakness(index, e)}
            onRegenerate={() => {
              if (cv && job) regenerateWeakness(index, cv, job, applicationId);
            }}
            onRemove={() => removeWeakness(index)}
            isGenerating={isGenerating}
          />
        ))}

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            addWeakness({
              weakness: "",
              strategy: "past_overcame",
              response: "",
            })
          }
          className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("strengths_weaknesses.add_weakness")}
        </Button>

        {/* Strategy Tips */}
        <Accordion type="single" collapsible>
          <AccordionItem value="tips">
            <AccordionTrigger className="text-sm font-medium">
              {t("strengths_weaknesses.tips_title")}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 text-sm">
                <div className="rounded-md bg-blue-50 dark:bg-blue-950/50 p-3 border border-blue-200 dark:border-blue-800">
                  <p className="font-medium text-blue-700 dark:text-blue-300">
                    {t("strengths_weaknesses.strategy_1_title")}
                  </p>
                  <p className="text-blue-600 dark:text-blue-400 mt-1">
                    {t("strengths_weaknesses.strategy_1_description")}
                  </p>
                </div>
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/50 p-3 border border-amber-200 dark:border-amber-800">
                  <p className="font-medium text-amber-700 dark:text-amber-300">
                    {t("strengths_weaknesses.strategy_2_title")}
                  </p>
                  <p className="text-amber-600 dark:text-amber-400 mt-1">
                    {t("strengths_weaknesses.strategy_2_description")}
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StrengthCard
// ---------------------------------------------------------------------------

interface StrengthCardProps {
  entry: StrengthEntry;
  index: number;
  onUpdate: (entry: StrengthEntry) => void;
  onRegenerate: () => void;
  onRemove: () => void;
  isGenerating: boolean;
}

function StrengthCard({
  entry,
  index,
  onUpdate,
  onRegenerate,
  onRemove,
  isGenerating,
}: StrengthCardProps) {
  const { t } = useTranslation("interview-prep");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<StrengthEntry>(entry);

  useEffect(() => {
    setDraft(entry);
  }, [entry]);

  const handleSave = () => {
    onUpdate(draft);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(entry);
    setIsEditing(false);
  };

  return (
    <Card className="border-green-200 dark:border-green-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            {isEditing ? (
              <Textarea
                value={draft.strength}
                onChange={(e) =>
                  setDraft({ ...draft, strength: e.target.value })
                }
                className="min-h-[2rem] text-sm font-semibold"
                rows={1}
              />
            ) : (
              entry.strength || t("strengths_weaknesses.untitled_strength")
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            {isEditing ? (
              <>
                <Button variant="ghost" size="icon" onClick={handleSave}>
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleCancel}>
                  <X className="h-4 w-4 text-red-600" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRegenerate}
                  disabled={isGenerating}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRemove}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {t("strengths_weaknesses.example")}
          </p>
          {isEditing ? (
            <Textarea
              value={draft.example}
              onChange={(e) =>
                setDraft({ ...draft, example: e.target.value })
              }
              className="text-sm"
              rows={2}
            />
          ) : (
            <p className="text-sm">
              {entry.example ||
                t("strengths_weaknesses.no_example_yet")}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {t("strengths_weaknesses.relevance")}
          </p>
          {isEditing ? (
            <Textarea
              value={draft.relevance}
              onChange={(e) =>
                setDraft({ ...draft, relevance: e.target.value })
              }
              className="text-sm"
              rows={2}
            />
          ) : (
            <p className="text-sm text-green-700 dark:text-green-400">
              {entry.relevance ||
                t("strengths_weaknesses.no_relevance_yet")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// WeaknessCard
// ---------------------------------------------------------------------------

interface WeaknessCardProps {
  entry: WeaknessEntry;
  index: number;
  onUpdate: (entry: WeaknessEntry) => void;
  onRegenerate: () => void;
  onRemove: () => void;
  isGenerating: boolean;
}

function WeaknessCard({
  entry,
  index,
  onUpdate,
  onRegenerate,
  onRemove,
  isGenerating,
}: WeaknessCardProps) {
  const { t } = useTranslation("interview-prep");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<WeaknessEntry>(entry);

  useEffect(() => {
    setDraft(entry);
  }, [entry]);

  const handleSave = () => {
    onUpdate(draft);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(entry);
    setIsEditing(false);
  };

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">
              {isEditing ? (
                <Textarea
                  value={draft.weakness}
                  onChange={(e) =>
                    setDraft({ ...draft, weakness: e.target.value })
                  }
                  className="min-h-[2rem] text-sm font-semibold"
                  rows={1}
                />
              ) : (
                entry.weakness ||
                t("strengths_weaknesses.untitled_weakness")
              )}
            </CardTitle>
            {!isEditing && (
              <Badge
                className={
                  entry.strategy === "past_overcame"
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                }
              >
                {t(`strengths_weaknesses.${entry.strategy}`)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isEditing ? (
              <>
                <Button variant="ghost" size="icon" onClick={handleSave}>
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleCancel}>
                  <X className="h-4 w-4 text-red-600" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRegenerate}
                  disabled={isGenerating}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRemove}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isEditing && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              {t("strengths_weaknesses.strategy")}
            </p>
            <Select
              value={draft.strategy}
              onValueChange={(val) =>
                setDraft({
                  ...draft,
                  strategy: val as WeaknessEntry["strategy"],
                })
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="past_overcame">
                  {t("strengths_weaknesses.past_overcame")}
                </SelectItem>
                <SelectItem value="current_improving">
                  {t("strengths_weaknesses.current_improving")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {t("strengths_weaknesses.response")}
          </p>
          {isEditing ? (
            <Textarea
              value={draft.response}
              onChange={(e) =>
                setDraft({ ...draft, response: e.target.value })
              }
              className="text-sm"
              rows={3}
            />
          ) : (
            <p className="text-sm">
              {entry.response ||
                t("strengths_weaknesses.no_response_yet")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
