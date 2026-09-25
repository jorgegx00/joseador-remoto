import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import esCommon from "./es/common.json";
import enCommon from "./en/common.json";
import esJobs from "./es/jobs.json";
import enJobs from "./en/jobs.json";
import esCv from "./es/cv.json";
import enCv from "./en/cv.json";
import esApplications from "./es/applications.json";
import enApplications from "./en/applications.json";
import esInterviewPrep from "./es/interview-prep.json";
import enInterviewPrep from "./en/interview-prep.json";
import esSettings from "./es/settings.json";
import enSettings from "./en/settings.json";
import esLlm from "./es/llm.json";
import enLlm from "./en/llm.json";
import esGeneration from "./es/generation.json";
import enGeneration from "./en/generation.json";
import esDashboard from "./es/dashboard.json";
import enDashboard from "./en/dashboard.json";
import esOnboarding from "./es/onboarding.json";
import enOnboarding from "./en/onboarding.json";
import esReports from "./es/reports.json";
import enReports from "./en/reports.json";

const resources = {
  es: {
    common: esCommon,
    jobs: esJobs,
    cv: esCv,
    applications: esApplications,
    "interview-prep": esInterviewPrep,
    settings: esSettings,
    llm: esLlm,
    generation: esGeneration,
    dashboard: esDashboard,
    onboarding: esOnboarding,
    reports: esReports,
  },
  en: {
    common: enCommon,
    jobs: enJobs,
    cv: enCv,
    applications: enApplications,
    "interview-prep": enInterviewPrep,
    settings: enSettings,
    llm: enLlm,
    generation: enGeneration,
    dashboard: enDashboard,
    onboarding: enOnboarding,
    reports: enReports,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "es",
    defaultNS: "common",
    ns: ["common", "jobs", "cv", "applications", "interview-prep", "settings", "llm", "generation", "dashboard", "onboarding", "reports"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
