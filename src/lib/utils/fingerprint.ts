/**
 * Content fingerprints for cache invalidation ("was this optimization produced for the
 * current CV / job text?"). FNV-1a 32-bit over UTF-8 — fast and stable, not cryptographic.
 */

import type { ParsedCv } from "@/types/cv";
import type { Job } from "@/types/job";

const encoder = new TextEncoder();

/** FNV-1a (32-bit) of the UTF-8 bytes of `input`, as 8 lowercase hex chars. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (const byte of encoder.encode(input ?? "")) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** JSON with object keys sorted recursively; undefined properties omitted. */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Fingerprint of the CV's content fields (key order and missing extra_sections don't matter). */
export function fingerprintCv(parsed: ParsedCv): string {
  const content = {
    full_name: parsed.full_name,
    email: parsed.email,
    phone: parsed.phone,
    location: parsed.location,
    linkedin_url: parsed.linkedin_url,
    github_url: parsed.github_url,
    portfolio_url: parsed.portfolio_url,
    summary: parsed.summary,
    skills: parsed.skills,
    experience: parsed.experience,
    education: parsed.education,
    certifications: parsed.certifications,
    projects: parsed.projects,
    languages: parsed.languages,
    extra_sections: parsed.extra_sections?.length ? parsed.extra_sections : undefined,
  };
  return fnv1a(stableStringify(content));
}

export function fingerprintJob(job: Pick<Job, "title" | "description" | "skills_required">): string {
  return fnv1a(
    stableStringify({
      title: job.title ?? "",
      description: job.description ?? "",
      skills_required: job.skills_required ?? [],
    }),
  );
}
