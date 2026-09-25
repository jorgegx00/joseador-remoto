import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Send,
  Calendar,
  ClipboardList,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

const navItems = [
  { path: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { path: "/jobs", icon: Briefcase, labelKey: "nav.jobs" },
  { path: "/cv", icon: FileText, labelKey: "nav.cv" },
  { path: "/generate/cv", icon: Sparkles, labelKey: "nav.optimize_cv" },
  { path: "/applications", icon: Send, labelKey: "nav.applications" },
  { path: "/interviews", icon: Calendar, labelKey: "nav.interviews" },
  { path: "/reports", icon: ClipboardList, labelKey: "nav.reports" },
  { path: "/settings", icon: Settings, labelKey: "nav.settings" },
] as const;

export function Sidebar() {
  const { t, i18n } = useTranslation("common");
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === "true";
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  const handleLanguageChange = (value: string) => {
    void i18n.changeLanguage(value);
  };

  return (
    <aside
      className={cn(
        "border-r border-border bg-sidebar-background flex flex-col h-full relative transition-[width] duration-300 ease-in-out",
        collapsed ? "w-16" : "w-70"
      )}
    >
      {/* Header */}
      <div className="flex items-center h-14 px-4 border-b border-border">
        {!collapsed && (
          <h1 className="text-lg font-semibold text-sidebar-foreground truncate">
            {t("app_name")}
          </h1>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("shrink-0", collapsed ? "mx-auto" : "ml-auto")}
          onClick={() => setCollapsed((prev) => !prev)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.path === "/"
                ? currentPath === "/"
                : currentPath.startsWith(item.path);

            const linkContent = (
              <Link
                to={item.path}
                className={cn(
                  "flex items-center gap-3 rounded-md text-sm transition-colors",
                  collapsed ? "justify-center px-2 py-2" : "px-3 py-2",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <li key={item.path}>
                  <Tooltip>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {t(item.labelKey)}
                    </TooltipContent>
                  </Tooltip>
                </li>
              );
            }

            return <li key={item.path}>{linkContent}</li>;
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border p-3 space-y-3">
        {/* Language switcher */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="w-full"
                onClick={() =>
                  handleLanguageChange(i18n.language === "es" ? "en" : "es")
                }
              >
                <span className="text-sm">{i18n.language === "es" ? "ES" : "EN"}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {t("language")}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Select value={i18n.language} onValueChange={handleLanguageChange}>
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="es">
                <span className="flex items-center gap-2">
                  <span>🇪🇸</span>
                  <span>Español</span>
                </span>
              </SelectItem>
              <SelectItem value="en">
                <span className="flex items-center gap-2">
                  <span>🇺🇸</span>
                  <span>English</span>
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        )}

        <Separator />

        {/* App version */}
        {!collapsed && (
          <p className="text-[10px] text-muted-foreground/60 text-center">
            {t("version")}
          </p>
        )}
      </div>
    </aside>
  );
}
