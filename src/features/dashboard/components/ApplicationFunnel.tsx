import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { Application } from "@/types";

interface ApplicationFunnelProps {
  applications: Application[];
}

interface FunnelStage {
  name: string;
  count: number;
  conversion: string;
  fill: string;
}

const STAGE_COLORS = [
  "#3b82f6", // blue-500
  "#6366f1", // indigo-500
  "#8b5cf6", // violet-500
  "#a855f7", // purple-500
  "#22c55e", // green-500
  "#10b981", // emerald-500
];

export function ApplicationFunnel({ applications }: ApplicationFunnelProps) {
  const { t } = useTranslation("dashboard");

  const stages = useMemo((): FunnelStage[] => {
    // Count applications that reached each stage (cumulative forward)
    const totalJobs = applications.length;

    const applied = applications.filter(
      (a) => a.status !== "saved",
    ).length;

    const phoneScreen = applications.filter((a) =>
      ["phone_screen", "interviewing", "technical", "final", "offered", "accepted"].includes(a.status),
    ).length;

    const interviewing = applications.filter((a) =>
      ["interviewing", "technical", "final", "offered", "accepted"].includes(a.status),
    ).length;

    const offered = applications.filter((a) =>
      ["offered", "accepted"].includes(a.status),
    ).length;

    const accepted = applications.filter((a) => a.status === "accepted").length;

    const counts = [totalJobs, applied, phoneScreen, interviewing, offered, accepted];
    const labels = [
      t("funnel.jobs_viewed"),
      t("funnel.applied"),
      t("funnel.phone_screen"),
      t("funnel.interviewing"),
      t("funnel.offered"),
      t("funnel.accepted"),
    ];

    return labels.map((name, i) => {
      const prev = i > 0 ? counts[i - 1] : 0;
      const rate = prev > 0 ? Math.round((counts[i] / prev) * 100) : 0;
      return {
        name,
        count: counts[i],
        conversion: i === 0 ? "" : t("funnel.conversion", { rate }),
        fill: STAGE_COLORS[i],
      };
    });
  }, [applications, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("funnel.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={stages}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value, _name, props) => {
                  const stage = (props as { payload?: FunnelStage }).payload;
                  return [
                    `${String(value ?? "")}${stage?.conversion ? ` (${stage.conversion})` : ""}`,
                    stage?.name ?? "",
                  ];
                }}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={28}>
                {stages.map((stage, index) => (
                  <Cell key={stage.name} fill={STAGE_COLORS[index]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {stages.map((stage, i) => (
            <div key={stage.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: STAGE_COLORS[i] }}
              />
              <span>{stage.name}: <span className="font-semibold text-foreground">{stage.count}</span></span>
              {stage.conversion && (
                <span className="text-muted-foreground">({stage.conversion})</span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
