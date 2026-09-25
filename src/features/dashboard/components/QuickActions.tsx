import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Briefcase, FileUp, Shield, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface QuickAction {
  icon: LucideIcon;
  label: string;
  route: string;
  color: string;
  bgColor: string;
}

export function QuickActions() {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();

  const actions: QuickAction[] = [
    {
      icon: Briefcase,
      label: t("quick_actions.search_jobs"),
      route: "/jobs",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
    },
    {
      icon: FileUp,
      label: t("quick_actions.upload_cv"),
      route: "/cv",
      color: "text-green-500",
      bgColor: "bg-green-500/10 hover:bg-green-500/20",
    },
    {
      icon: Shield,
      label: t("quick_actions.run_ats"),
      route: "/cv",
      color: "text-purple-500",
      bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
    },
    {
      icon: Send,
      label: t("quick_actions.view_applications"),
      route: "/applications",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {actions.map((action) => (
        <Card
          key={action.label}
          className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5"
          onClick={() => void navigate({ to: action.route })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              void navigate({ to: action.route });
            }
          }}
        >
          <CardContent className="flex flex-col items-center justify-center py-6 gap-3">
            <div className={`rounded-xl p-3 ${action.bgColor} transition-colors`}>
              <action.icon className={`h-6 w-6 ${action.color}`} />
            </div>
            <span className="text-sm font-medium text-center">{action.label}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
