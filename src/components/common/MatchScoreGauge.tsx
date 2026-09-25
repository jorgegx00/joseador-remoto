import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface MatchScoreGaugeProps {
  score: number;
  size: "sm" | "md" | "lg";
  animated?: boolean;
}

const SIZE_MAP = {
  sm: { px: 48, stroke: 3, fontSize: 10, gradeSize: 7 },
  md: { px: 80, stroke: 4, fontSize: 18, gradeSize: 11 },
  lg: { px: 120, stroke: 6, fontSize: 28, gradeSize: 14 },
} as const;

function getScoreColor(score: number): string {
  if (score < 40) return "#ef4444";
  if (score <= 60) return "#f97316";
  if (score <= 75) return "#eab308";
  return "#22c55e";
}

function getScoreGrade(score: number): { letter: string; key: string } {
  if (score >= 90) return { letter: "A", key: "grades.grade_a" };
  if (score >= 75) return { letter: "B", key: "grades.grade_b" };
  if (score >= 60) return { letter: "C", key: "grades.grade_c" };
  if (score >= 40) return { letter: "D", key: "grades.grade_d" };
  return { letter: "F", key: "grades.grade_f" };
}

export function MatchScoreGauge({
  score,
  size,
  animated = false,
}: MatchScoreGaugeProps) {
  const { t } = useTranslation("common");
  const clampedScore = Math.max(0, Math.min(100, score));
  const config = SIZE_MAP[size];
  const radius = (config.px - config.stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = getScoreColor(clampedScore);
  const grade = getScoreGrade(clampedScore);

  const [displayProgress, setDisplayProgress] = useState(
    animated ? 0 : clampedScore
  );

  useEffect(() => {
    if (!animated) {
      setDisplayProgress(clampedScore);
      return;
    }

    setDisplayProgress(0);
    const timer = requestAnimationFrame(() => {
      setDisplayProgress(clampedScore);
    });

    return () => cancelAnimationFrame(timer);
  }, [clampedScore, animated]);

  const dashOffset =
    circumference - (displayProgress / 100) * circumference;

  const center = config.px / 2;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: config.px, height: config.px }}
      role="meter"
      aria-valuenow={clampedScore}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${t(grade.key)}: ${clampedScore}%`}
    >
      <svg
        width={config.px}
        height={config.px}
        className="-rotate-90"
        viewBox={`0 0 ${config.px} ${config.px}`}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted/20"
          strokeWidth={config.stroke}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={config.stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={cn(
            animated && "transition-[stroke-dashoffset] duration-1000 ease-out"
          )}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-bold leading-none text-foreground"
          style={{ fontSize: config.fontSize }}
        >
          {clampedScore}
        </span>
        <span
          className="font-medium leading-none text-muted-foreground"
          style={{ fontSize: config.gradeSize }}
        >
          {grade.letter}
        </span>
      </div>
    </div>
  );
}
