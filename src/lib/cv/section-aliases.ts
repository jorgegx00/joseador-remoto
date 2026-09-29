/**
 * Canonical CV section types and the English/Spanish/Portuguese/German heading aliases that map to them.
 * Shared by the markdown → ParsedCv parser and the original ↔ optimized section aligner,
 * so both agree on what "Experiencia" or "Work History" means.
 */

export type CvSectionType =
  | "summary"
  | "skills"
  | "experience"
  | "education"
  | "certifications"
  | "projects"
  | "languages"
  | "contact";

const ALIASES: Record<CvSectionType, string[]> = {
  summary: [
    "professional summary",
    "summary",
    "profile",
    "professional profile",
    "about",
    "about me",
    "objective",
    "career objective",
    "career summary",
    "resumen",
    "resumen profesional",
    "perfil",
    "perfil profesional",
    "sobre mi",
    "acerca de mi",
    "objetivo",
    "objetivo profesional",
    "resumo",
    "resumo profissional",
    "perfil profissional",
    "sobre mim",
    "profil",
    "kurzprofil",
    "zusammenfassung",
    "uber mich",
  ],
  skills: [
    "skills",
    "technical skills",
    "soft skills",
    "core competencies",
    "competencies",
    "key skills",
    "skills and tools",
    "skills & tools",
    "tech stack",
    "habilidades",
    "habilidades tecnicas",
    "habilidades blandas",
    "competencias",
    "aptitudes",
    "conocimientos",
    "competencias tecnicas",
    "competencias comportamentais",
    "habilidades tecnicas e comportamentais",
    "kenntnisse",
    "fachkenntnisse",
    "fahigkeiten",
    "kompetenzen",
  ],
  experience: [
    "experience",
    "work experience",
    "professional experience",
    "employment history",
    "employment",
    "work history",
    "career history",
    "experiencia",
    "experiencia laboral",
    "experiencia profesional",
    "historial laboral",
    "experiencia profissional",
    "historico profissional",
    "berufserfahrung",
    "berufliche erfahrung",
    "werdegang",
    "beruflicher werdegang",
  ],
  education: [
    "education",
    "academic background",
    "education and training",
    "educacion",
    "formacion",
    "formacion academica",
    "estudios",
    "formacao",
    "formacao academica",
    "ausbildung",
    "bildung",
    "studium",
  ],
  certifications: [
    "certifications",
    "certificates",
    "certification",
    "licenses and certifications",
    "licenses & certifications",
    "certificaciones",
    "certificados",
    "licencias y certificaciones",
    "certificacoes",
    "zertifikate",
    "zertifizierungen",
  ],
  projects: [
    "projects",
    "personal projects",
    "side projects",
    "selected projects",
    "key projects",
    "proyectos",
    "proyectos personales",
    "proyectos destacados",
    "projetos",
    "projekte",
  ],
  languages: ["languages", "language skills", "idiomas", "lenguajes", "sprachen", "sprachkenntnisse"],
  contact: ["contact", "contact information", "contacto", "informacion de contacto", "contato", "kontakt"],
};

const LOOKUP: Map<string, CvSectionType> = (() => {
  const map = new Map<string, CvSectionType>();
  for (const [type, names] of Object.entries(ALIASES) as Array<[CvSectionType, string[]]>) {
    for (const name of names) map.set(name, type);
  }
  return map;
})();

/**
 * Lowercases, strips accents, markdown emphasis, trailing colons, emoji and extra spaces.
 * "## **Experiencia Laboral:**" → "experiencia laboral"
 */
export function normalizeHeadingText(heading: string): string {
  return heading
    .replace(/^#+\s*/, "")
    .replace(/[*_`]/g, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}&/+#. -]/gu, " ")
    .replace(/[:.]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Returns the canonical section type for a heading, or null for unknown sections. */
export function canonicalSectionType(heading: string): CvSectionType | null {
  const norm = normalizeHeadingText(heading);
  if (!norm) return null;
  return LOOKUP.get(norm) ?? null;
}

/** Hint for skills sub-headings: "Soft Skills" / "Habilidades blandas" → soft. */
export function isSoftSkillsLabel(label: string): boolean {
  const norm = normalizeHeadingText(label);
  return /\b(soft|blandas?|interpersonal|interpersonales|personales|comportamentais|sozial\w*)\b/.test(norm);
}
