import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { ulid } from "ulid";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { StarStory } from "@/types";

interface StarStoryEditorProps {
  story?: StarStory;
  experienceIndex: number;
  cvId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (story: StarStory) => void;
}

export function StarStoryEditor({
  story,
  experienceIndex,
  cvId,
  open,
  onOpenChange,
  onSave,
}: StarStoryEditorProps) {
  const { t } = useTranslation("interview-prep");
  const isEditing = Boolean(story);

  const [title, setTitle] = useState(story?.title ?? "");
  const [situation, setSituation] = useState(story?.situation ?? "");
  const [task, setTask] = useState(story?.task ?? "");
  const [action, setAction] = useState(story?.action ?? "");
  const [result, setResult] = useState(story?.result ?? "");
  const [skills, setSkills] = useState<string[]>(
    story?.skills_demonstrated ?? [],
  );
  const [skillInput, setSkillInput] = useState("");

  const handleAddSkill = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const trimmed = skillInput.trim();
        if (trimmed && !skills.includes(trimmed)) {
          setSkills((prev) => [...prev, trimmed]);
        }
        setSkillInput("");
      }
    },
    [skillInput, skills],
  );

  const handleRemoveSkill = useCallback((skill: string) => {
    setSkills((prev) => prev.filter((s) => s !== skill));
  }, []);

  const handleSave = () => {
    const now = Date.now();
    const saved: StarStory = {
      id: story?.id ?? ulid(),
      cv_id: cvId,
      experience_index: experienceIndex,
      title: title.trim(),
      situation: situation.trim(),
      task: task.trim(),
      action: action.trim(),
      result: result.trim(),
      skills_demonstrated: skills,
      is_user_edited: true,
      created_at: story?.created_at ?? now,
      updated_at: now,
    };
    onSave(saved);
    onOpenChange(false);
  };

  const canSave =
    situation.trim().length > 0 &&
    task.trim().length > 0 &&
    action.trim().length > 0 &&
    result.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("star.edit") : t("star.add")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="story-title">{t("star.story_title")}</Label>
            <Input
              id="story-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("star.title_placeholder")}
            />
          </div>

          {/* Situation */}
          <div className="space-y-1.5">
            <Label htmlFor="story-situation">
              <span className="font-bold text-blue-600 dark:text-blue-400 mr-1">
                S
              </span>
              {t("star.situation")}
            </Label>
            <Textarea
              id="story-situation"
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              placeholder={t("star.situation_placeholder")}
              rows={3}
            />
            <span className="text-xs text-muted-foreground">
              {situation.length} {t("star.characters")}
            </span>
          </div>

          {/* Task */}
          <div className="space-y-1.5">
            <Label htmlFor="story-task">
              <span className="font-bold text-green-600 dark:text-green-400 mr-1">
                T
              </span>
              {t("star.task")}
            </Label>
            <Textarea
              id="story-task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder={t("star.task_placeholder")}
              rows={3}
            />
            <span className="text-xs text-muted-foreground">
              {task.length} {t("star.characters")}
            </span>
          </div>

          {/* Action */}
          <div className="space-y-1.5">
            <Label htmlFor="story-action">
              <span className="font-bold text-amber-600 dark:text-amber-400 mr-1">
                A
              </span>
              {t("star.action")}
            </Label>
            <Textarea
              id="story-action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder={t("star.action_placeholder")}
              rows={3}
            />
            <span className="text-xs text-muted-foreground">
              {action.length} {t("star.characters")}
            </span>
          </div>

          {/* Result */}
          <div className="space-y-1.5">
            <Label htmlFor="story-result">
              <span className="font-bold text-purple-600 dark:text-purple-400 mr-1">
                R
              </span>
              {t("star.result")}
            </Label>
            <Textarea
              id="story-result"
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder={t("star.result_placeholder")}
              rows={3}
            />
            <span className="text-xs text-muted-foreground">
              {result.length} {t("star.characters")}
            </span>
          </div>

          {/* Skills */}
          <div className="space-y-1.5">
            <Label htmlFor="story-skills">{t("star.skills")}</Label>
            <Input
              id="story-skills"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={handleAddSkill}
              placeholder={t("star.skills_placeholder")}
            />
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {skills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="secondary"
                    className="text-xs gap-1 pr-1"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill)}
                      className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {t("common:actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
