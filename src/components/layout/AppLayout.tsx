import { type ReactNode, useState, useEffect, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Toaster } from "@/components/ui/sonner";
import { GlobalErrorBoundary } from "@/components/common/GlobalErrorBoundary";
import { OnboardingWizard } from "@/components/common/OnboardingWizard";
import { storageService } from "@/services/storage";
import { checkAndNotifyUpcomingInterviews } from "@/lib/notifications";
import { useCvStore } from "@/stores/cvStore";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkOnboarding() {
      try {
        const completed = await storageService.getSetting("onboarding_complete");
        if (!cancelled && completed !== "true") {
          setShowOnboarding(true);
        }
      } catch {
        // If settings aren't available yet, show onboarding
        if (!cancelled) {
          setShowOnboarding(true);
        }
      } finally {
        if (!cancelled) {
          setOnboardingChecked(true);
        }
      }
    }
    void checkOnboarding();
    return () => {
      cancelled = true;
    };
  }, []);

  // Check for upcoming interviews on mount
  useEffect(() => {
    void checkAndNotifyUpcomingInterviews();
  }, []);

  // Load CVs and set the primary one as active so the match-analysis card
  // and other CV-aware UI have data on first render / after restart.
  useEffect(() => {
    void useCvStore.getState().hydrate();
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  return (
    <GlobalErrorBoundary>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 flex flex-col overflow-hidden">
            {children}
          </main>
        </div>
        <Toaster />
        {onboardingChecked && showOnboarding && (
          <OnboardingWizard onComplete={handleOnboardingComplete} />
        )}
      </div>
    </GlobalErrorBoundary>
  );
}
