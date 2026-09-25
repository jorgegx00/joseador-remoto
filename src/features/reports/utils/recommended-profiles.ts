/**
 * "Perfiles recomendados" line — a template over the heuristics: role noun
 * (from category) + level + top technologies, with an English-requirement
 * flag when the description demands it.
 */

import type { RoleCategory } from "./role-category";

const ROLE_NOUN: Record<RoleCategory, string> = {
  Backend: "Desarrollador/a Backend",
  Frontend: "Desarrollador/a Frontend",
  "Full Stack": "Desarrollador/a Full Stack",
  Mobile: "Desarrollador/a Mobile",
  QA: "Ingeniero/a QA",
  PM: "Gerente de Proyecto / Product Manager",
  DevOps: "Ingeniero/a DevOps",
  Data: "Profesional de Datos",
  "Otros (tech)": "Profesional de tecnología",
};

const ENGLISH_RE = /\benglish\b|\bingl[eé]s\b/i;

function joinEs(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

export function recommendedProfiles(
  category: RoleCategory,
  levelLabel: string | null,
  techs: string[],
  description: string
): string {
  let line = ROLE_NOUN[category];
  if (levelLabel) line += ` nivel ${levelLabel}`;
  const top = techs.slice(0, 3);
  if (top.length > 0) line += ` con experiencia en ${joinEs(top)}`;
  if (ENGLISH_RE.test(description)) line += " · requiere inglés";
  return line;
}
