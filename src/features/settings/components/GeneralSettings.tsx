import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Download, Trash2, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useSettingsStore } from "@/stores/settingsStore";
import { toast } from "sonner";

export function GeneralSettings() {
  const { t } = useTranslation("settings");
  const { app, setLanguage, setTheme, setAppSettings, loadSettings } =
    useSettingsStore();

  const [showClearDataDialog, setShowClearDataDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const handleExportData = () => {
    toast.info(t("general.coming_soon"));
  };

  const handleClearData = () => {
    toast.info(t("general.coming_soon"));
  };

  const handleResetSettings = () => {
    void loadSettings();
    toast.success(t("general.settings_reset_success"));
  };

  return (
    <div className="space-y-4">
      {/* Language selector */}
      <Card>
        <CardHeader>
          <CardTitle>{t("general.language")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={app.language}
            onValueChange={(v) => void setLanguage(v as "es" | "en")}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="es">{t("general.language_es")}</SelectItem>
              <SelectItem value="en">{t("general.language_en")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Theme selector */}
      <Card>
        <CardHeader>
          <CardTitle>{t("general.theme")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={app.theme}
            onValueChange={(v) => void setTheme(v as "light" | "dark" | "system")}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t("general.theme_light")}</SelectItem>
              <SelectItem value="dark">{t("general.theme_dark")}</SelectItem>
              <SelectItem value="system">{t("general.theme_system")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>{t("general.notifications")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="notifications">
              {t("general.notifications_enabled")}
            </Label>
            <Switch
              id="notifications"
              checked={app.notifications_enabled}
              onCheckedChange={(checked) =>
                setAppSettings({ notifications_enabled: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Data management */}
      <Card>
        <CardHeader>
          <CardTitle>{t("general.data_management")}</CardTitle>
          <CardDescription>{t("general.data_management_description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-start" onClick={handleExportData}>
            <Download className="h-4 w-4 mr-2" />
            {t("general.export_data")}
          </Button>

          <Separator />

          <Button
            variant="outline"
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={() => setShowClearDataDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t("general.clear_data")}
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setShowResetDialog(true)}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {t("general.reset_settings")}
          </Button>
        </CardContent>
      </Card>

      {/* About section */}
      <Card>
        <CardHeader>
          <CardTitle>{t("general.about")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <p className="text-lg font-semibold">{t("general.app_name")}</p>
            <p className="text-sm text-muted-foreground">
              {t("general.version", { version: "0.1.0" })}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("general.app_description")}
          </p>
          <a
            href="https://github.com/joseador-remoto"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            {t("general.github_link")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </CardContent>
      </Card>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={showClearDataDialog}
        onOpenChange={setShowClearDataDialog}
        title={t("general.clear_data_title")}
        description={t("general.clear_data_description")}
        variant="destructive"
        onConfirm={handleClearData}
      />

      <ConfirmDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        title={t("general.reset_settings_title")}
        description={t("general.reset_settings_description")}
        onConfirm={handleResetSettings}
      />
    </div>
  );
}
