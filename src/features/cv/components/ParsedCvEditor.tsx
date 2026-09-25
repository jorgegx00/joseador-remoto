import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type {
  ParsedCv,
  CvExperience,
  CvEducation,
  CvProject,
  CvLanguage,
} from "@/types";

interface ParsedCvEditorProps {
  value: ParsedCv;
  onChange: (next: ParsedCv) => void;
}

function update<T extends object, K extends keyof T>(obj: T, key: K, value: T[K]): T {
  return { ...obj, [key]: value };
}

function StringListEditor({
  values,
  onChange,
  placeholder,
  emptyHint,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  emptyHint: string;
}) {
  const handleAdd = () => onChange([...values, ""]);
  const handleRemove = (i: number) => onChange(values.filter((_, idx) => idx !== i));
  const handleEdit = (i: number, v: string) =>
    onChange(values.map((x, idx) => (idx === i ? v : x)));

  return (
    <div className="space-y-1.5">
      {values.length === 0 && (
        <p className="text-xs text-muted-foreground italic">{emptyHint}</p>
      )}
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={v}
            onChange={(e) => handleEdit(i, e.target.value)}
            placeholder={placeholder}
            className="text-xs h-8"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => handleRemove(i)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={handleAdd} className="text-xs">
        <Plus className="h-3 w-3 mr-1" />
        {placeholder}
      </Button>
    </div>
  );
}

function ScalarField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-xs h-8"
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="text-xs"
      />
    </div>
  );
}

interface ItemEditorProps<T> {
  item: T;
  onChange: (next: T) => void;
  onRemove: () => void;
  index: number;
}

function ExperienceItemEditor({ item, onChange, onRemove, index }: ItemEditorProps<CvExperience>) {
  const { t } = useTranslation("cv");
  return (
    <Card className="bg-muted/20">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">
            {t("editor.experience_entry", { n: index + 1, defaultValue: "Role #{{n}}" })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-auto text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ScalarField
            label={t("editor.title", { defaultValue: "Title" })}
            value={item.title}
            onChange={(v) => onChange(update(item, "title", v))}
          />
          <ScalarField
            label={t("editor.company", { defaultValue: "Company" })}
            value={item.company}
            onChange={(v) => onChange(update(item, "company", v))}
          />
          <ScalarField
            label={t("editor.location", { defaultValue: "Location" })}
            value={item.location}
            onChange={(v) => onChange(update(item, "location", v))}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <ScalarField
              label={t("editor.start_date", { defaultValue: "Start" })}
              value={item.start_date}
              onChange={(v) => onChange(update(item, "start_date", v))}
              placeholder="YYYY-MM"
            />
            <ScalarField
              label={t("editor.end_date", { defaultValue: "End" })}
              value={item.end_date ?? ""}
              onChange={(v) => onChange(update(item, "end_date", v || null))}
              placeholder="YYYY-MM / Present"
            />
          </div>
        </div>
        <TextField
          label={t("editor.description", { defaultValue: "Description" })}
          value={item.description}
          onChange={(v) => onChange(update(item, "description", v))}
          rows={2}
        />
        <div>
          <Label className="text-xs font-medium mb-1 block">
            {t("editor.achievements", { defaultValue: "Achievements" })}
          </Label>
          <StringListEditor
            values={item.achievements}
            onChange={(next) => onChange(update(item, "achievements", next))}
            placeholder={t("editor.add_achievement", { defaultValue: "Add achievement" })}
            emptyHint={t("editor.no_achievements", { defaultValue: "No achievements yet" })}
          />
        </div>
        <div>
          <Label className="text-xs font-medium mb-1 block">
            {t("editor.technologies", { defaultValue: "Technologies" })}
          </Label>
          <StringListEditor
            values={item.technologies}
            onChange={(next) => onChange(update(item, "technologies", next))}
            placeholder={t("editor.add_technology", { defaultValue: "Add technology" })}
            emptyHint={t("editor.no_technologies", { defaultValue: "No technologies listed" })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function EducationItemEditor({ item, onChange, onRemove, index }: ItemEditorProps<CvEducation>) {
  const { t } = useTranslation("cv");
  return (
    <Card className="bg-muted/20">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">
            {t("editor.education_entry", { n: index + 1, defaultValue: "Education #{{n}}" })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-auto text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ScalarField
            label={t("editor.degree", { defaultValue: "Degree" })}
            value={item.degree}
            onChange={(v) => onChange(update(item, "degree", v))}
          />
          <ScalarField
            label={t("editor.field", { defaultValue: "Field" })}
            value={item.field}
            onChange={(v) => onChange(update(item, "field", v))}
          />
          <ScalarField
            label={t("editor.institution", { defaultValue: "Institution" })}
            value={item.institution}
            onChange={(v) => onChange(update(item, "institution", v))}
          />
          <ScalarField
            label={t("editor.location", { defaultValue: "Location" })}
            value={item.location}
            onChange={(v) => onChange(update(item, "location", v))}
          />
          <ScalarField
            label={t("editor.start_date", { defaultValue: "Start" })}
            value={item.start_date}
            onChange={(v) => onChange(update(item, "start_date", v))}
            placeholder="YYYY-MM"
          />
          <ScalarField
            label={t("editor.end_date", { defaultValue: "End" })}
            value={item.end_date}
            onChange={(v) => onChange(update(item, "end_date", v))}
            placeholder="YYYY-MM"
          />
        </div>
        <div>
          <Label className="text-xs font-medium mb-1 block">
            {t("editor.honors", { defaultValue: "Honors" })}
          </Label>
          <StringListEditor
            values={item.honors}
            onChange={(next) => onChange(update(item, "honors", next))}
            placeholder={t("editor.add_honor", { defaultValue: "Add honor" })}
            emptyHint={t("editor.no_honors", { defaultValue: "No honors" })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectItemEditor({ item, onChange, onRemove, index }: ItemEditorProps<CvProject>) {
  const { t } = useTranslation("cv");
  return (
    <Card className="bg-muted/20">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">
            {t("editor.project_entry", { n: index + 1, defaultValue: "Project #{{n}}" })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-auto text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ScalarField
            label={t("editor.name", { defaultValue: "Name" })}
            value={item.name}
            onChange={(v) => onChange(update(item, "name", v))}
          />
          <ScalarField
            label={t("editor.url", { defaultValue: "URL" })}
            value={item.url}
            onChange={(v) => onChange(update(item, "url", v))}
          />
        </div>
        <TextField
          label={t("editor.description", { defaultValue: "Description" })}
          value={item.description}
          onChange={(v) => onChange(update(item, "description", v))}
          rows={2}
        />
        <div>
          <Label className="text-xs font-medium mb-1 block">
            {t("editor.achievements", { defaultValue: "Achievements" })}
          </Label>
          <StringListEditor
            values={item.achievements}
            onChange={(next) => onChange(update(item, "achievements", next))}
            placeholder={t("editor.add_achievement", { defaultValue: "Add achievement" })}
            emptyHint={t("editor.no_achievements", { defaultValue: "No achievements" })}
          />
        </div>
        <div>
          <Label className="text-xs font-medium mb-1 block">
            {t("editor.technologies", { defaultValue: "Technologies" })}
          </Label>
          <StringListEditor
            values={item.technologies}
            onChange={(next) => onChange(update(item, "technologies", next))}
            placeholder={t("editor.add_technology", { defaultValue: "Add technology" })}
            emptyHint={t("editor.no_technologies", { defaultValue: "No technologies" })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function LanguageItemEditor({ item, onChange, onRemove, index }: ItemEditorProps<CvLanguage>) {
  const { t } = useTranslation("cv");
  return (
    <Card className="bg-muted/20">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">
            {t("editor.language_entry", { n: index + 1, defaultValue: "Language #{{n}}" })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-auto text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ScalarField
            label={t("editor.name", { defaultValue: "Name" })}
            value={item.name}
            onChange={(v) => onChange(update(item, "name", v))}
          />
          <div className="space-y-1">
            <Label className="text-xs font-medium">
              {t("editor.level", { defaultValue: "Level" })}
            </Label>
            <Select
              value={item.level}
              onValueChange={(v) =>
                onChange(update(item, "level", v as CvLanguage["level"]))
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="native">Native</SelectItem>
                <SelectItem value="fluent">Fluent</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ScalarField
            label={t("editor.certification", { defaultValue: "Certification" })}
            value={item.certification}
            onChange={(v) => onChange(update(item, "certification", v))}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function ParsedCvEditor({ value, onChange }: ParsedCvEditorProps) {
  const { t } = useTranslation("cv");

  const setField = useCallback(
    <K extends keyof ParsedCv>(key: K, v: ParsedCv[K]) => {
      onChange({ ...value, [key]: v });
    },
    [value, onChange],
  );

  const setSkills = useCallback(
    (kind: "technical" | "soft", list: string[]) => {
      onChange({
        ...value,
        skills: { ...value.skills, [kind]: list },
      });
    },
    [value, onChange],
  );

  const setListItem = useCallback(
    <K extends "experience" | "education" | "projects" | "languages">(
      key: K,
      idx: number,
      next: ParsedCv[K][number],
    ) => {
      onChange({
        ...value,
        [key]: value[key].map((it, i) => (i === idx ? next : it)),
      } as ParsedCv);
    },
    [value, onChange],
  );

  const removeListItem = useCallback(
    <K extends "experience" | "education" | "projects" | "languages">(key: K, idx: number) => {
      onChange({
        ...value,
        [key]: value[key].filter((_, i) => i !== idx),
      } as ParsedCv);
    },
    [value, onChange],
  );

  const addExperience = () =>
    onChange({
      ...value,
      experience: [
        ...value.experience,
        {
          title: "",
          company: "",
          location: "",
          start_date: "",
          end_date: null,
          description: "",
          achievements: [],
          technologies: [],
        },
      ],
    });

  const addEducation = () =>
    onChange({
      ...value,
      education: [
        ...value.education,
        {
          degree: "",
          field: "",
          institution: "",
          location: "",
          start_date: "",
          end_date: "",
          honors: [],
        },
      ],
    });

  const addProject = () =>
    onChange({
      ...value,
      projects: [
        ...value.projects,
        { name: "", description: "", url: "", achievements: [], technologies: [] },
      ],
    });

  const addLanguage = () =>
    onChange({
      ...value,
      languages: [
        ...value.languages,
        { name: "", level: "intermediate", certification: "" },
      ],
    });

  return (
    <div className="space-y-5">
      {/* Header / contact */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          {t("editor.section_header", { defaultValue: "Header" })}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <ScalarField
            label={t("editor.full_name", { defaultValue: "Full name" })}
            value={value.full_name}
            onChange={(v) => setField("full_name", v)}
          />
          <ScalarField
            label={t("editor.email", { defaultValue: "Email" })}
            value={value.email}
            onChange={(v) => setField("email", v)}
            type="email"
          />
          <ScalarField
            label={t("editor.phone", { defaultValue: "Phone" })}
            value={value.phone}
            onChange={(v) => setField("phone", v)}
          />
          <ScalarField
            label={t("editor.location", { defaultValue: "Location" })}
            value={value.location}
            onChange={(v) => setField("location", v)}
          />
          <ScalarField
            label="LinkedIn"
            value={value.linkedin_url}
            onChange={(v) => setField("linkedin_url", v)}
          />
          <ScalarField
            label="GitHub"
            value={value.github_url}
            onChange={(v) => setField("github_url", v)}
          />
          <ScalarField
            label="Portfolio"
            value={value.portfolio_url}
            onChange={(v) => setField("portfolio_url", v)}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          {t("editor.section_summary", { defaultValue: "Professional Summary" })}
        </h3>
        <Textarea
          value={value.summary}
          onChange={(e) => setField("summary", e.target.value)}
          rows={4}
          className="text-xs"
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          {t("editor.section_skills", { defaultValue: "Skills" })}
        </h3>
        <div>
          <Label className="text-xs font-medium mb-1 block">
            {t("editor.technical_skills", { defaultValue: "Technical" })}
          </Label>
          <StringListEditor
            values={value.skills.technical}
            onChange={(next) => setSkills("technical", next)}
            placeholder={t("editor.add_skill", { defaultValue: "Add skill" })}
            emptyHint={t("editor.no_skills", { defaultValue: "No skills" })}
          />
        </div>
        <div>
          <Label className="text-xs font-medium mb-1 block">
            {t("editor.soft_skills", { defaultValue: "Soft" })}
          </Label>
          <StringListEditor
            values={value.skills.soft}
            onChange={(next) => setSkills("soft", next)}
            placeholder={t("editor.add_skill", { defaultValue: "Add skill" })}
            emptyHint={t("editor.no_skills", { defaultValue: "No skills" })}
          />
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {t("editor.section_experience", { defaultValue: "Experience" })}
          </h3>
          <Button variant="outline" size="sm" onClick={addExperience}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t("editor.add_experience", { defaultValue: "Add role" })}
          </Button>
        </div>
        <div className="space-y-2">
          {value.experience.map((it, i) => (
            <ExperienceItemEditor
              key={i}
              item={it}
              index={i}
              onChange={(next) => setListItem("experience", i, next)}
              onRemove={() => removeListItem("experience", i)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {t("editor.section_education", { defaultValue: "Education" })}
          </h3>
          <Button variant="outline" size="sm" onClick={addEducation}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t("editor.add_education", { defaultValue: "Add education" })}
          </Button>
        </div>
        <div className="space-y-2">
          {value.education.map((it, i) => (
            <EducationItemEditor
              key={i}
              item={it}
              index={i}
              onChange={(next) => setListItem("education", i, next)}
              onRemove={() => removeListItem("education", i)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          {t("editor.section_certifications", { defaultValue: "Certifications" })}
        </h3>
        <StringListEditor
          values={value.certifications}
          onChange={(next) => setField("certifications", next)}
          placeholder={t("editor.add_certification", { defaultValue: "Add certification" })}
          emptyHint={t("editor.no_certifications", { defaultValue: "No certifications" })}
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {t("editor.section_projects", { defaultValue: "Projects" })}
          </h3>
          <Button variant="outline" size="sm" onClick={addProject}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t("editor.add_project", { defaultValue: "Add project" })}
          </Button>
        </div>
        <div className="space-y-2">
          {value.projects.map((it, i) => (
            <ProjectItemEditor
              key={i}
              item={it}
              index={i}
              onChange={(next) => setListItem("projects", i, next)}
              onRemove={() => removeListItem("projects", i)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {t("editor.section_languages", { defaultValue: "Languages" })}
          </h3>
          <Button variant="outline" size="sm" onClick={addLanguage}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t("editor.add_language", { defaultValue: "Add language" })}
          </Button>
        </div>
        <div className="space-y-2">
          {value.languages.map((it, i) => (
            <LanguageItemEditor
              key={i}
              item={it}
              index={i}
              onChange={(next) => setListItem("languages", i, next)}
              onRemove={() => removeListItem("languages", i)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
