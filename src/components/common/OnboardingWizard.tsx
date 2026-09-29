import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import {
  PartyPopper,
  Globe,
  FileText,
  Cpu,
  Rocket,
  X,
  ArrowRight,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  MapPin,
} from "lucide-react";
import { MarketProfileForm } from "@/features/markets/MarketProfileForm";
import { getCountryProfile, suggestResidence } from "@/lib/markets/countries";
import { regionContains } from "@/lib/markets/regions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CvUploadZone } from "@/features/cv/components/CvUploadZone";
import { useSettingsStore } from "@/stores/settingsStore";
import { LLM_PROVIDERS } from "@/services/llm";
import { storageService } from "@/services/storage";
import { cn } from "@/lib/utils";
import {
  listOllamaModels,
  normalizeOllamaBaseUrl,
  resolveOllamaBaseUrl,
} from "@/lib/llm/providers/ollama";
import type { LlmProviderName, OllamaMode } from "@/types";

interface OnboardingWizardProps {
  onComplete: () => void;
}

const TOTAL_STEPS = 5;

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t, i18n } = useTranslation("onboarding");
  const navigate = useNavigate();
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState<"es" | "en">(
    (i18n.language?.startsWith("en") ? "en" : "es") as "es" | "en"
  );

  const markOnboardingComplete = useCallback(async () => {
    await storageService.saveSetting("onboarding_complete", "true");
    onComplete();
  }, [onComplete]);

  const handleNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep]);

  const handleLanguageChange = useCallback(
    (value: string) => {
      const lang = value as "es" | "en";
      setSelectedLanguage(lang);
      void i18n.changeLanguage(lang);
      void setLanguage(lang);
    },
    [i18n, setLanguage]
  );

  const handleDismiss = useCallback(() => {
    void markOnboardingComplete();
  }, [markOnboardingComplete]);

  const handleFindJobs = useCallback(() => {
    void markOnboardingComplete();
    void navigate({ to: "/jobs" });
  }, [markOnboardingComplete, navigate]);

  const handleExplore = useCallback(() => {
    void markOnboardingComplete();
    void navigate({ to: "/" });
  }, [markOnboardingComplete, navigate]);

  const stepLabels = [
    t("step_1"),
    t("step_markets"),
    t("step_2"),
    t("step_3"),
    t("step_4"),
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-lg relative">
        {/* Dismiss button */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-3 right-3 z-10"
          onClick={handleDismiss}
          aria-label={t("dismiss")}
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-3 pt-6 px-6">
          {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <div
                className={cn(
                  "h-2.5 w-2.5 rounded-full transition-all duration-300",
                  index === currentStep
                    ? "bg-primary scale-125"
                    : index < currentStep
                      ? "bg-primary/60"
                      : "bg-muted-foreground/30"
                )}
              />
              <span
                className={cn(
                  "text-[10px] hidden sm:inline transition-colors",
                  index === currentStep
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                )}
              >
                {stepLabels[index]}
              </span>
            </div>
          ))}
        </div>

        {/* Step content */}
        {currentStep === 0 && (
          <StepWelcome
            selectedLanguage={selectedLanguage}
            onLanguageChange={handleLanguageChange}
            onNext={handleNext}
          />
        )}
        {currentStep === 1 && (
          <StepMarkets onNext={handleNext} />
        )}
        {currentStep === 2 && (
          <StepUploadCv onNext={handleNext} />
        )}
        {currentStep === 3 && (
          <StepConfigureLlm onNext={handleNext} />
        )}
        {currentStep === 4 && (
          <StepReady
            onFindJobs={handleFindJobs}
            onExplore={handleExplore}
          />
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Welcome + Language
// ---------------------------------------------------------------------------
function StepWelcome({
  selectedLanguage,
  onLanguageChange,
  onNext,
}: {
  selectedLanguage: "es" | "en";
  onLanguageChange: (value: string) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation("onboarding");

  return (
    <>
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <div className="rounded-full bg-primary/10 p-4">
            <Globe className="h-10 w-10 text-primary" />
          </div>
        </div>
        <CardTitle className="text-xl">{t("welcome_title")}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          {t("welcome_description")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="language-select">
            {t("language_label")}
          </label>
          <Select value={selectedLanguage} onValueChange={onLanguageChange}>
            <SelectTrigger className="w-full" id="language-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="es">Espanol</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>

      <CardFooter className="justify-end">
        <Button onClick={onNext} className="gap-2">
          {t("common:actions.next")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Where are you job hunting?
// ---------------------------------------------------------------------------
function StepMarkets({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation("onboarding");
  const marketConfigured = useSettingsStore((s) => s.marketConfigured);
  const setMarketProfile = useSettingsStore((s) => s.setMarketProfile);

  // First run: pre-fill from the OS timezone / locale (never IP geolocation).
  useEffect(() => {
    if (marketConfigured) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const home = suggestResidence(tz, navigator.languages ?? []);
    if (!home) return;
    const targets = [home, ...(regionContains("LATAM", home) ? ["LATAM"] : []), "WORLDWIDE"];
    void setMarketProfile({
      residenceCountry: home,
      targetMarkets: targets,
      preferredCurrency: home === "DO" ? "USD" : getCountryProfile(home).currency,
    });
  }, [marketConfigured, setMarketProfile]);

  return (
    <>
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <div className="rounded-full bg-primary/10 p-4">
            <MapPin className="h-10 w-10 text-primary" />
          </div>
        </div>
        <CardTitle className="text-xl">{t("markets_title")}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">{t("markets_description")}</CardDescription>
      </CardHeader>

      <CardContent>
        <MarketProfileForm compact />
      </CardContent>

      <CardFooter className="justify-end">
        <Button onClick={() => { void setMarketProfile({}); onNext(); }} className="gap-2">
          {t("common:actions.next")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Upload CV
// ---------------------------------------------------------------------------
function StepUploadCv({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation("onboarding");

  return (
    <>
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <div className="rounded-full bg-primary/10 p-4">
            <FileText className="h-10 w-10 text-primary" />
          </div>
        </div>
        <CardTitle className="text-xl">{t("upload_cv_title")}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          {t("upload_cv_description")}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <CvUploadZone compact />
      </CardContent>

      <CardFooter className="justify-between">
        <Button variant="link" size="sm" onClick={onNext}>
          {t("skip_for_now")}
        </Button>
        <Button onClick={onNext} className="gap-2">
          {t("common:actions.next")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Configure LLM
// ---------------------------------------------------------------------------
function StepConfigureLlm({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const { saveApiKey, setActiveProviderAndModel } = useSettingsStore();

  const [provider, setProvider] = useState<LlmProviderName>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  const handleGoToSettings = useCallback(() => {
    void navigate({ to: "/settings" });
  }, [navigate]);

  const handleSaveKey = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) return;
    setSaveState("saving");
    try {
      await saveApiKey(provider, key);
      const defaultModel = LLM_PROVIDERS[provider].defaultModels[0] ?? "";
      await setActiveProviderAndModel(provider, defaultModel);
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    }
  }, [apiKey, provider, saveApiKey, setActiveProviderAndModel]);

  return (
    <>
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <div className="rounded-full bg-primary/10 p-4">
            <Cpu className="h-10 w-10 text-primary" />
          </div>
        </div>
        <CardTitle className="text-xl">{t("llm_title")}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          {t("llm_description")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Pick a provider, then paste an API key (cloud) or point at a server (Ollama) */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="onboarding-provider">
              {t("byot_provider_label")}
            </label>
            <Select
              value={provider}
              onValueChange={(value) => {
                setProvider(value as LlmProviderName);
                setSaveState("idle");
              }}
            >
              <SelectTrigger className="w-full" id="onboarding-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(LLM_PROVIDERS).map((info) => (
                  <SelectItem key={info.name} value={info.name}>
                    {info.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {provider === "ollama" ? (
            <OllamaOnboardingSetup />
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="onboarding-api-key">
                {t("byot_key_label")}
              </label>
              <div className="flex gap-2">
                <Input
                  id="onboarding-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setSaveState("idle");
                  }}
                  placeholder={t("byot_key_placeholder")}
                  className="flex-1 h-8 text-sm"
                  autoComplete="off"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSaveKey()}
                  disabled={!apiKey.trim() || saveState === "saving"}
                  className="shrink-0 h-8"
                >
                  {saveState === "saving" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : null}
                  {t("byot_save")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("byot_hint")}</p>
              {saveState === "saved" && (
                <div className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t("byot_saved")}
                </div>
              )}
              {saveState === "failed" && (
                <div className="flex items-center gap-1.5 text-sm text-red-600">
                  <XCircle className="h-3.5 w-3.5" />
                  {t("byot_failed")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cloud providers */}
        <div className="rounded-lg border p-4 space-y-2">
          <p className="font-medium text-sm">{t("cloud_options_title")}</p>
          <p className="text-sm text-muted-foreground">
            {t("cloud_options_description")}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoToSettings}
            className="gap-1"
          >
            {t("configure_later")}
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>

      <CardFooter className="justify-between">
        <Button variant="link" size="sm" onClick={onNext}>
          {t("skip_for_now")}
        </Button>
        <Button onClick={onNext} className="gap-2">
          {t("common:actions.next")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardFooter>
    </>
  );
}

/** Ollama variant of the LLM step: choose where the server runs and connect to it. */
function OllamaOnboardingSetup() {
  const { t } = useTranslation("onboarding");
  const { saveApiKey, setOllamaSettings, setActiveProviderAndModel, setLlmSettings } =
    useSettingsStore();

  const [mode, setMode] = useState<OllamaMode>("local");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" | "connecting" }
    | { kind: "connected"; count: number }
    | { kind: "failed"; message: string }
  >({ kind: "idle" });

  const handleConnect = useCallback(async () => {
    setState({ kind: "connecting" });
    try {
      const baseUrl = resolveOllamaBaseUrl(mode, url);
      const key = mode === "remote" ? apiKey.trim() || undefined : undefined;
      const models = await listOllamaModels(baseUrl, key);

      await setOllamaSettings({ mode, base_url: mode === "local" ? "" : normalizeOllamaBaseUrl(url) || baseUrl });
      if (key) await saveApiKey("ollama", key);
      const { llm } = useSettingsStore.getState();
      setLlmSettings({
        providers: { ...llm.providers, ollama: { ...llm.providers.ollama, enabled: true } },
      });
      await storageService.saveSetting("llm_provider_ollama_enabled", "true");
      await setActiveProviderAndModel(
        "ollama",
        models[0] ?? LLM_PROVIDERS.ollama.defaultModels[0] ?? "",
      );
      setState({ kind: "connected", count: models.length });
    } catch (err) {
      setState({ kind: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }, [mode, url, apiKey, saveApiKey, setOllamaSettings, setActiveProviderAndModel, setLlmSettings]);

  const reset = () => setState({ kind: "idle" });

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="onboarding-ollama-mode">
        {t("ollama_mode_label")}
      </label>
      <Select
        value={mode}
        onValueChange={(value) => {
          setMode(value as OllamaMode);
          setUrl("");
          reset();
        }}
      >
        <SelectTrigger className="w-full" id="onboarding-ollama-mode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="local">{t("ollama_mode_local")}</SelectItem>
          <SelectItem value="lan">{t("ollama_mode_lan")}</SelectItem>
          <SelectItem value="remote">{t("ollama_mode_remote")}</SelectItem>
        </SelectContent>
      </Select>

      {mode !== "local" && (
        <Input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            reset();
          }}
          placeholder={mode === "lan" ? "192.168.1.50:11434" : "https://ollama.com"}
          className="h-8 text-sm font-mono"
          autoComplete="off"
          spellCheck={false}
        />
      )}
      {mode === "remote" && (
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            reset();
          }}
          placeholder={t("ollama_key_placeholder")}
          className="h-8 text-sm"
          autoComplete="off"
        />
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleConnect()}
          disabled={state.kind === "connecting" || (mode === "lan" && !url.trim())}
          className="h-8"
        >
          {state.kind === "connecting" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          {t("ollama_connect")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t(`ollama_hint_${mode}`)}</p>

      {state.kind === "connected" && (
        <div
          className={cn(
            "flex items-center gap-1.5 text-sm",
            state.count > 0 ? "text-green-600" : "text-amber-600",
          )}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {state.count > 0 ? t("ollama_connected", { count: state.count }) : t("ollama_no_models")}
        </div>
      )}
      {state.kind === "failed" && (
        <div className="flex items-start gap-1.5 text-sm text-red-600">
          <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{t("ollama_failed", { message: state.message })}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Ready
// ---------------------------------------------------------------------------
function StepReady({
  onFindJobs,
  onExplore,
}: {
  onFindJobs: () => void;
  onExplore: () => void;
}) {
  const { t } = useTranslation("onboarding");

  return (
    <>
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <div className="rounded-full bg-green-500/10 p-4">
            <PartyPopper className="h-10 w-10 text-green-500" />
          </div>
        </div>
        <CardTitle className="text-xl">{t("ready_title")}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          {t("ready_description")}
        </CardDescription>
      </CardHeader>

      <CardContent />

      <CardFooter className="flex-col gap-3">
        <Button onClick={onFindJobs} className="w-full gap-2" size="lg">
          <Rocket className="h-4 w-4" />
          {t("lets_find_jobs")}
        </Button>
        <Button
          variant="outline"
          onClick={onExplore}
          className="w-full"
          size="lg"
        >
          {t("explore_app")}
        </Button>
      </CardFooter>
    </>
  );
}
