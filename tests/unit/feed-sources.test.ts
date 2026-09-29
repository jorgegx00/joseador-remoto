import { describe, it, expect } from "vitest";
import {
  AdzunaSource,
  AtsBoardsSource,
  GetOnBoardSource,
  HimalayasSource,
  JobicySource,
  JoobleSource,
  RemotiveSource,
  parseBoard,
  type FeedOptions,
} from "../../src/services/ingest/feed-sources";
import type { RawSourceJob } from "../../src/services/ingest/types";

const silent = { info() {}, warn() {}, error() {} };

function feed(routes: Record<string, unknown>, extra: Partial<FeedOptions> = {}) {
  const calls: string[] = [];
  const opts: FeedOptions = {
    fetchImpl: async (url) => {
      calls.push(url);
      const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
      return hit ? new Response(JSON.stringify(hit[1])) : new Response("{}", { status: 404 });
    },
    log: silent,
    consumeBudget: async () => {},
    queries: ["software engineer"],
    markets: ["DO", "LATAM", "WORLDWIDE"],
    residenceCountry: "DO",
    maxRequests: 3,
    ...extra,
  };
  return { opts, calls };
}

async function collect(gen: AsyncGenerator<RawSourceJob>): Promise<RawSourceJob[]> {
  const out: RawSourceJob[] = [];
  for await (const j of gen) out.push(j);
  return out;
}

describe("feed sources", () => {
  it("Himalayas: country-filtered search, annualized hourly pay, worldwide when unrestricted", async () => {
    const { opts, calls } = feed({
      "https://himalayas.app/jobs/api/search": {
        jobs: [
          { title: "Backend Engineer", companyName: "Acme Fictional", minSalary: 30, maxSalary: 50, salaryPeriod: "hourly", currency: "USD", locationRestrictions: [], description: "<p>Go</p>", applicationLink: "https://himalayas.app/x", guid: "https://himalayas.app/x", pubDate: 1790437813, employmentType: "Contractor" },
          { title: "Data Engineer", companyName: "Beta", locationRestrictions: ["Mexico", "Colombia"], description: "", excerpt: "Python", guid: "https://himalayas.app/y", pubDate: 1790437813 },
        ],
      },
    });
    const jobs = await collect(new HimalayasSource(opts).fetch());
    expect(calls[0]).toContain("country=DO");
    expect(jobs[0]).toMatchObject({ location: "Remote, worldwide", salary_min: 62400, salary_max: 104000, description: "Go", work_from_home: true });
    expect(jobs[0].posted_at).toBe(1790437813000);
    expect(jobs[1]).toMatchObject({ location: "Remote (Mexico, Colombia)", description: "Python" });
  });

  it("Jobicy: one request per market geo", async () => {
    const { opts, calls } = feed({
      "https://jobicy.com/api/v2/remote-jobs": { jobs: [{ id: "1", url: "https://jobicy.com/jobs/1", jobTitle: "QA &amp; Test", companyName: "Envato Fictional", jobGeo: "LATAM", jobDescription: "<p>Tests</p>", jobType: ["Full-Time"], pubDate: "2026-09-26T11:05:36+00:00" }] },
    });
    const jobs = await collect(new JobicySource(opts).fetch());
    expect(calls.map((u) => new URL(u).searchParams.get("geo"))).toEqual(["latam", "anywhere"]);
    expect(jobs[0]).toMatchObject({ title: "QA & Test", location: "Remote (LATAM)", employment_type: "Full-Time" });
  });

  it("Remotive: single category request", async () => {
    const { opts, calls } = feed({
      "https://remotive.com/api/remote-jobs": { jobs: [{ id: 7, url: "https://remotive.com/remote-jobs/x", title: "Dev", company_name: "Gamma", candidate_required_location: "Worldwide", description: "<p>JS</p>", job_type: "full_time", publication_date: "2026-09-21T12:55:11" }] },
    });
    const jobs = await collect(new RemotiveSource(opts).fetch());
    expect(calls).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ location: "Remote, worldwide", employment_type: "full time" });
  });

  it("Get on Board: company from expand, remote modality and countries", async () => {
    const { opts } = feed({
      "https://www.getonbrd.com/api/v0/search/jobs": {
        data: [
          { id: "a", links: { public_url: "https://www.getonbrd.com/jobs/a" }, attributes: { title: "React Dev", remote: true, remote_modality: "fully_remote", countries: ["Chile", "Mexico"], description: "<p>React</p>", functions: "<p>Build UI</p>", min_salary: 2000, max_salary: 3000, published_at: 1790351433, company: { data: { attributes: { name: "Delta Fictional" } } } } },
          { id: "b", links: { public_url: "https://www.getonbrd.com/jobs/b" }, attributes: { title: "KAM", remote: false, remote_modality: "hybrid", countries: ["Chile"], published_at: 1790351433, company: { data: { attributes: { name: "Epsilon" } } } } },
        ],
      },
    });
    const jobs = await collect(new GetOnBoardSource(opts).fetch());
    expect(jobs[0]).toMatchObject({ company_name: "Delta Fictional", location: "Remote (Chile, Mexico)", salary_min: 24000, salary_max: 36000, salary_currency: "USD" });
    expect(jobs[0].description).toBe("React\n\nBuild UI");
    expect(jobs[1].location).toBe("Chile · Hybrid");
  });

  it("Jooble: POST per location with the user's key", async () => {
    const { opts, calls } = feed({ "https://jooble.org/api/KEY": { jobs: [{ id: 1, title: "Dev", company: "Zeta", location: "Santo Domingo", snippet: "&nbsp;Java", link: "https://jooble.org/desc/1", type: "Full-time", updated: "2026-09-20T00:00:00" }] } });
    const jobs = await collect(new JoobleSource({ ...opts, apiKey: "KEY", locations: ["Dominican Republic"] }).fetch());
    expect(calls[0]).toBe("https://jooble.org/api/KEY");
    expect(jobs[0]).toMatchObject({ title: "Dev", location: "Santo Domingo", description: "Java" });
  });

  it("Adzuna: only supported market countries", async () => {
    const { opts, calls } = feed({ "https://api.adzuna.com": { results: [{ id: "9", title: "<strong>Engineer</strong>", company: { display_name: "Eta" }, location: { display_name: "Monterrey" }, description: "Rust", redirect_url: "https://adzuna.example/9", salary_min: 500000, created: "2026-09-10T00:00:00Z" }] } });
    const jobs = await collect(new AdzunaSource({ ...opts, markets: ["DO", "MX", "LATAM"], appId: "id", appKey: "key" }).fetch());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/jobs/mx/search/1");
    expect(jobs[0]).toMatchObject({ title: "Engineer", company_name: "Eta", location: "Monterrey" });
  });

  it("Company boards: one list request per board, canonical ATS identity", async () => {
    const { opts, calls } = feed({
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true": { jobs: [{ id: 42, title: "SRE", company_name: "Acme Fictional", location: { name: "Remote - LATAM" }, content: "&lt;p&gt;Kubernetes&lt;/p&gt;", absolute_url: "https://job-boards.greenhouse.io/acme/jobs/42" }] },
    });
    const jobs = await collect(new AtsBoardsSource({ ...opts, boards: ["https://job-boards.greenhouse.io/acme"] }).fetch());
    expect(calls).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ upstream_id: "gh:42", title: "SRE", description: "Kubernetes", location: "Remote - LATAM" });
  });

  it("parseBoard recognizes board URLs", () => {
    expect(parseBoard("job-boards.greenhouse.io/acme")).toEqual({ kind: "greenhouse", slug: "acme" });
    expect(parseBoard("https://jobs.lever.co/acme")).toEqual({ kind: "lever", slug: "acme", eu: false });
    expect(parseBoard("https://jobs.eu.lever.co/acme")).toEqual({ kind: "lever", slug: "acme", eu: true });
    expect(parseBoard("https://jobs.ashbyhq.com/acme-labs")).toEqual({ kind: "ashby", slug: "acme-labs" });
    expect(parseBoard("https://example.com/acme")).toBeNull();
  });

  it("a failing request is skipped, a budget stop propagates", async () => {
    const budget = Object.assign(new Error("cap"), { name: "BudgetExceededError" });
    const { opts } = feed({}, { consumeBudget: async () => { throw budget; } });
    await expect(collect(new HimalayasSource(opts).fetch())).rejects.toThrow("cap");
    const { opts: failing } = feed({});
    expect(await collect(new HimalayasSource(failing).fetch())).toEqual([]);
  });
});

describe("attributionFor", () => {
  it("credits the feed whose link is shown, not the first source's id", async () => {
    const { attributionFor } = await import("../../src/services/ingest/sources");
    expect(attributionFor({ external_id: "himalayas:abc", source_url: "https://remotive.com/remote-jobs/x" })?.id).toBe("remotive");
    expect(attributionFor({ external_id: "himalayas:abc", source_url: "https://himalayas.app/companies/x" })?.id).toBe("himalayas");
    // Feed id but the link now points elsewhere (merged with an employer page): no feed credit.
    expect(attributionFor({ external_id: "jobicy:abc", source_url: "https://acme.example/careers/1" })).toBeNull();
    expect(attributionFor({ external_id: "serpapi:abc", source_url: "https://acme.example/careers/1" })?.id).toBe("serpapi");
  });
});
