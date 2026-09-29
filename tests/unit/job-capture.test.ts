import { describe, it, expect } from "vitest";
import { analyzeUrl, fuzzyJobKey, stripTracking } from "../../src/lib/job-capture/canonical";
import { jobFromJsonLd } from "../../src/lib/job-capture/jsonld";
import { fetchAtsJob, type FetchLike } from "../../src/lib/job-capture/ats-api";
import { htmlToText } from "../../src/lib/job-capture/html-text";

describe("analyzeUrl", () => {
  it("LinkedIn view and list pages", () => {
    expect(analyzeUrl("https://www.linkedin.com/jobs/view/4012345678/?refId=abc&trackingId=x").canonicalKey).toBe("linkedin:4012345678");
    expect(analyzeUrl("https://www.linkedin.com/jobs/view/senior-engineer-at-acme-4012345678").canonicalKey).toBe("linkedin:4012345678");
    const list = analyzeUrl("https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=react");
    expect(list.canonicalKey).toBe("linkedin:4012345678");
    expect(list.canonicalUrl).toBe("https://www.linkedin.com/jobs/view/4012345678/");
    expect(analyzeUrl("https://www.linkedin.com/feed/").isJobPage).toBe(false);
  });

  it("Indeed, including country subdomains and list selection", () => {
    expect(analyzeUrl("https://do.indeed.com/viewjob?jk=ABCDEF1234567890&from=serp").canonicalKey).toBe("indeed:abcdef1234567890");
    expect(analyzeUrl("https://www.indeed.com/jobs?q=react&vjk=abcdef1234567890").canonicalUrl).toBe(
      "https://www.indeed.com/viewjob?jk=abcdef1234567890",
    );
  });

  it("Greenhouse boards, embeds and gh_jid career pages", () => {
    const gh = analyzeUrl("https://job-boards.greenhouse.io/acme/jobs/8556658002?gh_src=abc");
    expect(gh.canonicalKey).toBe("gh:8556658002");
    expect(gh.ats).toEqual({ kind: "greenhouse", board: "acme", id: "8556658002" });
    expect(analyzeUrl("https://boards.greenhouse.io/embed/job_app?for=acme&token=123456").ats).toEqual({
      kind: "greenhouse",
      board: "acme",
      id: "123456",
    });
    const career = analyzeUrl("https://acme.example/careers/job?gh_jid=987654");
    expect(career.canonicalKey).toBe("gh:987654");
    expect(career.ats).toMatchObject({ board: null });
  });

  it("Lever, Ashby, SmartRecruiters, Workday", () => {
    const uuid = "681fbc53-1e34-4a46-8677-3a78118674eb";
    expect(analyzeUrl(`https://jobs.lever.co/acme/${uuid}/apply`).ats).toEqual({ kind: "lever", site: "acme", id: uuid, eu: false });
    expect(analyzeUrl(`https://jobs.eu.lever.co/acme/${uuid}`).ats).toMatchObject({ eu: true });
    expect(analyzeUrl(`https://jobs.ashbyhq.com/acme/${uuid}/application`).canonicalKey).toBe(`ashby:${uuid}`);
    expect(analyzeUrl("https://jobs.smartrecruiters.com/Acme/744000148454651-data-engineer").canonicalKey).toBe("sr:744000148454651");
    const wd = analyzeUrl("https://acme.wd5.myworkdayjobs.com/en-US/External/job/Remote-Mexico/Software-Engineer_R-12345");
    expect(wd.canonicalKey).toBe("wd:acme:r-12345");
    expect(wd.ats).toMatchObject({ kind: "workday", site: "External", path: "/job/Remote-Mexico/Software-Engineer_R-12345" });
  });

  it("generic pages are not job pages until JSON-LD says so", () => {
    expect(analyzeUrl("https://acme.example/careers/engineer").site).toBe("generic");
    expect(analyzeUrl("not a url").isJobPage).toBe(false);
  });
});

describe("stripTracking / fuzzyJobKey", () => {
  it("drops tracking params and fragments", () => {
    expect(stripTracking("https://acme.example/job?id=1&utm_source=x&gclid=y#apply")).toBe("https://acme.example/job?id=1");
    expect(stripTracking("https://acme.example/careers#/job/2")).toBe("https://acme.example/careers#/job/2");
  });
  it("normalizes company suffixes, accents and punctuation", () => {
    expect(fuzzyJobKey("Acme, Inc.", "Sr. Engineer (Remote)", "Bogotá, Colombia")).toBe(fuzzyJobKey("ACME", "sr engineer", "bogota"));
  });
});

describe("htmlToText", () => {
  it("keeps list structure, decodes entities and drops invisible characters", () => {
    const text = htmlToText("<p>Hello&nbsp;world</p><ul><li>Node.js</li><li>React​</li></ul><script>x()</script>");
    expect(text).toBe("Hello world\n\n- Node.js\n- React");
  });
  it("handles Greenhouse's double-encoded HTML", () => {
    expect(htmlToText("&lt;p&gt;We build &amp;amp; ship&lt;/p&gt;")).toBe("We build & ship");
  });
});

describe("jobFromJsonLd", () => {
  const block = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "Ignored" },
      {
        "@type": "JobPosting",
        title: "Backend Engineer",
        description: "<p>Build APIs in <b>Go</b>.</p>",
        datePosted: "2026-09-01",
        validThrough: "2026-10-31T00:00",
        employmentType: ["FULL_TIME"],
        hiringOrganization: { "@type": "Organization", name: "Acme Fictional" },
        jobLocationType: "TELECOMMUTE",
        applicantLocationRequirements: [
          { "@type": "Country", name: "Dominican Republic" },
          { "@type": "Country", name: "Mexico" },
        ],
        baseSalary: { "@type": "MonetaryAmount", currency: "USD", value: { "@type": "QuantitativeValue", minValue: 4000, maxValue: 5500, unitText: "MONTH" } },
      },
    ],
  });

  it("maps the posting", () => {
    const job = jobFromJsonLd([block])!;
    expect(job.title).toBe("Backend Engineer");
    expect(job.company).toBe("Acme Fictional");
    expect(job.description).toBe("Build APIs in Go.");
    expect(job.employmentType).toBe("full_time");
    expect(job.remote).toBe(true);
    expect(job.applicantCountries).toEqual(["DO", "MX"]);
    expect(job.location).toBe("Remote (Dominican Republic, Mexico)");
    expect(job.salary).toEqual({ min: 4000, max: 5500, currency: "USD", period: "month" });
    expect(job.postedAt).toBe(Date.parse("2026-09-01"));
  });

  it("ignores broken blocks and pages without a JobPosting", () => {
    expect(jobFromJsonLd(["{not json", JSON.stringify({ "@type": "WebPage" })])).toBeNull();
    expect(jobFromJsonLd(["{not json", block])?.title).toBe("Backend Engineer");
  });
});

describe("fetchAtsJob", () => {
  const respond = (routes: Record<string, unknown>): FetchLike => async (url) => {
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    return hit ? new Response(JSON.stringify(hit[1]), { status: 200 }) : new Response("not found", { status: 404 });
  };

  it("Greenhouse", async () => {
    const job = await fetchAtsJob(
      { kind: "greenhouse", board: "acme", id: "1" },
      respond({
        "https://boards-api.greenhouse.io/v1/boards/acme/jobs/1": {
          title: "Data Engineer",
          company_name: "Acme Fictional",
          location: { name: "Remote, LATAM" },
          content: "&lt;p&gt;Pipelines&lt;/p&gt;",
          absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1",
          first_published: "2026-09-10T00:00:00Z",
          pay_input_ranges: [{ min_cents: 6000000, max_cents: 8000000, currency_type: "USD" }],
        },
      }),
    );
    expect(job).toMatchObject({ title: "Data Engineer", company: "Acme Fictional", location: "Remote, LATAM", description: "Pipelines", remote: true });
    expect(job?.salary).toEqual({ min: 60000, max: 80000, currency: "USD", period: "year" });
  });

  it("Ashby picks the posting out of the board and reads structured pay", async () => {
    const id = "7458d4e9-da2e-47bd-98cb-adfda43d42b2";
    const job = await fetchAtsJob(
      { kind: "ashby", org: "acme-labs", id },
      respond({
        "https://api.ashbyhq.com/posting-api/job-board/acme-labs": {
          jobs: [
            { id: "other", title: "Other" },
            {
              id,
              title: "Platform Engineer",
              location: "Remote - European Union",
              isRemote: true,
              employmentType: "FullTime",
              descriptionPlain: "Kubernetes",
              jobUrl: `https://jobs.ashbyhq.com/acme-labs/${id}`,
              compensation: { compensationTiers: [{ components: [{ compensationType: "Salary", interval: "1 YEAR", currencyCode: "EUR", minValue: 110000, maxValue: 185000 }] }] },
            },
          ],
        },
      }),
    );
    expect(job).toMatchObject({ title: "Platform Engineer", company: "Acme Labs", remote: true, employmentType: "full_time" });
    expect(job?.salary).toEqual({ min: 110000, max: 185000, currency: "EUR", period: "year" });
  });

  it("returns null when Greenhouse's board is unknown or the posting is missing", async () => {
    expect(await fetchAtsJob({ kind: "greenhouse", board: null, id: "1" }, respond({}))).toBeNull();
    expect(await fetchAtsJob({ kind: "ashby", org: "acme", id: "x" }, respond({ "https://api.ashbyhq.com": { jobs: [] } }))).toBeNull();
  });

  it("throws on HTTP errors", async () => {
    await expect(fetchAtsJob({ kind: "lever", site: "acme", id: "x", eu: false }, respond({}))).rejects.toThrow("HTTP 404");
  });
});
