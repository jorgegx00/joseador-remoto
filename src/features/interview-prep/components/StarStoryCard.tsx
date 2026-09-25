import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { StarStory } from "@/types";

interface StarStoryCardProps {
  story: StarStory;
  onEdit: () => void;
  onDelete: () => void;
}

const SECTION_COLORS = {
  situation: "border-blue-500",
  task: "border-green-500",
  action: "border-amber-500",
  result: "border-purple-500",
} as const;

export function StarStoryCard({ story, onEdit, onDelete }: StarStoryCardProps) {
  const { t } = useTranslation("interview-prep");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirmDelete = () => {
    setConfirmOpen(false);
    onDelete();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">
              {story.title || t("star.untitled")}
            </span>
            {story.is_user_edited && (
              <Badge variant="outline" className="text-xs">
                {t("star.edited")}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("star.delete_title")}</DialogTitle>
                  <DialogDescription>
                    {t("star.delete_description")}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmOpen(false)}
                  >
                    {t("common:actions.cancel")}
                  </Button>
                  <Button variant="destructive" onClick={handleConfirmDelete}>
                    {t("common:actions.delete")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* S - Situation */}
        <div className={`border-l-4 ${SECTION_COLORS.situation} pl-3`}>
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
            S
          </span>
          <span className="text-xs font-medium text-muted-foreground ml-1">
            {t("star.situation")}
          </span>
          <p className="text-sm mt-0.5">{story.situation}</p>
        </div>

        {/* T - Task */}
        <div className={`border-l-4 ${SECTION_COLORS.task} pl-3`}>
          <span className="text-xs font-bold text-green-600 dark:text-green-400">
            T
          </span>
          <span className="text-xs font-medium text-muted-foreground ml-1">
            {t("star.task")}
          </span>
          <p className="text-sm mt-0.5">{story.task}</p>
        </div>

        {/* A - Action */}
        <div className={`border-l-4 ${SECTION_COLORS.action} pl-3`}>
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
            A
          </span>
          <span className="text-xs font-medium text-muted-foreground ml-1">
            {t("star.action")}
          </span>
          <p className="text-sm mt-0.5">{story.action}</p>
        </div>

        {/* R - Result */}
        <div className={`border-l-4 ${SECTION_COLORS.result} pl-3`}>
          <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
            R
          </span>
          <span className="text-xs font-medium text-muted-foreground ml-1">
            {t("star.result")}
          </span>
          <p className="text-sm mt-0.5">{story.result}</p>
        </div>

        {/* Skills */}
        {story.skills_demonstrated.length > 0 && (
          <div className="pt-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("star.skills")}
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {story.skills_demonstrated.map((skill) => (
                <Badge key={skill} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
