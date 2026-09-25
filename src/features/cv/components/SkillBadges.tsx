import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { CvSkills } from "@/types";

interface SkillBadgesProps {
  skills: CvSkills;
}

const TECH_CATEGORIES: Record<string, string[]> = {
  languages: [
    "javascript", "typescript", "python", "java", "c#", "c++", "go", "rust",
    "ruby", "php", "swift", "kotlin", "scala", "r", "matlab", "perl",
    "haskell", "elixir", "dart", "lua", "sql", "html", "css", "sass",
    "less", "bash", "shell", "powershell", "objective-c", "assembly",
  ],
  frameworks: [
    "react", "angular", "vue", "svelte", "next.js", "nuxt", "gatsby",
    "express", "nestjs", "fastapi", "django", "flask", "spring", "rails",
    "laravel", "asp.net", ".net", "flutter", "react native", "electron",
    "tauri", "remix", "astro", "solidjs", "qwik", "htmx",
  ],
  tools: [
    "git", "docker", "kubernetes", "jenkins", "gitlab", "github",
    "jira", "confluence", "figma", "sketch", "postman", "webpack",
    "vite", "babel", "eslint", "prettier", "npm", "yarn", "pnpm",
    "terraform", "ansible", "puppet", "chef", "vagrant",
  ],
  cloud: [
    "aws", "azure", "gcp", "google cloud", "heroku", "vercel", "netlify",
    "cloudflare", "digitalocean", "linode", "firebase", "supabase",
    "lambda", "s3", "ec2", "ecs", "eks", "fargate", "cloudfront",
  ],
  databases: [
    "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch",
    "sqlite", "oracle", "sql server", "dynamodb", "cassandra", "neo4j",
    "couchdb", "mariadb", "cockroachdb", "supabase", "prisma",
    "drizzle", "typeorm", "sequelize", "mongoose",
  ],
};

function getSkillCategory(skill: string): string {
  const lower = skill.toLowerCase();
  for (const [category, keywords] of Object.entries(TECH_CATEGORIES)) {
    if (keywords.some((kw) => lower.includes(kw) || kw.includes(lower))) {
      return category;
    }
  }
  return "other";
}

const CATEGORY_COLORS: Record<string, string> = {
  languages: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  frameworks: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  tools: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  cloud: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  databases: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  other: "bg-secondary text-secondary-foreground",
  soft: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300",
};

export function SkillBadges({ skills }: SkillBadgesProps) {
  const { t } = useTranslation("cv");

  return (
    <div className="space-y-4">
      {skills.technical.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            {t("viewer.technical_skills")}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {skills.technical.map((skill) => {
              const category = getSkillCategory(skill);
              return (
                <Badge
                  key={skill}
                  variant="outline"
                  className={CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other}
                >
                  {skill}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {skills.soft.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            {t("viewer.soft_skills")}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {skills.soft.map((skill) => (
              <Badge
                key={skill}
                variant="outline"
                className={CATEGORY_COLORS.soft}
              >
                {skill}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {skills.technical.length === 0 && skills.soft.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          {t("viewer.no_skills")}
        </p>
      )}
    </div>
  );
}
