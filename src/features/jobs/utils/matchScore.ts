import type { Job, CvRecord, SeniorityLevel } from "@/types";

const SENIORITY_ORDER: SeniorityLevel[] = ["junior", "mid", "senior", "lead", "principal"];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}+#.]+/gu, " ").trim();
}

function tokens(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

function skillTokens(skills: string[]): Set<string> {
  const set = new Set<string>();
  for (const skill of skills) {
    set.add(normalize(skill));
  }
  return set;
}

function infersSeniority(cv: CvRecord): SeniorityLevel | null {
  const titles = cv.parsed_data.experience
    .map((e) => e.title?.toLowerCase() ?? "")
    .join(" ");
  if (!titles) return null;
  if (/principal|staff/.test(titles)) return "principal";
  if (/\blead\b|tech lead|team lead/.test(titles)) return "lead";
  if (/\bsenior\b|\bsr\.?\b/.test(titles)) return "senior";
  if (/\bjunior\b|\bjr\.?\b|\bintern\b/.test(titles)) return "junior";
  return "mid";
}

/**
 * Heuristic 0–100 match score between a job and a CV.
 * Breakdown: 60 skills / 25 title / 10 seniority / 5 DR-friendly.
 *
 * Skills match uses case-insensitive exact token match (after normalization).
 * Title match is token-set overlap between job.title and the CV's current-role title.
 */
export function computeMatchScore(job: Job, cv: CvRecord): number {
  const jobSkills = skillTokens(job.skills_required ?? []);
  const cvSkills = skillTokens(cv.parsed_data.skills.technical ?? []);

  let skillPoints = 0;
  if (jobSkills.size > 0) {
    let overlap = 0;
    for (const s of jobSkills) {
      if (s && cvSkills.has(s)) overlap++;
    }
    skillPoints = (overlap / jobSkills.size) * 60;
  } else if (cvSkills.size > 0) {
    // No declared skills on job — fall back to scanning description tokens.
    const descToks = tokens(job.description ?? "");
    let overlap = 0;
    for (const s of cvSkills) {
      if (s && descToks.has(s)) overlap++;
    }
    // Cap at 30/60 when we have no hard skills list to match against.
    skillPoints = Math.min(30, (overlap / Math.max(1, cvSkills.size)) * 30);
  }

  const jobTitleToks = tokens(job.title);
  const cvLatestTitle =
    cv.parsed_data.experience.find((e) => !e.end_date)?.title ??
    cv.parsed_data.experience[0]?.title ??
    "";
  const cvTitleToks = tokens(cvLatestTitle);
  let titlePoints = 0;
  if (jobTitleToks.size > 0 && cvTitleToks.size > 0) {
    let overlap = 0;
    for (const t of jobTitleToks) {
      if (cvTitleToks.has(t)) overlap++;
    }
    titlePoints = (overlap / jobTitleToks.size) * 25;
  }

  let seniorityPoints = 0;
  const cvSeniority = infersSeniority(cv);
  if (cvSeniority && job.seniority_level) {
    const cvIdx = SENIORITY_ORDER.indexOf(cvSeniority);
    const jobIdx = SENIORITY_ORDER.indexOf(job.seniority_level);
    if (cvIdx >= 0 && jobIdx >= 0) {
      const delta = Math.abs(cvIdx - jobIdx);
      if (delta === 0) seniorityPoints = 10;
      else if (delta === 1) seniorityPoints = 6;
      else if (delta === 2) seniorityPoints = 2;
    }
  }

  const drPoints = job.is_dr_friendly ? 5 : 0;

  const total = skillPoints + titlePoints + seniorityPoints + drPoints;
  return Math.round(Math.max(0, Math.min(100, total)));
}
