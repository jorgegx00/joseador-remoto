import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Sparkles, AlertTriangle, Play, Square, Check, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { PitchCard } from "./PitchCard";
import { usePitch } from "../hooks/usePitch";
import type { ParsedCv, PitchVariant } from "@/types";

interface PitchBuilderProps {
  cv: ParsedCv | null;
  applicationId: string;
}

type TimerStatus = "idle" | "running" | "finished";

export function PitchBuilder({ cv, applicationId }: PitchBuilderProps) {
  const { t } = useTranslation("interview-prep");
  const {
    pitches,
    isGenerating,
    isLoading,
    hasLlm,
    loadPitches,
    generatePitch,
    generateAll,
    updatePitchText,
    savePitches,
  } = usePitch();

  const [practiceVariant, setPracticeVariant] =
    useState<PitchVariant>("casual");
  const [timerDuration, setTimerDuration] = useState(90);
  const [timeRemaining, setTimeRemaining] = useState(90);
  const [timerStatus, setTimerStatus] = useState<TimerStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadPitches(applicationId);
  }, [applicationId, loadPitches]);

  // Auto-save when pitches change (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (!pitches.casual && !pitches.formal && !pitches.technical) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      savePitches(applicationId);
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [pitches, applicationId, savePitches, isLoading]);

  const startTimer = useCallback(() => {
    setTimeRemaining(timerDuration);
    setTimerStatus("running");
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          setTimerStatus("finished");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [timerDuration]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimerStatus("idle");
    setTimeRemaining(timerDuration);
  }, [timerDuration]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleDurationChange = useCallback(
    (val: string) => {
      const dur = parseInt(val, 10);
      setTimerDuration(dur);
      if (timerStatus === "idle") {
        setTimeRemaining(dur);
      }
    },
    [timerStatus],
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isAnyGenerating =
    isGenerating.casual || isGenerating.formal || isGenerating.technical;

  const handleGenerateAll = () => {
    if (!cv) return;
    generateAll(cv, applicationId);
  };

  const handleRegenerate = (variant: PitchVariant) => {
    if (!cv) return;
    generatePitch(variant, cv, applicationId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("pitch.build_title")}</h3>
        <Button
          onClick={handleGenerateAll}
          disabled={!cv || !hasLlm || isAnyGenerating}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {t("pitch.generate_all")}
        </Button>
      </div>

      {/* No LLM Warning */}
      {!hasLlm && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("pitch.no_llm_title")}</AlertTitle>
          <AlertDescription>
            {t("pitch.no_llm_description")}{" "}
            <Link to="/settings" className="underline font-medium">
              {t("pitch.go_to_settings")}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Pitch Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(["casual", "formal", "technical"] as const).map((variant) => (
          <PitchCard
            key={variant}
            variant={variant}
            pitch={pitches[variant]}
            onRegenerate={() => handleRegenerate(variant)}
            onChange={(text) => updatePitchText(variant, text)}
            isGenerating={isGenerating[variant]}
          />
        ))}
      </div>

      {/* Tips Accordion */}
      <Accordion type="single" collapsible>
        <AccordionItem value="tips">
          <AccordionTrigger>{t("pitch.tips_title")}</AccordionTrigger>
          <AccordionContent>
            <p className="text-sm text-muted-foreground">
              {t("pitch.tips_content")}
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Practice Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("pitch.practice_title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Variant selector */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {t("pitch.practice_variant")}
              </label>
              <Select
                value={practiceVariant}
                onValueChange={(v) => setPracticeVariant(v as PitchVariant)}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">
                    {t("pitch.casual")}
                  </SelectItem>
                  <SelectItem value="formal">
                    {t("pitch.formal")}
                  </SelectItem>
                  <SelectItem value="technical">
                    {t("pitch.technical")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Duration selector */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {t("pitch.timer")}
              </label>
              <Select
                value={String(timerDuration)}
                onValueChange={handleDurationChange}
                disabled={timerStatus === "running"}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">60s</SelectItem>
                  <SelectItem value="90">90s</SelectItem>
                  <SelectItem value="120">120s</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Timer display */}
          <div className="flex flex-col items-center gap-4 py-4">
            <span
              className={`text-5xl font-mono font-bold tabular-nums ${
                timerStatus === "running" && timeRemaining < 10
                  ? "text-destructive"
                  : timerStatus === "finished"
                    ? "text-destructive"
                    : ""
              }`}
            >
              {formatTime(timeRemaining)}
            </span>

            <div className="flex gap-2">
              {timerStatus === "idle" && (
                <Button onClick={startTimer}>
                  <Play className="h-4 w-4 mr-2" />
                  {t("pitch.start")}
                </Button>
              )}
              {timerStatus === "running" && (
                <Button variant="destructive" onClick={stopTimer}>
                  <Square className="h-4 w-4 mr-2" />
                  {t("pitch.stop")}
                </Button>
              )}
              {timerStatus === "finished" && (
                <>
                  <Button
                    variant="default"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={stopTimer}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    {t("pitch.nailed_it")}
                  </Button>
                  <Button variant="outline" onClick={stopTimer}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {t("pitch.need_practice")}
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
