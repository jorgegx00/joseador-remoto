import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Trash2,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagInput } from "./TagInput";
import { useCvStore } from "@/stores/cvStore";
import { toast } from "sonner";
import type {
  ParsedCv,
  CvExperience,
  CvEducation,
  CvProject,
  CvLanguage,
} from "@/types";

interface CvEditorProps {
  cvId: string;
  data: ParsedCv;
  onCancel: () => void;
  onSaved: () => void;
}

const TECH_SUGGESTIONS = [
  "JavaScript", "TypeScript", "Python", "Java", "C#", "Go", "Rust", "Ruby",
  "React", "Angular", "Vue.js", "Next.js", "Node.js", "Express", "FastAPI",
  "Django", "Spring Boot", "Docker", "Kubernetes", "AWS", "Azure", "GCP",
  "PostgreSQL", "MongoDB", "Redis", "GraphQL", "REST", "Git", "CI/CD",
  "Terraform", "Linux", "Agile", "Scrum", "TDD",
];

function createEmptyExperience(): CvExperience {
  return {
    company: "",
    location: "",
    title: "",
    start_date: "",
    end_date: null,
    description: "",
    achievements: [],
    technologies: [],
  };
}

function createEmptyEducation(): CvEducation {
  return {
    institution: "",
    location: "",
    degree: "",
    field: "",
    start_date: "",
    end_date: "",
    honors: [],
  };
}

function createEmptyProject(): CvProject {
  return {
    name: "",
    description: "",
    achievements: [],
    technologies: [],
    url: "",
  };
}

function createEmptyLanguage(): CvLanguage {
  return {
    name: "",
    level: "intermediate",
    certification: "",
  };
}

export function CvEditor({ cvId, data, onCancel, onSaved }: CvEditorProps) {
  const { t } = useTranslation("cv");
  const { updateCvData } = useCvStore();
  const [isSaving, setIsSaving] = useState(false);

  // Deep clone initial data so we can mutate freely
  const [formData, setFormData] = useState<ParsedCv>(() =>
    JSON.parse(JSON.stringify(data)) as ParsedCv,
  );

  const updateField = useCallback(
    <K extends keyof ParsedCv>(field: K, value: ParsedCv[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  // Experience helpers
  const updateExperience = useCallback(
    (index: number, field: keyof CvExperience, value: CvExperience[keyof CvExperience]) => {
      setFormData((prev) => {
        const updated = [...prev.experience];
        updated[index] = { ...updated[index], [field]: value };
        return { ...prev, experience: updated };
      });
    },
    [],
  );

  const addExperience = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      experience: [createEmptyExperience(), ...prev.experience],
    }));
  }, []);

  const removeExperience = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      experience: prev.experience.filter((_, i) => i !== index),
    }));
  }, []);

  // Education helpers
  const updateEducation = useCallback(
    (index: number, field: keyof CvEducation, value: CvEducation[keyof CvEducation]) => {
      setFormData((prev) => {
        const updated = [...prev.education];
        updated[index] = { ...updated[index], [field]: value };
        return { ...prev, education: updated };
      });
    },
    [],
  );

  const addEducation = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      education: [...prev.education, createEmptyEducation()],
    }));
  }, []);

  const removeEducation = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index),
    }));
  }, []);

  // Project helpers
  const updateProject = useCallback(
    (index: number, field: keyof CvProject, value: CvProject[keyof CvProject]) => {
      setFormData((prev) => {
        const updated = [...prev.projects];
        updated[index] = { ...updated[index], [field]: value };
        return { ...prev, projects: updated };
      });
    },
    [],
  );

  const addProject = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      projects: [...prev.projects, createEmptyProject()],
    }));
  }, []);

  const removeProject = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== index),
    }));
  }, []);

  // Language helpers
  const updateLanguage = useCallback(
    (index: number, field: keyof CvLanguage, value: CvLanguage[keyof CvLanguage]) => {
      setFormData((prev) => {
        const updated = [...prev.languages];
        updated[index] = { ...updated[index], [field]: value };
        return { ...prev, languages: updated };
      });
    },
    [],
  );

  const addLanguage = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      languages: [...prev.languages, createEmptyLanguage()],
    }));
  }, []);

  const removeLanguage = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      languages: prev.languages.filter((_, i) => i !== index),
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateCvData(cvId, formData);
      toast.success(t("save_success"));
      onSaved();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setIsSaving(false);
    }
  }, [cvId, formData, updateCvData, t, onSaved]);

  return (
    <div className="space-y-6 pb-20">
      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("sections.contact")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("editor.full_name")}</Label>
              <Input
                value={formData.full_name}
                onChange={(e) => updateField("full_name", e.target.value)}
                placeholder={t("editor.full_name_placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("editor.email")}</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("editor.phone")}</Label>
              <Input
                value={formData.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("editor.location")}</Label>
              <Input
                value={formData.location}
                onChange={(e) => updateField("location", e.target.value)}
                placeholder={t("editor.location_placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>LinkedIn</Label>
              <Input
                value={formData.linkedin_url}
                onChange={(e) => updateField("linkedin_url", e.target.value)}
                placeholder="https://linkedin.com/in/..."
              />
            </div>
            <div className="space-y-2">
              <Label>GitHub</Label>
              <Input
                value={formData.github_url}
                onChange={(e) => updateField("github_url", e.target.value)}
                placeholder="https://github.com/..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("sections.summary")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Textarea
              value={formData.summary}
              onChange={(e) => updateField("summary", e.target.value)}
              placeholder={t("editor.summary_placeholder")}
              className="min-h-24"
            />
            <p className="text-xs text-muted-foreground text-right">
              {formData.summary.length} {t("editor.characters")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Experience */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("sections.experience")}</CardTitle>
          <Button variant="outline" size="sm" onClick={addExperience}>
            <Plus className="h-4 w-4 mr-1" />
            {t("editor.add")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.experience.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-4">
              {t("editor.no_entries")}
            </p>
          )}
          {formData.experience.map((exp, index) => (
            <div
              key={index}
              className="relative rounded-lg border p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {exp.title || exp.company || `${t("sections.experience")} #${index + 1}`}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeExperience(index)}
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("fields.company")}</Label>
                  <Input
                    value={exp.company}
                    onChange={(e) => updateExperience(index, "company", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("fields.title")}</Label>
                  <Input
                    value={exp.title}
                    onChange={(e) => updateExperience(index, "title", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("editor.start_date")}</Label>
                  <Input
                    value={exp.start_date}
                    onChange={(e) => updateExperience(index, "start_date", e.target.value)}
                    placeholder="YYYY-MM"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">{t("editor.end_date")}</Label>
                    <div className="flex items-center gap-1.5">
                      <Checkbox
                        id={`present-${index}`}
                        checked={exp.end_date === null}
                        onCheckedChange={(checked) =>
                          updateExperience(index, "end_date", checked ? null : "")
                        }
                      />
                      <label htmlFor={`present-${index}`} className="text-xs text-muted-foreground cursor-pointer">
                        {t("viewer.present")}
                      </label>
                    </div>
                  </div>
                  <Input
                    value={exp.end_date ?? ""}
                    onChange={(e) => updateExperience(index, "end_date", e.target.value || null)}
                    placeholder="YYYY-MM"
                    disabled={exp.end_date === null}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("fields.description")}</Label>
                <Textarea
                  value={exp.description}
                  onChange={(e) => updateExperience(index, "description", e.target.value)}
                  className="min-h-16"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("fields.technologies")}</Label>
                <TagInput
                  value={exp.technologies}
                  onChange={(techs) => updateExperience(index, "technologies", techs)}
                  suggestions={TECH_SUGGESTIONS}
                  placeholder={t("editor.type_to_add")}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Education */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("sections.education")}</CardTitle>
          <Button variant="outline" size="sm" onClick={addEducation}>
            <Plus className="h-4 w-4 mr-1" />
            {t("editor.add")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.education.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-4">
              {t("editor.no_entries")}
            </p>
          )}
          {formData.education.map((edu, index) => (
            <div
              key={index}
              className="relative rounded-lg border p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {edu.institution || `${t("sections.education")} #${index + 1}`}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeEducation(index)}
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("fields.institution")}</Label>
                  <Input
                    value={edu.institution}
                    onChange={(e) => updateEducation(index, "institution", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("fields.degree")}</Label>
                  <Input
                    value={edu.degree}
                    onChange={(e) => updateEducation(index, "degree", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("fields.field")}</Label>
                  <Input
                    value={edu.field}
                    onChange={(e) => updateEducation(index, "field", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("editor.location")}</Label>
                  <Input
                    value={edu.location}
                    onChange={(e) => updateEducation(index, "location", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("editor.start_date")}</Label>
                  <Input
                    value={edu.start_date}
                    onChange={(e) => updateEducation(index, "start_date", e.target.value)}
                    placeholder="YYYY"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("editor.end_date")}</Label>
                  <Input
                    value={edu.end_date}
                    onChange={(e) => updateEducation(index, "end_date", e.target.value)}
                    placeholder="YYYY"
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Skills */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("sections.skills")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("viewer.technical_skills")}</Label>
            <TagInput
              value={formData.skills.technical}
              onChange={(techs) =>
                updateField("skills", { ...formData.skills, technical: techs })
              }
              suggestions={TECH_SUGGESTIONS}
              placeholder={t("editor.type_to_add")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("viewer.soft_skills")}</Label>
            <TagInput
              value={formData.skills.soft}
              onChange={(softs) =>
                updateField("skills", { ...formData.skills, soft: softs })
              }
              placeholder={t("editor.type_to_add")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Certifications */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("sections.certifications")}</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              updateField("certifications", [...formData.certifications, ""])
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("editor.add")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {formData.certifications.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-4">
              {t("editor.no_entries")}
            </p>
          )}
          {formData.certifications.map((cert, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={cert}
                onChange={(e) => {
                  const updated = [...formData.certifications];
                  updated[index] = e.target.value;
                  updateField("certifications", updated);
                }}
                placeholder={t("editor.cert_placeholder")}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  updateField(
                    "certifications",
                    formData.certifications.filter((_, i) => i !== index),
                  )
                }
                className="h-9 w-9 p-0 shrink-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Projects */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("sections.projects")}</CardTitle>
          <Button variant="outline" size="sm" onClick={addProject}>
            <Plus className="h-4 w-4 mr-1" />
            {t("editor.add")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.projects.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-4">
              {t("editor.no_entries")}
            </p>
          )}
          {formData.projects.map((project, index) => (
            <div
              key={index}
              className="relative rounded-lg border p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {project.name || `${t("sections.projects")} #${index + 1}`}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeProject(index)}
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("editor.project_name")}</Label>
                  <Input
                    value={project.name}
                    onChange={(e) => updateProject(index, "name", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">URL</Label>
                  <Input
                    value={project.url}
                    onChange={(e) => updateProject(index, "url", e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("fields.description")}</Label>
                <Textarea
                  value={project.description}
                  onChange={(e) =>
                    updateProject(index, "description", e.target.value)
                  }
                  className="min-h-16"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("fields.technologies")}</Label>
                <TagInput
                  value={project.technologies}
                  onChange={(techs) =>
                    updateProject(index, "technologies", techs)
                  }
                  suggestions={TECH_SUGGESTIONS}
                  placeholder={t("editor.type_to_add")}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Languages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("sections.languages")}</CardTitle>
          <Button variant="outline" size="sm" onClick={addLanguage}>
            <Plus className="h-4 w-4 mr-1" />
            {t("editor.add")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {formData.languages.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-4">
              {t("editor.no_entries")}
            </p>
          )}
          {formData.languages.map((lang, index) => (
            <div key={index} className="flex items-center gap-3">
              <Input
                value={lang.name}
                onChange={(e) => updateLanguage(index, "name", e.target.value)}
                placeholder={t("editor.language_name")}
                className="flex-1"
              />
              <Select
                value={lang.level}
                onValueChange={(value) =>
                  updateLanguage(index, "level", value as CvLanguage["level"])
                }
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="native">
                    {t("viewer.lang_level.native")}
                  </SelectItem>
                  <SelectItem value="fluent">
                    {t("viewer.lang_level.fluent")}
                  </SelectItem>
                  <SelectItem value="advanced">
                    {t("viewer.lang_level.advanced")}
                  </SelectItem>
                  <SelectItem value="intermediate">
                    {t("viewer.lang_level.intermediate")}
                  </SelectItem>
                  <SelectItem value="basic">
                    {t("viewer.lang_level.basic")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeLanguage(index)}
                className="h-9 w-9 p-0 shrink-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Separator />

      {/* Fixed bottom save/cancel bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-sm px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? t("common:status.saving") : t("common:actions.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
