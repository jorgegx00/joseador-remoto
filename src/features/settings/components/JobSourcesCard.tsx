import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Building2, ExternalLink, Newspaper } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { storageService } from "@/services/storage";
import {
  SOURCES,
  getFollowedBoards,
  isSourceEnabled,
  setFollowedBoards,
  setSourceEnabled,
  sourceServesMarkets,
  type SourceDef,
  type SourceId,
} from "@/services/ingest/sources";
import { parseBoard } from "@/services/ingest/feed-sources";
import { useSettingsStore } from "@/stores/settingsStore";
import { ApiKeyInput } from "./ApiKeyInput";
import { TermListEditor } from "./TermListEditor";

interface SourceState {
  enabled: boolean;
  keys: Record<string, boolean>;
}

/**
 * Where "Search jobs" looks. Legitimate feeds first (free, market-aware), then
 * key-based aggregators, then the scraping resellers with their legal notice.
 */
export function JobSourcesCard() {
  const { t } = useTranslation("settings");
  const markets = useSettingsStore((s) => s.market.targetMarkets);
  const [state, setState] = useState<Record<string, SourceState>>({});
  const [boards, setBoards] = useState<string[]>([]);

  const reload = useCallback(async () => {
    const entries = await Promise.all(
      SOURCES.map(async (def) => {
        const keys = Object.fromEntries(
          await Promise.all(def.keys.map(async (k) => [k.name, Boolean(await storageService.getSetting(`api_key_${k.name}`))] as const)),
        );
        return [def.id, { enabled: await isSourceEnabled(def), keys }] as const;
      }),
    );
    setState(Object.fromEntries(entries));
    setBoards(await getFollowedBoards());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = async (id: SourceId, enabled: boolean) => {
    await setSourceEnabled(id, enabled);
    await reload();
  };

  const saveBoards = async (list: string[] | null) => {
    const next = list ?? [];
    const invalid = next.filter((b) => !parseBoard(b));
    if (invalid.length > 0) {
      toast.error(t("sources.board_invalid", { board: invalid[0] }));
      return;
    }
    await setFollowedBoards(next);
    await reload();
  };

  const row = (def: SourceDef) => {
    const s = state[def.id];
    if (!s) return null;
    const missingKey = def.keys.some((k) => !s.keys[k.name]);
    const relevant = sourceServesMarkets(def, markets);
    return (
      <li key={def.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor={`source-${def.id}`} className="flex flex-wrap items-center gap-2">
              {def.label}
              {def.keys.length === 0 && <Badge variant="secondary">{t("sources.free")}</Badge>}
              {def.legalRisk && (
                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                  {t("sources.legal_risk")}
                </Badge>
              )}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t(`sources.coverage.${def.coverage}`)}
              {def.website && (
                <>
                  {" · "}
                  <a href={def.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
                    {new URL(def.website).hostname.replace(/^www\./, "")}
                    <ExternalLink aria-hidden="true" className="h-3 w-3" />
                  </a>
                </>
              )}
            </p>
            {!relevant && <p className="text-xs text-muted-foreground">{t("sources.not_for_markets")}</p>}
            {def.legalRisk && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                {t(`sources.legal_note.${def.id}`)}
              </p>
            )}
          </div>
          <Switch
            id={`source-${def.id}`}
            checked={s.enabled}
            disabled={missingKey || (def.id === "ats-boards" && boards.length === 0)}
            onCheckedChange={(v) => void toggle(def.id, v)}
          />
        </div>
        {def.keys.map((k) => (
          <div key={k.name} className="space-y-1 pl-0.5">
            <p className="text-xs text-muted-foreground">
              {t(`sources.key_label.${k.label}`)} ·{" "}
              <a href={k.signupUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {t("scraping.get_key_link")}
              </a>
            </p>
            <ApiKeyInput
              isKeySet={Boolean(s.keys[k.name])}
              placeholder="…"
              onSave={async (value) => {
                await storageService.saveApiKey(k.name, value);
                await reload();
              }}
              onClear={async () => {
                await storageService.deleteApiKey(k.name);
                await reload();
              }}
            />
          </div>
        ))}
        {def.id === "ats-boards" && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("sources.boards_hint")}</p>
            <TermListEditor
              terms={boards}
              placeholder="https://job-boards.greenhouse.io/company"
              showRestoreDefaults={false}
              onChange={(list) => void saveBoards(list)}
            />
          </div>
        )}
      </li>
    );
  };

  const feeds = SOURCES.filter((d) => !d.legalRisk && d.id !== "ats-boards");
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" aria-hidden="true" />
            {t("sources.title")}
          </CardTitle>
          <CardDescription>{t("sources.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">{feeds.map(row)}</ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" aria-hidden="true" />
            {t("sources.companies_title")}
          </CardTitle>
          <CardDescription>{t("sources.companies_description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul>{SOURCES.filter((d) => d.id === "ats-boards").map(row)}</ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
            {t("sources.scrapers_title")}
          </CardTitle>
          <CardDescription>{t("sources.scrapers_description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">{SOURCES.filter((d) => d.legalRisk).map(row)}</ul>
        </CardContent>
      </Card>
    </>
  );
}
