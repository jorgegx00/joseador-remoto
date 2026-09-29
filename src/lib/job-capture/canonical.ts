/**
 * Job-posting identity from a URL: which site/ATS it is, a stable canonical key
 * ("linkedin:4012345678", "gh:8556658002") and a canonical URL without tracking
 * parameters. Used by paste-by-URL and the company-board feeds; DOM- and
 * network-free.
 */

export type CaptureSite =
  | "linkedin"
  | "indeed"
  | "google_jobs"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "smartrecruiters"
  | "generic";

/** Enough to call the ATS's public posting API. */
export type AtsRef =
  | { kind: "greenhouse"; board: string | null; id: string }
  | { kind: "lever"; site: string; id: string; eu: boolean }
  | { kind: "ashby"; org: string; id: string }
  | { kind: "workday"; origin: string; tenant: string; site: string; path: string; reqId: string }
  | { kind: "smartrecruiters"; company: string; id: string };

export interface UrlAnalysis {
  site: CaptureSite;
  /** Stable identity across visits/sources; null when the URL doesn't carry one. */
  canonicalKey: string | null;
  canonicalUrl: string;
  ats: AtsRef | null;
  /**
   * The page is a job posting (not a search list without a selected job), so a
   * capture button makes sense. Generic pages are "maybe" until JSON-LD is seen.
   */
  isJobPage: boolean;
}

const TRACKING_PARAMS = /^(utm_\w+|refId|trackingId|trk|trkInfo|lipi|midToken|midSig|eBP|from|src|source|ref|referrer|gclid|fbclid|mc_\w+|_hsenc|_hsmi|gh_src|lever-source|lever-origin|ashby_src)$/i;

function parse(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/**
 * Drops tracking parameters and the fragment — except hash routes
 * ("…/careers#/job/123"), which are the posting's address on single-page career sites.
 */
export function stripTracking(url: string): string {
  const u = parse(url);
  if (!u) return url;
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  }
  if (!/^#!?\//.test(u.hash)) u.hash = "";
  return u.toString();
}

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

function result(site: CaptureSite, canonicalKey: string | null, canonicalUrl: string, ats: AtsRef | null, isJobPage: boolean): UrlAnalysis {
  return { site, canonicalKey, canonicalUrl, ats, isJobPage };
}

export function analyzeUrl(url: string): UrlAnalysis {
  const u = parse(url);
  if (!u) return result("generic", null, url, null, false);
  const host = u.hostname.toLowerCase();
  const segs = u.pathname.split("/").filter(Boolean);

  // --- LinkedIn: /jobs/view/<id> or /jobs/view/<slug>-<id>; list pages carry ?currentJobId=
  if (hostIs(host, "linkedin.com")) {
    let id: string | null = null;
    const vi = segs.indexOf("view");
    if (segs[0] === "jobs" && vi >= 0 && segs[vi + 1]) id = /(\d{6,})\/?$/.exec(segs[vi + 1])?.[1] ?? null;
    id ??= u.searchParams.get("currentJobId");
    if (id && /^\d+$/.test(id)) {
      return result("linkedin", `linkedin:${id}`, `https://www.linkedin.com/jobs/view/${id}/`, null, true);
    }
    return result("linkedin", null, stripTracking(url), null, false);
  }

  // --- Indeed: /viewjob?jk=<hex>, list pages ?vjk=<hex>, country subdomains (do.indeed.com)
  if (hostIs(host, "indeed.com") || /(^|\.)indeed\.[a-z.]+$/.test(host)) {
    const jk = u.searchParams.get("jk") ?? u.searchParams.get("vjk");
    if (jk && /^[0-9a-f]{8,}$/i.test(jk)) {
      return result("indeed", `indeed:${jk.toLowerCase()}`, `https://${host}/viewjob?jk=${jk.toLowerCase()}`, null, true);
    }
    return result("indeed", null, stripTracking(url), null, false);
  }

  // --- Google for Jobs panel: google.<tld>/search?udm=8 | ibp=htl;jobs, job id in the fragment
  if (/(^|\.)google\.[a-z.]+$/.test(host) && u.pathname === "/search") {
    const isJobs = u.searchParams.get("udm") === "8" || (u.searchParams.get("ibp") ?? "").includes("jobs");
    const frag = new URLSearchParams(u.hash.replace(/^#/, ""));
    const docId = frag.get("vhid") ?? frag.get("htidocid") ?? u.searchParams.get("htidocid");
    if (isJobs) {
      return result("google_jobs", docId ? `google:${docId}` : null, url, null, Boolean(docId));
    }
  }

  // --- Greenhouse: (job-)boards(.eu).greenhouse.io/<board>/jobs/<id>, embeds ?for=<board>&token=<id>
  if (hostIs(host, "greenhouse.io")) {
    const ji = segs.indexOf("jobs");
    const id = (ji >= 0 ? segs[ji + 1] : null) ?? u.searchParams.get("token") ?? u.searchParams.get("gh_jid");
    const board = (ji > 0 ? segs[ji - 1] : null) ?? u.searchParams.get("for");
    if (id && /^\d+$/.test(id)) {
      const canonical = board ? `https://job-boards.greenhouse.io/${board}/jobs/${id}` : stripTracking(url);
      return result("greenhouse", `gh:${id}`, canonical, { kind: "greenhouse", board, id }, true);
    }
    return result("greenhouse", null, stripTracking(url), null, false);
  }
  // Company career pages embedding Greenhouse: ?gh_jid=<id> (board token unknown)
  const ghJid = u.searchParams.get("gh_jid");
  if (ghJid && /^\d+$/.test(ghJid)) {
    return result("greenhouse", `gh:${ghJid}`, stripTracking(url), { kind: "greenhouse", board: null, id: ghJid }, true);
  }

  // --- Lever: jobs(.eu).lever.co/<site>/<uuid>[/apply]
  if (hostIs(host, "lever.co") && segs.length >= 2 && /^[0-9a-f-]{36}$/i.test(segs[1])) {
    const eu = host.includes(".eu.");
    return result(
      "lever",
      `lever:${segs[1].toLowerCase()}`,
      `https://${host}/${segs[0]}/${segs[1]}`,
      { kind: "lever", site: segs[0], id: segs[1], eu },
      true,
    );
  }

  // --- Ashby: jobs.ashbyhq.com/<org>/<uuid>[/application]
  if (hostIs(host, "ashbyhq.com") && segs.length >= 2 && /^[0-9a-f-]{36}$/i.test(segs[1])) {
    return result(
      "ashby",
      `ashby:${segs[1].toLowerCase()}`,
      `https://jobs.ashbyhq.com/${segs[0]}/${segs[1]}`,
      { kind: "ashby", org: segs[0], id: segs[1] },
      true,
    );
  }

  // --- Workday: <tenant>.wd<N>.myworkdayjobs.com/[<locale>/]<site>/job/<location>/<title>_<reqId>
  if (hostIs(host, "myworkdayjobs.com")) {
    const tenant = host.split(".")[0];
    const jobIdx = segs.indexOf("job");
    if (jobIdx >= 1) {
      const site = segs[jobIdx - 1];
      const path = `/${segs.slice(jobIdx).join("/")}`;
      const reqId = /_([A-Za-z0-9-]+)$/.exec(segs[segs.length - 1])?.[1] ?? segs[segs.length - 1];
      return result(
        "workday",
        `wd:${tenant}:${reqId.toLowerCase()}`,
        `https://${host}/${site}${path}`,
        { kind: "workday", origin: `https://${host}`, tenant, site, path, reqId },
        true,
      );
    }
    return result("workday", null, stripTracking(url), null, false);
  }

  // --- SmartRecruiters: jobs.smartrecruiters.com/<company>/<id>[-slug], www.smartrecruiters.com/<company>/<id>
  if (hostIs(host, "smartrecruiters.com") && segs.length >= 2) {
    const id = /^(\d{6,})/.exec(segs[1])?.[1];
    if (id) {
      return result(
        "smartrecruiters",
        `sr:${id}`,
        `https://jobs.smartrecruiters.com/${segs[0]}/${id}`,
        { kind: "smartrecruiters", company: segs[0], id },
        true,
      );
    }
  }

  return result("generic", null, stripTracking(url), null, false);
}

function foldKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|s\.?a\.?|s\.?r\.?l\.?|gmbh|corp|co)\b\.?/g, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Cross-source fingerprint for "same job seen on LinkedIn and on the company's
 * Greenhouse board": normalized company + title + first location token.
 */
export function fuzzyJobKey(company: string, title: string, location: string): string {
  const city = foldKey(location.split(/[,|/(]/)[0] ?? "");
  return `${foldKey(company)}|${foldKey(title)}|${city}`;
}
