/**
 * Pure-function tests for the in-app ingest mapper
 * (src/services/ingest/map.ts + serpapi helpers). No DB, no network.
 */

import { describe, expect, it } from "vitest";
import { inferSeniority, mapRawJob, sanitizeText } from "../../src/services/ingest/map";
import { parseRelativePostedAt, pickApplyUrl } from "../../src/services/ingest/serpapi-source";
import type { RawSourceJob } from "../../src/services/ingest/types";

function rawJob(overrides: Partial<RawSourceJob> = {}): RawSourceJob {
  return {
    upstream_id: "x",
    title: "Senior React Developer",
    company_name: "Acme Corp",
    location: "Remote - LATAM",
    description: "Build UIs with React and TypeScript for clients across Latin America.",
    apply_url: "https://www.linkedin.com/jobs/view/123",
    raw_payload: JSON.stringify({ fixture: true }),
    ...overrides,
  };
}

describe("sanitizeText", () => {
  it("strips HTML and decodes common entities", () => {
    expect(sanitizeText("<p>Hello &amp; welcome</p><br/>Bye&nbsp;now")).toBe(
      "Hello & welcome\n\nBye now",
    );
  });

  it("collapses runs of blank lines and spaces", () => {
    expect(sanitizeText("a  b\n\n\n\nc")).toBe("a b\n\nc");
  });
});

describe("inferSeniority", () => {
  it.each([
    ["Staff Software Engineer", "principal"],
    ["Principal Engineer", "principal"],
    ["Lead Developer", "lead"],
    ["Senior QA Engineer", "senior"],
    ["Sr. Backend Developer", "senior"],
    ["Junior iOS Developer", "junior"],
    ["Software Engineer", undefined],
  ])("%s → %s", (title, expected) => {
    expect(inferSeniority(title)).toBe(expected);
  });
});

describe("parseRelativePostedAt", () => {
  const now = Date.parse("2026-06-12T12:00:00Z");

  it("parses '3 days ago'", () => {
    expect(parseRelativePostedAt("3 days ago", now)).toBe(now - 3 * 86_400_000);
  });

  it("parses '2 hours ago'", () => {
    expect(parseRelativePostedAt("2 hours ago", now)).toBe(now - 2 * 3_600_000);
  });

  it("returns undefined for unparseable text", () => {
    expect(parseRelativePostedAt("yesterday", now)).toBeUndefined();
    expect(parseRelativePostedAt(undefined, now)).toBeUndefined();
  });
});

describe("pickApplyUrl", () => {
  it("prefers LinkedIn links", () => {
    expect(
      pickApplyUrl({
        apply_options: [
          { title: "a", link: "https://jobs.example.com/1" },
          { title: "b", link: "https://www.linkedin.com/jobs/view/9" },
        ],
      }),
    ).toBe("https://www.linkedin.com/jobs/view/9");
  });

  it("prefers a non-Google direct link over Google-hosted ones", () => {
    expect(
      pickApplyUrl({
        apply_options: [
          { title: "g", link: "https://jobs.google.com/x" },
          { title: "d", link: "https://careers.example.com/apply" },
        ],
      }),
    ).toBe("https://careers.example.com/apply");
  });

  it("uses the share link when there are no apply options", () => {
    expect(pickApplyUrl({ share_link: "https://google.com/share" })).toBe(
      "https://google.com/share",
    );
  });
});

describe("mapRawJob", () => {
  it("produces a stable namespaced external_id (same scheme as the retired server)", async () => {
    const a = await mapRawJob(rawJob(), "serpapi");
    const b = await mapRawJob(rawJob(), "serpapi");
    expect(a.external_id).toBe(b.external_id);
    expect(a.external_id).toMatch(/^serpapi:[0-9a-f]{40}$/);
  });

  it("different source name → different namespace", async () => {
    const a = await mapRawJob(rawJob(), "serpapi");
    const b = await mapRawJob(rawJob(), "apify-linkedin");
    expect(a.external_id).not.toBe(b.external_id);
    expect(b.external_id.startsWith("apify-linkedin:")).toBe(true);
  });

  it("maps adapter names to source badges", async () => {
    expect((await mapRawJob(rawJob(), "serpapi")).source).toBe("aggregator");
    expect((await mapRawJob(rawJob(), "apify-linkedin")).source).toBe("linkedin");
  });

  it("flags missing critical fields for recovery instead of dropping", async () => {
    const job = await mapRawJob(
      rawJob({ title: "", description: "", raw_payload: JSON.stringify({ original: "payload" }) }),
      "serpapi",
    );
    expect(job.needs_recovery).toBe(true);
    expect(job.raw_payload).toBe(JSON.stringify({ original: "payload" }));
  });

  it("non-DR jobs are returned with the flag false — never dropped", async () => {
    const job = await mapRawJob(
      rawJob({
        location: "San Francisco, CA",
        description: "Must be based in the United States.",
      }),
      "serpapi",
    );
    expect(job.is_dr_friendly).toBe(false);
    expect(job.dr_filter_reason.length).toBeGreaterThan(0);
    expect(job.title).toBe("Senior React Developer");
  });

  it("remote jobs with no conflicting location are DR-friendly", async () => {
    const job = await mapRawJob(rawJob(), "serpapi");
    expect(job.is_dr_friendly).toBe(true);
  });

  it("infers seniority and normalizes employment type", async () => {
    const job = await mapRawJob(rawJob({ employment_type: "Full-time" }), "serpapi");
    expect(job.seniority_level).toBe("senior");
    expect(job.employment_type).toBe("full_time");
  });
});
