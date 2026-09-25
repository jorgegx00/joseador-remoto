import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Ban } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useJobStore } from "@/stores/jobStore";
import { TermListEditor } from "./TermListEditor";

/**
 * Company blacklist manager. Blacklisted companies' jobs are hidden from every
 * list (a display-time filter) — the jobs stay in the database, so removing a
 * company here makes its jobs reappear.
 */
export function BlacklistSettings() {
  const { t } = useTranslation("settings");
  const blacklist = useJobStore((s) => s.blacklist);
  const loadBlacklist = useJobStore((s) => s.loadBlacklist);
  const setBlacklist = useJobStore((s) => s.setBlacklist);

  useEffect(() => {
    void loadBlacklist();
  }, [loadBlacklist]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-5 w-5" />
          {t("blacklist.title")}
        </CardTitle>
        <CardDescription>{t("blacklist.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <TermListEditor
          terms={blacklist}
          placeholder={t("blacklist.placeholder")}
          showRestoreDefaults={false}
          onChange={(names) => void setBlacklist(names)}
        />
        {blacklist.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("blacklist.empty")}</p>
        )}
      </CardContent>
    </Card>
  );
}
