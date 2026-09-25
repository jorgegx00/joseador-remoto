import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import {
  Sparkles,
  AlertTriangle,
  Plus,
  FileUp,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { StarStoryCard } from "./StarStoryCard";
import { StarStoryEditor } from "./StarStoryEditor";
import { useStarStories } from "../hooks/useStarStories";
import type { CvRecord, CvExperience, StarStory } from "@/types";

interface StarStoryBankProps {
  cvs: CvRecord[];
  selectedCvId: string | null;
  onCvChange: (cvId: string) => void;
}

export function StarStoryBank({
  cvs,
  selectedCvId,
  onCvChange,
}: StarStoryBankProps) {
  const { t } = useTranslation("interview-prep");
  const {
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
  } = useStarStories();

  const [skillFilter, setSkillFilter] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<StarStory | undefined>(
    undefined,
  );
  const [editorExperienceIndex, setEditorExperienceIndex] = useState(0);

  const selectedCv = useMemo(
    () => cvs.find((cv) => cv.id === selectedCvId) ?? null,
    [cvs, selectedCvId],
  );

  const experiences: CvExperience[] = useMemo(
    () => selectedCv?.parsed_data?.experience ?? [],
    [selectedCv],
  );

  useEffect(() => {
    if (selectedCvId) {
      loadStories(selectedCvId);
    }
  }, [selectedCvId, loadStories]);

  // Collect all unique skills across all stories for the filter
  const allSkills = useMemo(() => {
    const set = new Set<string>();
    for (const story of stories) {
      for (const skill of story.skills_demonstrated) {
        set.add(skill);
      }
    }
    return Array.from(set).sort();
  }, [stories]);

  // Filter stories by skill if filter is set
  const filteredStories = useMemo(() => {
    if (!skillFilter) return stories;
    const lower = skillFilter.toLowerCase();
    return stories.filter((s) =>
      s.skills_demonstrated.some((sk) => sk.toLowerCase().includes(lower)),
    );
  }, [stories, skillFilter]);

  const handleEditStory = useCallback((story: StarStory) => {
    setEditingStory(story);
    setEditorExperienceIndex(story.experience_index);
    setEditorOpen(true);
  }, []);

  const handleAddStory = useCallback((experienceIndex: number) => {
    setEditingStory(undefined);
    setEditorExperienceIndex(experienceIndex);
    setEditorOpen(true);
  }, []);

  const handleSaveStory = useCallback(
    (story: StarStory) => {
      saveStory(story);
    },
    [saveStory],
  );

  const handleGenerateAll = useCallback(() => {
    if (!selectedCv?.parsed_data) return;
    generateAll(selectedCv.parsed_data, selectedCv.id);
  }, [selectedCv, generateAll]);

  const handleGenerateForExp = useCallback(
    (experienceIndex: number) => {
      if (!selectedCv?.parsed_data) return;
      generateForExperience(
        selectedCv.parsed_data,
        selectedCv.id,
        experienceIndex,
      );
    },
    [selectedCv, generateForExperience],
  );

  const isAnyGenerating = generatingForIndex.size > 0;

  // No CV state
  if (cvs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <FileUp className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground text-center">
            {t("star.no_cv")}
          </p>
          <Link to="/cv">
            <Button variant="outline">{t("star.upload_cv")}</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">{t("star.bank_title")}</h3>
        <div className="flex items-center gap-3">
          {/* CV selector */}
          {cvs.length > 1 && (
            <Select
              value={selectedCvId ?? ""}
              onValueChange={onCvChange}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("star.select_cv")} />
              </SelectTrigger>
              <SelectContent>
                {cvs.map((cv) => (
                  <SelectItem key={cv.id} value={cv.id}>
                    {cv.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            onClick={handleGenerateAll}
            disabled={!selectedCv || !hasLlm || isAnyGenerating}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {t("star.generate")}
          </Button>
        </div>
      </div>

      {/* No LLM Warning */}
      {!hasLlm && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("star.no_llm_title")}</AlertTitle>
          <AlertDescription>
            {t("star.no_llm_description")}{" "}
            <Link to="/settings" className="underline font-medium">
              {t("star.go_to_settings")}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Skill Filter */}
      {allSkills.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t("star.filter_by_skill")}
          </span>
          <Select
            value={skillFilter}
            onValueChange={setSkillFilter}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("star.all_skills")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("star.all_skills")}</SelectItem>
              {allSkills.map((skill) => (
                <SelectItem key={skill} value={skill}>
                  {skill}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {/* Experience Accordion */}
      {!isLoading && experiences.length > 0 && (
        <Accordion type="multiple" defaultValue={experiences.map((_, i) => `exp-${i}`)}>
          {experiences.map((exp, index) => {
            const expStories = skillFilter
              ? filteredStories.filter((s) => s.experience_index === index)
              : getStoriesByExperience(index);
            const isExpGenerating = generatingForIndex.has(index);

            return (
              <AccordionItem key={index} value={`exp-${index}`}>
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span>
                      {exp.company} &mdash; {exp.title}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {expStories.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    {isExpGenerating && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("star.generating")}
                      </div>
                    )}

                    {expStories.length === 0 && !isExpGenerating && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t("star.no_stories")}
                      </p>
                    )}

                    {expStories.map((story) => (
                      <StarStoryCard
                        key={story.id}
                        story={story}
                        onEdit={() => handleEditStory(story)}
                        onDelete={() => deleteStory(story.id)}
                      />
                    ))}

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateForExp(index)}
                        disabled={!hasLlm || isExpGenerating}
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                        {t("star.generate_more")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddStory(index)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        {t("star.add_custom")}
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* No experiences */}
      {!isLoading && experiences.length === 0 && selectedCv && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("star.no_experience")}
          </CardContent>
        </Card>
      )}

      {/* Story Editor Dialog */}
      {selectedCvId && (
        <StarStoryEditor
          story={editingStory}
          experienceIndex={editorExperienceIndex}
          cvId={selectedCvId}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          onSave={handleSaveStory}
        />
      )}
    </div>
  );
}
