import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface AtsScoreGaugeProps {
  score: number;
  animated?: boolean;
}

const GAUGE_SIZE = 160;
const STROKE_WIDTH = 8;

function getScoreColor(score: number): string {
  if (score < 40) return "#ef4444";
  if (score <= 60) return "#f97316";
  if (score <= 75) return "#eab308";
  return "#22c55e";
}

function getGrade(score: number): { letter: string; key: string } {
  if (score >= 90) return { letter: "A", key: "ats.grade_a" };
  if (score >= 75) return { letter: "B", key: "ats.grade_b" };
  if (score >= 60) return { letter: "C", key: "ats.grade_c" };
  if (score >= 40) return { letter: "D", key: "ats.grade_d" };
  return { letter: "F", key: "ats.grade_f" };
}

export function AtsScoreGauge({ score, animated = true }: AtsScoreGaugeProps) {
  const { t } = useTranslation("cv");
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = (GAUGE_SIZE - STROKE_WIDTH * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = getScoreColor(clamped);
  const grade = getGrade(clamped);

  const [displayProgress, setDisplayProgress] = useState(animated ? 0 : clamped);

  useEffect(() => {
    if (!animated) {
      setDisplayProgress(clamped);
      return;
    }
    setDisplayProgress(0);
    const timer = requestAnimationFrame(() => {
      setDisplayProgress(clamped);
    });
    return () => cancelAnimationFrame(timer);
  }, [clamped, animated]);

  const dashOffset = circumference - (displayProgress / 100) * circumference;
  const center = GAUGE_SIZE / 2;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative inline-flex items-center justify-center"
        style={{ width: GAUGE_SIZE, height: GAUGE_SIZE }}
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${t(grade.key)}: ${clamped}%`}
      >
        <svg
          width={GAUGE_SIZE}
          height={GAUGE_SIZE}
          className="-rotate-90"
          viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
        >
          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-muted/20"
            strokeWidth={STROKE_WIDTH}
          />
          {/* Progress arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className={cn(
              animated &&
                "transition-[stroke-dashoffset] duration-1000 ease-out"
            )}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-bold leading-none text-foreground">
            {clamped}
          </span>
          <span
            className="text-lg font-semibold leading-none mt-1"
            style={{ color }}
          >
            {grade.letter}
          </span>
        </div>
      </div>

      {/* Description text */}
      <p className="text-sm text-muted-foreground text-center max-w-xs">
        {t("ats.score_estimate", { score: clamped })}
      </p>
      <p className="text-xs text-muted-foreground text-center max-w-xs">
        {t(grade.key)}
      </p>
    </div>
  );
}
