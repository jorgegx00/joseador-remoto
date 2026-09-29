import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FilterX, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useJobFilters } from "@/features/jobs/hooks/useJobFilters";
import { CountryFlag } from "@/components/common/CountryFlag";
import { useMarketLabel } from "@/features/markets/useMarketLabel";
import { useSettingsStore } from "@/stores/settingsStore";
import type { JobSource, SeniorityLevel, EmploymentType, JobFilters as JobFiltersType } from "@/types";

const SOURCES: JobSource[] = ["aggregator", "career_page", "manual"];
const SENIORITY_LEVELS: SeniorityLevel[] = [
  "junior",
  "mid",
  "senior",
  "lead",
  "principal",
];
const EMPLOYMENT_TYPES: EmploymentType[] = [
  "full_time",
  "contract",
  "part_time",
];
const DATE_OPTIONS: JobFiltersType["datePosted"][] = [
  "today",
  "this_week",
  "this_month",
  "all_time",
];

const SALARY_MIN = 0;
const SALARY_MAX = 300000;
const SALARY_STEP = 5000;

/** Searchable multi-select for a derived tech dimension (languages / frameworks). */
function TagCommand({
  label,
  facets,
  selected,
  onToggle,
  searchPlaceholder,
  emptyText,
}: {
  label: string;
  facets: Array<{ tag: string; count: number }>;
  selected: string[];
  onToggle: (tag: string) => void;
  searchPlaceholder: string;
  emptyText: string;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </h4>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 pb-1">
          {selected.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-[10px] gap-1 cursor-pointer"
              onClick={() => onToggle(tag)}
            >
              {tag}
              <X className="h-2.5 w-2.5" />
            </Badge>
          ))}
        </div>
      )}
      <Command className="rounded-md border">
        <CommandInput placeholder={searchPlaceholder} />
        <CommandList>
          <CommandEmpty className="py-2 text-xs">{emptyText}</CommandEmpty>
          <CommandGroup>
            {facets.map(({ tag, count }) => (
              <CommandItem
                key={tag}
                value={tag}
                onSelect={() => onToggle(tag)}
                className="gap-2"
              >
                <Checkbox
                  checked={selected.includes(tag)}
                  className="pointer-events-none"
                />
                <span className="text-sm flex-1">{tag}</span>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {count}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

export function JobFilters() {
  const { t } = useTranslation("jobs");
  const targetMarkets = useSettingsStore((s) => s.market.targetMarkets);
  const marketLabel = useMarketLabel();
  const {
    filters,
    activeFilterCount,
    hasActiveFilters,
    toggleSource,
    setEligibilityFilter,
    toggleMarket,
    toggleSeniority,
    toggleEmploymentType,
    toggleRole,
    toggleLanguage,
    toggleFramework,
    roleFacets,
    languageFacets,
    frameworkFacets,
    setSalaryRange,
    toggleCompany,
    addSkill,
    removeSkill,
    setDatePosted,
    resetFilters,
    sourceCountMap,
    companies,
  } = useJobFilters();

  const [skillInput, setSkillInput] = useState("");

  const handleSkillKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (skillInput.trim()) {
          addSkill(skillInput.trim());
          setSkillInput("");
        }
      }
    },
    [skillInput, addSkill]
  );

  const handleAddSkill = useCallback(() => {
    if (skillInput.trim()) {
      addSkill(skillInput.trim());
      setSkillInput("");
    }
  }, [skillInput, addSkill]);

  const salaryValues: [number, number] = [
    filters.salaryMin ?? SALARY_MIN,
    filters.salaryMax ?? SALARY_MAX,
  ];

  const isSalaryDefault =
    filters.salaryMin === null && filters.salaryMax === null;

  const handleSalaryChange = useCallback(
    (values: number[]) => {
      const [min, max] = values;
      const isDefault = min === SALARY_MIN && max === SALARY_MAX;
      setSalaryRange(
        isDefault ? null : min,
        isDefault ? null : max
      );
    },
    [setSalaryRange]
  );

  const uniqueCompanyList = companies.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 pb-4 pr-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{t("filters.section_title")}</h3>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {activeFilterCount}
              </Badge>
            )}
          </div>
        </div>

        {/* Source Filter */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("filters.source")}
          </h4>
          <div className="space-y-2">
            {SOURCES.map((source) => (
              <div key={source} className="flex items-center gap-2">
                <Checkbox
                  id={`source-${source}`}
                  checked={filters.sources.includes(source)}
                  onCheckedChange={() => toggleSource(source)}
                />
                <Label
                  htmlFor={`source-${source}`}
                  className="text-sm font-normal cursor-pointer flex-1"
                >
                  {t(`sources.${source}`)}
                </Label>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {sourceCountMap[source] ?? 0}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Location fit for the user's target markets */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("filters.location_fit")}
          </h4>
          <RadioGroup
            value={filters.eligibilityFilter}
            onValueChange={(val) =>
              setEligibilityFilter(val as JobFiltersType["eligibilityFilter"])
            }
            className="gap-2"
          >
            {(["explicit", "eligible", "all"] as const).map((mode) => (
              <div key={mode} className="flex items-center gap-2">
                <RadioGroupItem value={mode} id={`fit-${mode}`} />
                <Label htmlFor={`fit-${mode}`} className="text-sm font-normal cursor-pointer">
                  {t(`eligibility_options.${mode}`)}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {targetMarkets.length > 1 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs text-muted-foreground">{t("filters.markets")}</p>
              {targetMarkets.map((market) => (
                <div key={market} className="flex items-center gap-2">
                  <Checkbox
                    id={`market-${market}`}
                    checked={filters.markets.includes(market)}
                    onCheckedChange={() => toggleMarket(market)}
                  />
                  <Label
                    htmlFor={`market-${market}`}
                    className="flex items-center gap-1.5 text-sm font-normal cursor-pointer"
                  >
                    <CountryFlag code={market} />
                    {marketLabel(market)}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Role Filter */}
        {roleFacets.length > 0 && (
          <>
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("filters.role")}
              </h4>
              <div className="space-y-2">
                {roleFacets.map(({ tag, count }) => (
                  <div key={tag} className="flex items-center gap-2">
                    <Checkbox
                      id={`role-${tag}`}
                      checked={filters.roles.includes(tag)}
                      onCheckedChange={() => toggleRole(tag)}
                    />
                    <Label
                      htmlFor={`role-${tag}`}
                      className="text-sm font-normal cursor-pointer flex-1"
                    >
                      {t(`roles.${tag}`)}
                    </Label>
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {count}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Language Filter */}
        {languageFacets.length > 0 && (
          <>
            <TagCommand
              label={t("filters.language")}
              facets={languageFacets}
              selected={filters.languages}
              onToggle={toggleLanguage}
              searchPlaceholder={t("tech_search_placeholder")}
              emptyText={t("no_tech_found")}
            />
            <Separator />
          </>
        )}

        {/* Framework Filter */}
        {frameworkFacets.length > 0 && (
          <>
            <TagCommand
              label={t("filters.framework")}
              facets={frameworkFacets}
              selected={filters.frameworks}
              onToggle={toggleFramework}
              searchPlaceholder={t("tech_search_placeholder")}
              emptyText={t("no_tech_found")}
            />
            <Separator />
          </>
        )}

        {/* Seniority Filter */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("filters.seniority")}
          </h4>
          <div className="space-y-2">
            {SENIORITY_LEVELS.map((level) => (
              <div key={level} className="flex items-center gap-2">
                <Checkbox
                  id={`seniority-${level}`}
                  checked={filters.seniorityLevels.includes(level)}
                  onCheckedChange={() => toggleSeniority(level)}
                />
                <Label
                  htmlFor={`seniority-${level}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {t(`seniority.${level}`)}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Employment Type Filter */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("filters.employment_type")}
          </h4>
          <div className="space-y-2">
            {EMPLOYMENT_TYPES.map((type) => (
              <div key={type} className="flex items-center gap-2">
                <Checkbox
                  id={`employment-${type}`}
                  checked={filters.employmentTypes.includes(type)}
                  onCheckedChange={() => toggleEmploymentType(type)}
                />
                <Label
                  htmlFor={`employment-${type}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {t(`employment.${type}`)}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Salary Range Filter */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("filters.salary_range")}
          </h4>
          {isSalaryDefault ? (
            <p className="text-xs text-muted-foreground">
              {t("salary_any")}
            </p>
          ) : (
            <p className="text-xs text-foreground">
              US${salaryValues[0].toLocaleString()} – US$
              {salaryValues[1].toLocaleString()}
            </p>
          )}
          <Slider
            min={SALARY_MIN}
            max={SALARY_MAX}
            step={SALARY_STEP}
            value={salaryValues}
            onValueChange={handleSalaryChange}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>US$0</span>
            <span>US$300K</span>
          </div>
        </div>

        <Separator />

        {/* Company Filter */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("filters.company")}
          </h4>
          {/* Selected companies as badges */}
          {filters.companies.length > 0 && (
            <div className="flex flex-wrap gap-1 pb-1">
              {filters.companies.map((companyId) => {
                const company = uniqueCompanyList.find(
                  (c) => c.id === companyId
                );
                return (
                  <Badge
                    key={companyId}
                    variant="secondary"
                    className="text-[10px] gap-1 cursor-pointer"
                    onClick={() => toggleCompany(companyId)}
                  >
                    {company?.name ?? companyId}
                    <X className="h-2.5 w-2.5" />
                  </Badge>
                );
              })}
            </div>
          )}
          <Command className="rounded-md border">
            <CommandInput placeholder={t("company_search_placeholder")} />
            <CommandList>
              <CommandEmpty className="py-2 text-xs">
                {t("no_companies_found")}
              </CommandEmpty>
              <CommandGroup>
                {uniqueCompanyList.map((company) => (
                  <CommandItem
                    key={company.id}
                    onSelect={() => toggleCompany(company.id)}
                    className="gap-2"
                  >
                    <Checkbox
                      checked={filters.companies.includes(company.id)}
                      className="pointer-events-none"
                    />
                    <span className="text-sm">{company.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>

        <Separator />

        {/* Skills Filter */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("filters.skills")}
          </h4>
          {filters.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 pb-1">
              {filters.skills.map((skill) => (
                <Badge
                  key={skill}
                  variant="secondary"
                  className="text-[10px] gap-1 cursor-pointer"
                  onClick={() => removeSkill(skill)}
                >
                  {skill}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <Input
              placeholder={t("skills_placeholder")}
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={handleSkillKeyDown}
              className="h-8 text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleAddSkill}
              disabled={!skillInput.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Date Posted Filter */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("filters.date_posted")}
          </h4>
          <Select
            value={filters.datePosted}
            onValueChange={(val) =>
              setDatePosted(val as JobFiltersType["datePosted"])
            }
          >
            <SelectTrigger className="h-8 text-xs w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`date_posted_options.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Clear All */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
            onClick={resetFilters}
          >
            <FilterX className="h-4 w-4 mr-2" />
            {t("clear_all_filters")}
          </Button>
        )}
      </div>
    </ScrollArea>
  );
}
