import type { MatchAnalysis, ParsedCv } from "@/types";
import { containsSkill } from "@/lib/cv/cv-claims";
import { appearsIn } from "@/lib/cv/llm-parse/lines";
import { formatCvForPrompt } from "./prompts";

/**
 * Checks each skill verdict against the CV text, so the skills offered for tailoring
 * don't depend on a model's recall:
 *  - a skill the CV names literally is found, whatever the model said;
 *  - a "found" verdict must quote the CV; a quote that isn't there is dropped and the
 *    skill counts as missing.
 */
export function groundSkillMatches(analysis: MatchAnalysis, cv: ParsedCv): MatchAnalysis {
  const cvText = formatCvForPrompt(cv);
  return {
    ...analysis,
    skills_match: analysis.skills_match.map((item) => {
      const literal = containsSkill(cvText, item.skill);
      const quoted = Boolean(item.evidence?.trim()) && appearsIn(item.evidence ?? "", cvText);
      const found = literal || (item.found && quoted);
      return { ...item, found, evidence: quoted ? item.evidence : literal ? item.skill : "" };
    }),
  };
}
