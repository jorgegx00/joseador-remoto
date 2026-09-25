/**
 * Tiny English/Spanish detector for CV text (decides whether an optimized CV was
 * translated). Counts language-exclusive stop words and CV vocabulary, plus Spanish
 * diacritics and ¿¡. Returns null when the signal is too weak or too mixed.
 */

import { ENGLISH_STOP_WORDS, SPANISH_STOP_WORDS } from "@/lib/ats/types";

const EN_CV_WORDS = [
  "experience", "skills", "education", "summary", "present", "projects", "languages",
  "certifications", "developed", "built", "led", "managed", "improved", "designed",
  "implemented", "responsible", "team", "years", "engineer", "software", "developer",
];

const ES_CV_WORDS = [
  "experiencia", "habilidades", "educacion", "resumen", "actualidad", "proyectos", "idiomas",
  "certificaciones", "desarrolle", "lidere", "implemente", "disene", "mejore", "logros",
  "equipo", "anos", "actualmente", "responsable", "ingeniero", "desarrollador", "empresa",
];

function strip(word: string): string {
  return word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const { EN, ES } = (() => {
  const en = new Set([...ENGLISH_STOP_WORDS, ...EN_CV_WORDS].map(strip));
  const es = new Set([...SPANISH_STOP_WORDS, ...ES_CV_WORDS].map(strip));
  // Words valid in both languages ("a", "no", "me", "has") carry no signal.
  for (const w of [...en]) {
    if (es.has(w)) {
      en.delete(w);
      es.delete(w);
    }
  }
  return { EN: en, ES: es };
})();

const MIN_SIGNAL = 3;
const DOMINANCE = 1.5;

export function detectLanguage(text: string): "en" | "es" | null {
  if (!text) return null;
  const words = text.match(/[\p{L}']+/gu) ?? [];
  let en = 0;
  let es = 0;
  for (const raw of words) {
    const w = strip(raw);
    if (EN.has(w)) en++;
    else if (ES.has(w)) es++;
  }
  // Diacritics (á, é, ñ...) show up as combining marks after NFD.
  const marks = (text.normalize("NFD").match(/\p{M}/gu) ?? []).length;
  const inverted = (text.match(/[¿¡]/g) ?? []).length;
  es += Math.min(marks, words.length) * 0.5 + inverted;

  if (en + es < MIN_SIGNAL) return null;
  if (es >= 2 && es > en * DOMINANCE) return "es";
  if (en >= 2 && en > es * DOMINANCE) return "en";
  return null;
}
