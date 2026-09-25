import { useState, useCallback } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { useTranslation } from "react-i18next";
import { createLlmService } from "@/lib/llm";
import { getConfig } from "@/services/llm";
import {
  getStarStoriesByCvId,
  insertStarStory,
  updateStarStory,
  deleteStarStory as dbDeleteStarStory,
} from "@/services/database";
import { useSettingsStore } from "@/stores/settingsStore";
import type { StarStory, ParsedCv } from "@/types";
import type { LlmProviderConfig } from "@/lib/llm/providers/base";

interface UseStarStoriesReturn {
  stories: StarStory[];
  isLoading: boolean;
  generatingForIndex: Set<number>;
  hasLlm: boolean;
  loadStories: (cvId: string) => Promise<void>;
  generateForExperience: (
    cv: ParsedCv,
    cvId: string,
    experienceIndex: number,
  ) => Promise<void>;
  generateAll: (cv: ParsedCv, cvId: string) => Promise<void>;
  saveStory: (story: StarStory) => Promise<void>;
  deleteStory: (storyId: string) => Promise<void>;
  getStoriesByExperience: (experienceIndex: number) => StarStory[];
  filterBySkill: (skill: string) => StarStory[];
}

export function useStarStories(): UseStarStoriesReturn {
  const { t } = useTranslation("interview-prep");
  const [stories, setStories] = useState<StarStory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [generatingForIndex, setGeneratingForIndex] = useState<Set<number>>(
    new Set(),
  );

  const activeProvider = useSettingsStore((s) => s.llm.active_provider);
  const hasLlm = activeProvider !== null;

  const getProviderConfig =
    useCallback(async (): Promise<LlmProviderConfig | null> => {
      const { llm } = useSettingsStore.getState();
      if (!llm.active_provider) return null;
      return getConfig(llm.active_provider);
    }, []);

  const loadStories = useCallback(async (cvId: string) => {
    setIsLoading(true);
    try {
      const loaded = await getStarStoriesByCvId(cvId);
      setStories(loaded);
    } catch (err) {
      console.error("Failed to load STAR stories:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const generateForExperience = useCallback(
    async (cv: ParsedCv, cvId: string, experienceIndex: number) => {
      setGeneratingForIndex((prev) => new Set(prev).add(experienceIndex));
      try {
        const config = await getProviderConfig();
        if (!config) {
          toast.error(t("star.no_llm"));
          return;
        }
        const service = createLlmService(config);
        const generated = await service.generateStarStories(
          cv,
          experienceIndex,
        );
        const now = Date.now();
        const newStories: StarStory[] = generated.map((s) => ({
          id: ulid(),
          cv_id: cvId,
          experience_index: experienceIndex,
          title: s.title,
          situation: s.situation,
          task: s.task,
          action: s.action,
          result: s.result,
          skills_demonstrated: s.skills_demonstrated,
          is_user_edited: false,
          created_at: now,
          updated_at: now,
        }));

        for (const story of newStories) {
          await insertStarStory(story);
        }

        setStories((prev) => [...prev, ...newStories]);
        toast.success(t("star.generated_success"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg);
      } finally {
        setGeneratingForIndex((prev) => {
          const next = new Set(prev);
          next.delete(experienceIndex);
          return next;
        });
      }
    },
    [getProviderConfig, t],
  );

  const generateAll = useCallback(
    async (cv: ParsedCv, cvId: string) => {
      for (let i = 0; i < cv.experience.length; i++) {
        await generateForExperience(cv, cvId, i);
      }
    },
    [generateForExperience],
  );

  const saveStory = useCallback(async (story: StarStory) => {
    try {
      const existing = stories.find((s) => s.id === story.id);
      if (existing) {
        await updateStarStory(story);
        setStories((prev) =>
          prev.map((s) => (s.id === story.id ? story : s)),
        );
      } else {
        await insertStarStory(story);
        setStories((prev) => [...prev, story]);
      }
      toast.success(t("star.saved_success"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    }
  }, [stories, t]);

  const deleteStory = useCallback(
    async (storyId: string) => {
      try {
        await dbDeleteStarStory(storyId);
        setStories((prev) => prev.filter((s) => s.id !== storyId));
        toast.success(t("star.deleted_success"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg);
      }
    },
    [t],
  );

  const getStoriesByExperience = useCallback(
    (experienceIndex: number) => {
      return stories.filter((s) => s.experience_index === experienceIndex);
    },
    [stories],
  );

  const filterBySkill = useCallback(
    (skill: string) => {
      if (!skill) return stories;
      const lower = skill.toLowerCase();
      return stories.filter((s) =>
        s.skills_demonstrated.some((sk) => sk.toLowerCase().includes(lower)),
      );
    },
    [stories],
  );

  return {
    stories,
    isLoading,
    generatingForIndex,
    hasLlm,
    loadStories,
    generateForExperience,
    generateAll,
    saveStory,
    deleteStory,
    getStoriesByExperience,
    filterBySkill,
  };
}
