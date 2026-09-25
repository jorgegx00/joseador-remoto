import type { ParsedCv } from "@/types/cv";
import type { CheckerResult } from "./types";
import type { AtsIssue } from "@/types/ats";

// ---------------------------------------------------------------------------
// Section detection helpers (bilingual: English + Spanish)
// ---------------------------------------------------------------------------

interface SectionDef {
  id: string;
  required: boolean;
  /** Patterns that identify this section header (case-insensitive) */
  patterns: RegExp[];
}

const SECTIONS: SectionDef[] = [
  {
    id: "summary",
    required: true,
    patterns: [
      /\b(summary|profile|objective|about\s*me|professional\s*summary|career\s*summary|executive\s*summary)\b/i,
      /\b(resumen|perfil|objetivo|sobre\s*m[ií]|resumen\s*profesional|perfil\s*profesional)\b/i,
    ],
  },
  {
    id: "experience",
    required: true,
    patterns: [
      /\b(experience|work\s*experience|professional\s*experience|employment|work\s*history|career\s*history)\b/i,
      /\b(experiencia|experiencia\s*laboral|experiencia\s*profesional|historial\s*laboral|empleo)\b/i,
    ],
  },
  {
    id: "education",
    required: true,
    patterns: [
      /\b(education|academic|qualifications|academic\s*background|degrees)\b/i,
      /\b(educaci[oó]n|formaci[oó]n|estudios|formaci[oó]n\s*acad[eé]mica|t[ií]tulos)\b/i,
    ],
  },
  {
    id: "skills",
    required: true,
    patterns: [
      /\b(skills|technical\s*skills|core\s*competencies|competencies|technologies|tech\s*stack|tools)\b/i,
      /\b(habilidades|competencias|tecnolog[ií]as|herramientas|aptitudes|conocimientos)\b/i,
    ],
  },
  {
    id: "certifications",
    required: false,
    patterns: [
      /\b(certifications?|licenses?|accreditations?|professional\s*development)\b/i,
      /\b(certificaciones?|licencias?|acreditaciones?|desarrollo\s*profesional)\b/i,
    ],
  },
  {
    id: "projects",
    required: false,
    patterns: [
      /\b(projects?|portfolio|personal\s*projects?|side\s*projects?|open\s*source)\b/i,
      /\b(proyectos?|portafolio|proyectos?\s*personales?)\b/i,
    ],
  },
  {
    id: "languages",
    required: false,
    patterns: [
      /\b(languages?|language\s*skills?|linguistic)\b/i,
      /\b(idiomas?|lenguas?|competencia\s*ling[uü][ií]stica)\b/i,
    ],
  },
];

// Preferred section order (by id)
const PREFERRED_ORDER = ["summary", "experience", "education", "skills"];

// ---------------------------------------------------------------------------
// validateStructure
// ---------------------------------------------------------------------------

export function validateStructure(
  rawText: string,
  parsedCv: ParsedCv,
): CheckerResult {
  const issues: AtsIssue[] = [];
  let score = 100;
  const lines = rawText.split("\n");
  const details: Record<string, unknown> = {};

  // ---- 1. Detect which sections are present in the raw text ----
  const foundSections: Array<{ id: string; lineIndex: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip very long lines — headers tend to be short
    if (line.length > 80) continue;
    // Skip empty lines
    if (line.length === 0) continue;

    for (const sec of SECTIONS) {
      const alreadyFound = foundSections.some((fs) => fs.id === sec.id);
      if (alreadyFound) continue;

      const isHeader =
        // ALL-CAPS line
        (line.length >= 3 && line.length <= 60 && line === line.toUpperCase() && /[A-Z]/.test(line)) ||
        // Markdown-style header
        line.startsWith("#") ||
        // Line that matches section patterns and is reasonably short
        line.length <= 60;

      if (!isHeader) continue;

      for (const pat of sec.patterns) {
        if (pat.test(line)) {
          foundSections.push({ id: sec.id, lineIndex: i });
          break;
        }
      }
    }
  }

  // Also check parsedCv for implicit sections
  if (!foundSections.some((s) => s.id === "summary") && parsedCv.summary && parsedCv.summary.length > 20) {
    foundSections.push({ id: "summary", lineIndex: -1 });
  }
  if (!foundSections.some((s) => s.id === "experience") && parsedCv.experience.length > 0) {
    foundSections.push({ id: "experience", lineIndex: -1 });
  }
  if (!foundSections.some((s) => s.id === "education") && parsedCv.education.length > 0) {
    foundSections.push({ id: "education", lineIndex: -1 });
  }
  if (!foundSections.some((s) => s.id === "skills") && (parsedCv.skills.technical.length > 0 || parsedCv.skills.soft.length > 0)) {
    foundSections.push({ id: "skills", lineIndex: -1 });
  }
  if (!foundSections.some((s) => s.id === "certifications") && parsedCv.certifications.length > 0) {
    foundSections.push({ id: "certifications", lineIndex: -1 });
  }
  if (!foundSections.some((s) => s.id === "projects") && parsedCv.projects.length > 0) {
    foundSections.push({ id: "projects", lineIndex: -1 });
  }
  if (!foundSections.some((s) => s.id === "languages") && parsedCv.languages.length > 0) {
    foundSections.push({ id: "languages", lineIndex: -1 });
  }

  const foundIds = new Set(foundSections.map((s) => s.id));
  details.sectionsFound = [...foundIds];

  // ---- 2. Check required sections ----
  for (const sec of SECTIONS) {
    if (sec.required && !foundIds.has(sec.id)) {
      issues.push({
        check: "section_structure",
        severity: "critical",
        message: `Missing required section: ${sec.id.charAt(0).toUpperCase() + sec.id.slice(1)}.`,
        fix: `Add a clearly labeled "${sec.id.charAt(0).toUpperCase() + sec.id.slice(1)}" section to your CV.`,
      });
      score -= 15;
    }
  }

  // ---- 3. Check recommended sections ----
  for (const sec of SECTIONS) {
    if (!sec.required && !foundIds.has(sec.id)) {
      issues.push({
        check: "section_structure",
        severity: "info",
        message: `Recommended section missing: ${sec.id.charAt(0).toUpperCase() + sec.id.slice(1)}.`,
        fix: `Consider adding a "${sec.id.charAt(0).toUpperCase() + sec.id.slice(1)}" section to strengthen your CV.`,
      });
      score -= 3;
    }
  }

  // ---- 4. Check section order ----
  const orderedFound = foundSections
    .filter((s) => PREFERRED_ORDER.includes(s.id) && s.lineIndex >= 0)
    .sort((a, b) => a.lineIndex - b.lineIndex);

  if (orderedFound.length >= 2) {
    const actualOrder = orderedFound.map((s) => s.id);
    const preferredFiltered = PREFERRED_ORDER.filter((id) =>
      actualOrder.includes(id),
    );

    let orderCorrect = true;
    for (let i = 0; i < preferredFiltered.length; i++) {
      if (actualOrder[i] !== preferredFiltered[i]) {
        orderCorrect = false;
        break;
      }
    }

    if (!orderCorrect) {
      issues.push({
        check: "section_structure",
        severity: "info",
        message: `Section order (${actualOrder.join(" → ")}) differs from the recommended order (${preferredFiltered.join(" → ")}).`,
        fix: "Consider reordering: Summary → Experience → Education → Skills. Most recruiters expect this flow.",
      });
      score -= 5;
      details.sectionOrder = actualOrder;
    }
  }

  // ---- 5. Validate experience entries ----
  if (parsedCv.experience.length > 0) {
    let incompleteEntries = 0;

    for (const exp of parsedCv.experience) {
      const missingFields: string[] = [];
      if (!exp.company || exp.company.trim().length === 0) missingFields.push("company");
      if (!exp.title || exp.title.trim().length === 0) missingFields.push("title");
      if (!exp.start_date || exp.start_date.trim().length === 0) missingFields.push("start date");
      if (!exp.description || exp.description.trim().length < 10) {
        if (!exp.achievements || exp.achievements.length === 0) {
          missingFields.push("description/achievements");
        }
      }

      if (missingFields.length > 0) {
        incompleteEntries++;
        if (incompleteEntries <= 3) {
          const label = exp.company || exp.title || "Unknown";
          issues.push({
            check: "section_structure",
            severity: "warning",
            message: `Experience entry "${label}" is missing: ${missingFields.join(", ")}.`,
            fix: `Complete the entry with ${missingFields.join(", ")} for better ATS parsing.`,
          });
        }
      }
    }

    if (incompleteEntries > 0) {
      score -= Math.min(15, incompleteEntries * 5);
      details.incompleteExperienceEntries = incompleteEntries;
    }
  }

  // ---- 6. Validate education entries ----
  if (parsedCv.education.length > 0) {
    let incompleteEdu = 0;

    for (const edu of parsedCv.education) {
      const missingFields: string[] = [];
      if (!edu.institution || edu.institution.trim().length === 0) missingFields.push("institution");
      if (!edu.degree || edu.degree.trim().length === 0) missingFields.push("degree");

      if (missingFields.length > 0) {
        incompleteEdu++;
        if (incompleteEdu <= 2) {
          const label = edu.institution || edu.degree || "Unknown";
          issues.push({
            check: "section_structure",
            severity: "warning",
            message: `Education entry "${label}" is missing: ${missingFields.join(", ")}.`,
            fix: `Add the missing ${missingFields.join(", ")} to this education entry.`,
          });
        }
      }
    }

    if (incompleteEdu > 0) {
      score -= Math.min(10, incompleteEdu * 5);
      details.incompleteEducationEntries = incompleteEdu;
    }
  }

  // ---- 7. Summary quality ----
  if (parsedCv.summary) {
    const wordCount = parsedCv.summary.split(/\s+/).filter(Boolean).length;
    if (wordCount < 15) {
      issues.push({
        check: "section_structure",
        severity: "warning",
        message: `Professional summary is very short (${wordCount} words). A good summary is 30-60 words.`,
        fix: "Expand your summary to 2-3 sentences highlighting your key qualifications and career goals.",
      });
      score -= 5;
    } else if (wordCount > 100) {
      issues.push({
        check: "section_structure",
        severity: "info",
        message: `Professional summary is long (${wordCount} words). Keep it concise for quick scanning.`,
        fix: "Trim your summary to 30-60 words focusing on your strongest qualifications.",
      });
      score -= 3;
    }
    details.summaryWordCount = wordCount;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    details,
  };
}
