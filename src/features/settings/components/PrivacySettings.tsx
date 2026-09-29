import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RETENTION_OPTIONS, clearStoredPageText, getRetentionDays, setRetentionDays } from "@/services/privacy";

/** What the app stores and sends, with retention controls for stored page text. */
export function PrivacySettings() {
  const { t } = useTranslation("settings");
  const [retention, setRetention] = useState<number | null>(null);

  useEffect(() => {
    void getRetentionDays().then(setRetention);
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" aria-hidden="true" />
            {t("privacy.data_title")}
          </CardTitle>
          <CardDescription>{t("privacy.data_description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>{t("privacy.fact_local")}</li>
            <li>{t("privacy.fact_keys")}</li>
            <li>{t("privacy.fact_llm")}</li>
            <li>{t("privacy.fact_no_telemetry")}</li>
            <li>{t("privacy.fact_rights")}</li>
          </ul>

          <div className="space-y-2">
            <Label htmlFor="privacy-retention">{t("privacy.retention_label")}</Label>
            <p className="text-xs text-muted-foreground">{t("privacy.retention_hint")}</p>
            {retention !== null && (
              <Select
                value={String(retention)}
                onValueChange={(v) => {
                  const days = Number(v);
                  setRetention(days);
                  void setRetentionDays(days).then(() => toast.success(t("privacy.retention_saved")));
                }}
              >
                <SelectTrigger id="privacy-retention" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETENTION_OPTIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d === 0 ? t("privacy.retention_none") : d < 0 ? t("privacy.retention_forever") : t("privacy.retention_days", { count: d })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button
            variant="outline"
            onClick={() =>
              void clearStoredPageText().then((n) => toast.success(t("privacy.cleared", { count: n })))
            }
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t("privacy.clear_now")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
