import type { ParsedCv } from "@/types/cv";
import type { CheckerResult } from "./types";
import type { AtsIssue } from "@/types/ats";

// ---------------------------------------------------------------------------
// Length & density analyzer
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function analyzeLength(
  rawText: string,
  parsedCv: ParsedCv,
  jobDescription?: string,
): CheckerResult {
  const issues: AtsIssue[] = [];
  let score = 100;
  const details: Record<string, unknown> = {};

  const totalWords = countWords(rawText);
  details.totalWords = totalWords;

  // ---- 1. Total word count scoring ----
  const estimatedPages = Math.round((totalWords / 400) * 10) / 10;
  details.estimatedPages = estimatedPages;

  if (totalWords < 200) {
    score = 30;
    issues.push({
      check: "length_density",
      severity: "critical",
      message: `CV is extremely short (${totalWords} words, ~${estimatedPages} pages). Most content may be missing.`,
      fix: "Expand your CV significantly. Add detailed descriptions of your experience, skills, and achievements.",
    });
  } else if (totalWords < 300) {
    score = Math.round(40 + ((totalWords - 200) / 100) * 20); // 40-60
    issues.push({
      check: "length_density",
      severity: "warning",
      message: `CV is too short (${totalWords} words, ~${estimatedPages} pages). ATS systems may rank it lower.`,
      fix: "Add more detail to your experience descriptions, include achievements with metrics, and expand your skills section.",
    });
  } else if (totalWords < 400) {
    score = Math.round(60 + ((totalWords - 300) / 100) * 20); // 60-80
    issues.push({
      check: "length_density",
      severity: "info",
      message: `CV is slightly short (${totalWords} words, ~${estimatedPages} pages). Consider adding more detail.`,
      fix: "Add 1-2 more bullet points per experience entry with quantified achievements.",
    });
  } else if (totalWords <= 800) {
    // Ideal range
    score = Math.round(90 + ((Math.min(totalWords, 600) - 400) / 200) * 10); // 90-100
    score = Math.min(100, score);
    details.lengthRating = "ideal";
  } else if (totalWords <= 1200) {
    score = Math.round(85 - ((totalWords - 800) / 400) * 15); // 85-70
    issues.push({
      check: "length_density",
      severity: "info",
      message: `CV is slightly long (${totalWords} words, ~${estimatedPages} pages). Consider trimming.`,
      fix: "Remove older or less relevant experience. Keep your CV to 1-2 pages for most roles.",
    });
  } else {
    score = Math.round(60 - Math.min(20, ((totalWords - 1200) / 800) * 20)); // 60-40
    issues.push({
      check: "length_density",
      severity: "warning",
      message: `CV is too long (${totalWords} words, ~${estimatedPages} pages). Recruiters spend ~7 seconds on initial scan.`,
      fix: "Drastically trim your CV. Remove positions older than 10-15 years, reduce descriptions, and focus on the most relevant experience.",
    });
  }

  // ---- 2. Keyword density (stuffing detection) ----
  if (jobDescription) {
    const cvLower = rawText.toLowerCase();
    const cvWords = cvLower.split(/\s+/).filter(Boolean);
    const wordFreq = new Map<string, number>();

    for (const w of cvWords) {
      if (w.length < 3) continue;
      wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
    }

    // Extract keywords from job description for comparison
    const jobLower = jobDescription.toLowerCase();
    const jobTokens = jobLower.split(/\s+/).filter((w) => w.length >= 3);
    const jobKeywords = new Set(jobTokens);

    const stuffedKeywords: Array<{ keyword: string; density: number }> = [];
    const totalCvWords = cvWords.length || 1;

    for (const [word, count] of wordFreq) {
      if (!jobKeywords.has(word)) continue;
      const density = (count / totalCvWords) * 100;
      if (density > 3 && count > 5) {
        stuffedKeywords.push({ keyword: word, density: Math.round(density * 10) / 10 });
      }
    }

    if (stuffedKeywords.length > 0) {
      stuffedKeywords.sort((a, b) => b.density - a.density);
      const top = stuffedKeywords.slice(0, 3);
      issues.push({
        check: "length_density",
        severity: "warning",
        message: `Potential keyword stuffing detected: ${top.map((k) => `"${k.keyword}" (${k.density}%)`).join(", ")}.`,
        fix: "Reduce repetition of these keywords. ATS systems can detect and penalize keyword stuffing.",
      });
      score -= Math.min(15, stuffedKeywords.length * 5);
      details.stuffedKeywords = stuffedKeywords;
    }
  }

  // ---- 3. Section balance ----
  const sectionWordCounts: Record<string, number> = {};

  // Estimate word counts from parsedCv
  if (parsedCv.summary) {
    sectionWordCounts.summary = countWords(parsedCv.summary);
  }

  if (parsedCv.experience.length > 0) {
    let expWords = 0;
    for (const exp of parsedCv.experience) {
      expWords += countWords(exp.description);
      expWords += countWords(exp.title + " " + exp.company);
      for (const ach of exp.achievements) {
        expWords += countWords(ach);
      }
    }
    sectionWordCounts.experience = expWords;
  }

  if (parsedCv.education.length > 0) {
    let eduWords = 0;
    for (const edu of parsedCv.education) {
      eduWords += countWords(edu.institution + " " + edu.degree + " " + edu.field);
      for (const h of edu.honors) {
        eduWords += countWords(h);
      }
    }
    sectionWordCounts.education = eduWords;
  }

  if (parsedCv.skills.technical.length > 0 || parsedCv.skills.soft.length > 0) {
    sectionWordCounts.skills = parsedCv.skills.technical.length + parsedCv.skills.soft.length;
  }

  if (parsedCv.projects.length > 0) {
    let projWords = 0;
    for (const p of parsedCv.projects) {
      projWords += countWords(p.description + " " + p.name);
      for (const a of p.achievements) projWords += countWords(a);
    }
    sectionWordCounts.projects = projWords;
  }

  details.sectionWordCounts = sectionWordCounts;

  const totalSectionWords = Object.values(sectionWordCounts).reduce((a, b) => a + b, 0);
  if (totalSectionWords > 0) {
    // Check if any single section dominates
    for (const [section, count] of Object.entries(sectionWordCounts)) {
      const ratio = count / totalSectionWords;
      if (ratio > 0.7 && section !== "experience") {
        issues.push({
          check: "length_density",
          severity: "warning",
          message: `The "${section}" section contains ${Math.round(ratio * 100)}% of your CV content. The CV is unbalanced.`,
          fix: `Reduce the "${section}" section and distribute content more evenly, especially into Experience.`,
        });
        score -= 8;
        break;
      }
    }

    // Check if experience section is present and appropriately sized
    const expRatio = (sectionWordCounts.experience ?? 0) / totalSectionWords;
    if (sectionWordCounts.experience !== undefined && expRatio < 0.25 && totalSectionWords > 100) {
      issues.push({
        check: "length_density",
        severity: "info",
        message: `Experience section is only ${Math.round(expRatio * 100)}% of your CV. It should be the largest section (40-60%).`,
        fix: "Add more detail to your experience entries — include specific achievements, metrics, and technologies used.",
      });
      score -= 5;
    }
  }

  // ---- 4. Blank line ratio ----
  const lines = rawText.split("\n");
  const blankLines = lines.filter((l) => l.trim().length === 0).length;
  const blankRatio = blankLines / (lines.length || 1);

  if (blankRatio > 0.4) {
    issues.push({
      check: "length_density",
      severity: "info",
      message: `${Math.round(blankRatio * 100)}% of lines are blank. Excessive whitespace wastes space.`,
      fix: "Reduce unnecessary blank lines to fit more content on each page.",
    });
    score -= 3;
  }

  details.blankLineRatio = Math.round(blankRatio * 100);

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    details,
  };
}
