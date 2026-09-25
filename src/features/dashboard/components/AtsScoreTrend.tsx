import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import type { AtsDataPoint } from "../hooks/useDashboard";

interface AtsScoreTrendProps {
  atsHistory: AtsDataPoint[];
}

const CV_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#06b6d4", // cyan
];

interface ChartRow {
  date: number;
  dateFormatted: string;
  [key: string]: string | number;
}

export function AtsScoreTrend({ atsHistory }: AtsScoreTrendProps) {
  const { t, i18n } = useTranslation("dashboard");
  const navigate = useNavigate();
  const locale = i18n.language === "es" ? es : enUS;

  const { chartData, cvNames } = useMemo(() => {
    if (atsHistory.length === 0) return { chartData: [] as ChartRow[], cvNames: [] as string[] };

    // Get unique CV names
    const uniqueCvNames = [...new Set(atsHistory.map((p) => p.cvName))];

    // Group data points by date (rounded to day)
    const dateMap = new Map<string, ChartRow>();

    for (const point of atsHistory) {
      const dayKey = format(new Date(point.date), "yyyy-MM-dd");
      const existing = dateMap.get(dayKey);
      if (existing) {
        existing[point.cvName] = point.score;
      } else {
        const row: ChartRow = {
          date: point.date,
          dateFormatted: format(new Date(point.date), "MMM d", { locale }),
        };
        row[point.cvName] = point.score;
        dateMap.set(dayKey, row);
      }
    }

    const sorted = [...dateMap.values()].sort((a, b) => a.date - b.date);
    return { chartData: sorted, cvNames: uniqueCvNames };
  }, [atsHistory, locale]);

  if (atsHistory.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("ats_trend.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Shield}
            title={t("ats_trend.empty_title")}
            description={t("ats_trend.empty_description")}
            action={{
              label: t("ats_trend.run_ats"),
              onClick: () => void navigate({ to: "/cv" }),
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("ats_trend.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            >
              <XAxis
                dataKey="dateFormatted"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                label={{
                  value: t("ats_trend.score"),
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value, name) => [
                  `${String(value ?? "")}`,
                  t("ats_trend.cv_version", { name: String(name ?? "") }),
                ]}
              />
              {cvNames.length > 1 && (
                <Legend
                  formatter={(value: string) =>
                    t("ats_trend.cv_version", { name: value })
                  }
                />
              )}
              {cvNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={CV_COLORS[i % CV_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
