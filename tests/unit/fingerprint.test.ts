import { describe, it, expect } from "vitest";
import { fingerprintCv, fingerprintJob, fnv1a, stableStringify } from "@/lib/utils/fingerprint";
import type { ParsedCv } from "@/types/cv";
import { sampleParsedCv } from "../fixtures/sample-cv";
import { sampleJob } from "../fixtures/sample-job";

describe("fnv1a", () => {
  it("matches the reference FNV-1a 32-bit values", () => {
    expect(fnv1a("")).toBe("811c9dc5");
    expect(fnv1a("a")).toBe("e40c292c");
    expect(fnv1a("foobar")).toBe("bf9cf968");
  });

  it("hashes UTF-8 and returns 8 hex chars", () => {
    expect(fnv1a("Educación")).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a("Educación")).not.toBe(fnv1a("Educacion"));
  });
});

describe("stableStringify", () => {
  it("sorts keys recursively and drops undefined", () => {
    expect(stableStringify({ b: 1, a: { d: [1, { f: 2, e: 3 }], c: undefined } })).toBe(
      '{"a":{"d":[1,{"e":3,"f":2}]},"b":1}',
    );
  });
});

describe("fingerprintCv", () => {
  it("is stable across key order and missing extra_sections", () => {
    const reordered = Object.fromEntries(Object.entries(sampleParsedCv).reverse()) as unknown as ParsedCv;
    expect(fingerprintCv(reordered)).toBe(fingerprintCv(sampleParsedCv));
    expect(fingerprintCv({ ...sampleParsedCv, extra_sections: [] })).toBe(fingerprintCv(sampleParsedCv));
  });

  it("changes when content changes", () => {
    expect(fingerprintCv({ ...sampleParsedCv, summary: "Different" })).not.toBe(fingerprintCv(sampleParsedCv));
    const exp = sampleParsedCv.experience.map((e, i) => (i === 0 ? { ...e, title: "CTO" } : e));
    expect(fingerprintCv({ ...sampleParsedCv, experience: exp })).not.toBe(fingerprintCv(sampleParsedCv));
  });
});

describe("fingerprintJob", () => {
  it("depends only on title, description and skills", () => {
    const fp = fingerprintJob(sampleJob);
    expect(fingerprintJob({ ...sampleJob, id: "other", scraped_at: 1 })).toBe(fp);
    expect(fingerprintJob({ ...sampleJob, description: sampleJob.description + "!" })).not.toBe(fp);
    expect(fingerprintJob({ ...sampleJob, skills_required: ["Go"] })).not.toBe(fp);
  });
});
