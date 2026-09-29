import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Brain, Radar, Ban, Globe2, Lock } from "lucide-react";
import { GeneralSettings } from "@/features/settings/components/GeneralSettings";
import { MarketSettings } from "@/features/settings/components/MarketSettings";
import { PrivacySettings } from "@/features/settings/components/PrivacySettings";
import { LlmSettings } from "@/features/settings/components/LlmSettings";
import { ScrapingSettings } from "@/features/settings/components/ScrapingSettings";
import { BlacklistSettings } from "@/features/settings/components/BlacklistSettings";
import { useSettingsStore } from "@/stores/settingsStore";

export function SettingsPage() {
  const { t } = useTranslation("settings");
  const { loadSettings } = useSettingsStore();

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <PageContainer>
      <div className="space-y-6 max-w-5xl">
        <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general" className="gap-1.5">
              <Settings className="h-4 w-4" />
              {t("tabs.general")}
            </TabsTrigger>
            <TabsTrigger value="markets" className="gap-1.5">
              <Globe2 className="h-4 w-4" />
              {t("tabs.markets")}
            </TabsTrigger>
            <TabsTrigger value="llm" className="gap-1.5">
              <Brain className="h-4 w-4" />
              {t("tabs.llm")}
            </TabsTrigger>
            <TabsTrigger value="scraping" className="gap-1.5">
              <Radar className="h-4 w-4" />
              {t("tabs.scraping")}
            </TabsTrigger>
            <TabsTrigger value="blacklist" className="gap-1.5">
              <Ban className="h-4 w-4" />
              {t("tabs.blacklist")}
            </TabsTrigger>
            <TabsTrigger value="privacy" className="gap-1.5">
              <Lock className="h-4 w-4" />
              {t("tabs.privacy")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <GeneralSettings />
          </TabsContent>

          <TabsContent value="markets" className="mt-4">
            <MarketSettings />
          </TabsContent>

          <TabsContent value="llm" className="mt-4">
            <LlmSettings />
          </TabsContent>

          <TabsContent value="scraping" className="mt-4">
            <ScrapingSettings />
          </TabsContent>

          <TabsContent value="blacklist" className="mt-4">
            <BlacklistSettings />
          </TabsContent>

          <TabsContent value="privacy" className="mt-4">
            <PrivacySettings />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
