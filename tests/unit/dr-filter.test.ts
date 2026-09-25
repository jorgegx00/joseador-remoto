import { describe, it, expect } from "vitest";
import { isDrFriendly } from "../../src/lib/dr-filter";

describe("isDrFriendly", () => {
  // --- Explicit LATAM / DR (friendly) ---

  it("marks 'Dominican Republic' as explicit_latam", () => {
    const result = isDrFriendly("Dominican Republic", "");
    expect(result.friendly).toBe(true);
    expect(result.eligibility).toBe("explicit_latam");
  });

  it("marks 'Santo Domingo, DR' as friendly", () => {
    const result = isDrFriendly("Santo Domingo, DR", "");
    expect(result.friendly).toBe(true);
    expect(result.eligibility).toBe("explicit_latam");
  });

  it("marks 'Republica Dominicana' as friendly", () => {
    const result = isDrFriendly("Republica Dominicana", "");
    expect(result.friendly).toBe(true);
  });

  it("marks 'Remote - LATAM' as explicit_latam", () => {
    const result = isDrFriendly("Remote - LATAM", "");
    expect(result.friendly).toBe(true);
    expect(result.eligibility).toBe("explicit_latam");
  });

  it("marks 'Latin America' as friendly", () => {
    const result = isDrFriendly("Latin America", "");
    expect(result.friendly).toBe(true);
  });

  it("marks 'Caribbean' as friendly", () => {
    const result = isDrFriendly("Caribbean", "");
    expect(result.friendly).toBe(true);
  });

  it("marks a list of LATAM countries without the DR as restricted", () => {
    const result = isDrFriendly("Colombia, Costa Rica, El Salvador", "");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("restricted");
  });

  it("is case-insensitive: 'latam' -> friendly", () => {
    const result = isDrFriendly("remote - latam", "");
    expect(result.friendly).toBe(true);
  });

  it("detects LATAM in description when location is empty", () => {
    const result = isDrFriendly("", "This role is open to candidates in Latin America");
    expect(result.friendly).toBe(true);
  });

  it("marks 'LATAM excluding DR' as restricted", () => {
    const result = isDrFriendly("LATAM excluding DR", "");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("restricted");
  });

  it("marks description-only mention of DR as friendly", () => {
    const result = isDrFriendly("", "Open to candidates in the Dominican Republic");
    expect(result.friendly).toBe(true);
  });

  it("marks Republica Dominicana with accent as friendly", () => {
    const result = isDrFriendly("", "Abierto para candidatos en la Republica Dominicana");
    expect(result.friendly).toBe(true);
  });

  it("uses the title as a signal when location is a generic 'Anywhere'", () => {
    // Real-world shape: LATAM lives in the title, location is just "Anywhere".
    const result = isDrFriendly("Anywhere", "", "AI Engineer (Remote, LATAM)");
    expect(result.friendly).toBe(true);
    expect(result.eligibility).toBe("explicit_latam");
  });

  // --- Genuinely global (friendly via global_remote) ---

  it("marks 'Worldwide' as global_remote", () => {
    const result = isDrFriendly("Worldwide", "");
    expect(result.friendly).toBe(true);
    expect(result.eligibility).toBe("global_remote");
  });

  it("marks explicit 'work from anywhere in the world' as global_remote", () => {
    const result = isDrFriendly("Remote", "We hire from anywhere in the world, no location requirement.");
    expect(result.friendly).toBe(true);
    expect(result.eligibility).toBe("global_remote");
  });

  // --- Ambiguous remote (NOT friendly until adjudicated) ---

  it("marks bare 'Remote' as ambiguous (not friendly)", () => {
    const result = isDrFriendly("Remote", "");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("ambiguous");
  });

  it("marks bare 'Anywhere' as ambiguous — 'anywhere' often means anywhere in the USA", () => {
    const result = isDrFriendly("Anywhere", "");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("ambiguous");
  });

  it("marks bare 'Global' as ambiguous", () => {
    const result = isDrFriendly("Global", "");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("ambiguous");
  });

  it("marks 'Distributed team' (no strong global phrase) as ambiguous", () => {
    const result = isDrFriendly("Distributed team", "");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("ambiguous");
  });

  it("marks empty location/description as ambiguous (unknown)", () => {
    const result = isDrFriendly("", "");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("ambiguous");
  });

  // --- Restricted: explicit US / non-LATAM eligibility ---

  it("marks 'Anywhere' + US work authorization in description as restricted", () => {
    const result = isDrFriendly("Anywhere", "Must be authorized to work in the United States. Fully remote.");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("restricted");
  });

  it("marks 'Remote' + US-based-only as restricted", () => {
    const result = isDrFriendly("Remote", "This is a US-based only position.");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("restricted");
  });

  it("marks 'Remote across North America' as restricted", () => {
    const result = isDrFriendly("Remote", "Work from anywhere across North America.");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("restricted");
  });

  it("marks 'Remote - United States' as restricted", () => {
    const result = isDrFriendly("Remote - United States", "");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("restricted");
  });

  // --- A US time zone is NOT a disqualifier ---

  it("keeps a LATAM job friendly even when it requires US time-zone overlap", () => {
    const result = isDrFriendly(
      "Remote - LATAM",
      "You must overlap with US Eastern Time (EST) working hours.",
    );
    expect(result.friendly).toBe(true);
    expect(result.eligibility).toBe("explicit_latam");
  });

  it("keeps a globally-remote job friendly despite mentioning PST hours", () => {
    const result = isDrFriendly(
      "Worldwide",
      "Some overlap with PST business hours is appreciated.",
    );
    expect(result.friendly).toBe(true);
    expect(result.eligibility).toBe("global_remote");
  });

  // --- Restricted: single non-DR LATAM location / non-LATAM location ---

  it("marks single non-DR LATAM city as restricted", () => {
    const result = isDrFriendly("Bogota, Colombia", "");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("restricted");
  });

  it("marks 'Buenos Aires' as restricted", () => {
    const result = isDrFriendly("Buenos Aires", "");
    expect(result.friendly).toBe(false);
  });

  it("marks single non-DR LATAM country 'Mexico' as restricted", () => {
    const result = isDrFriendly("Mexico", "");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("restricted");
  });

  it("marks single non-DR LATAM country 'Brasil' as restricted", () => {
    const result = isDrFriendly("Brasil", "");
    expect(result.friendly).toBe(false);
  });

  it("marks 'New York, NY' as restricted (non-LATAM)", () => {
    const result = isDrFriendly("New York, NY", "");
    expect(result.friendly).toBe(false);
    expect(result.eligibility).toBe("restricted");
  });

  it("marks 'London, UK' as restricted", () => {
    const result = isDrFriendly("London, UK", "");
    expect(result.friendly).toBe(false);
  });

  it("marks 'Remote within Colombia' as restricted", () => {
    const result = isDrFriendly("Remote within Colombia", "");
    expect(result.friendly).toBe(false);
  });

  it("marks specific European cities as restricted", () => {
    const result = isDrFriendly("Berlin, Germany", "");
    expect(result.friendly).toBe(false);
  });

  it("marks India-based role as restricted", () => {
    const result = isDrFriendly("Bangalore, India", "");
    expect(result.friendly).toBe(false);
  });
  // --- LATAM narrowed to specific countries / cities (not DR) ---

  const expectTier = (r: ReturnType<typeof isDrFriendly>, tier: string) => {
    expect(r.eligibility).toBe(tier);
    expect(r.friendly).toBe(tier === "explicit_latam" || tier === "global_remote");
  };

  it("restricts a LATAM title whose location is a single non-DR city", () => {
    expectTier(isDrFriendly("Bogotá, Colombia", "", "Senior Engineer – LATAM"), "restricted");
  });

  it("restricts LATAM postings limited to one country in the description", () => {
    expectTier(
      isDrFriendly("Remote - LATAM", "This role is open to candidates based in Brazil only"),
      "restricted",
    );
  });

  it("restricts 'Remote - LATAM (Mexico)'", () => {
    expectTier(isDrFriendly("Remote - LATAM (Mexico)", ""), "restricted");
  });

  it("restricts a multi-country list that omits the DR", () => {
    const r = isDrFriendly("Colombia, Mexico, Argentina", "");
    expectTier(r, "restricted");
    expect(r.reason).toContain("Colombia");
  });

  it("restricts a description that scopes eligibility to named countries", () => {
    expectTier(isDrFriendly("Remote", "Candidates must be located in Colombia or Mexico."), "restricted");
    expectTier(isDrFriendly("Remoto", "Requisito: residir en Argentina."), "restricted");
  });

  it("treats a country list introduced by 'including' as examples", () => {
    expectTier(
      isDrFriendly("Remote - LATAM", "Open to candidates in LATAM, including Colombia, Mexico and Argentina"),
      "explicit_latam",
    );
    expectTier(isDrFriendly("Remote - LATAM (Brazil, Chile, etc.)", ""), "explicit_latam");
  });

  it("ignores office/HQ mentions in the description", () => {
    expectTier(
      isDrFriendly("Remote - LATAM", "We have offices in Mexico City and Bogotá"),
      "explicit_latam",
    );
    expectTier(
      isDrFriendly("Remote - LATAM", "Our company is based in Colombia and hires across the region."),
      "explicit_latam",
    );
  });

  // --- On-site / hybrid outside DR ---

  it("restricts a hybrid role in a non-DR city", () => {
    expectTier(
      isDrFriendly("Mexico City", "Hybrid – 3 days a week in our office. LATAM team."),
      "restricted",
    );
  });

  it("restricts an on-site LATAM role", () => {
    expectTier(isDrFriendly("São Paulo, Brazil", "On-site role", "Dev (LATAM)"), "restricted");
    expectTier(isDrFriendly("Hybrid", "", "Backend Engineer - LATAM"), "restricted");
    expectTier(isDrFriendly("Latin America", "This position is fully on-site."), "restricted");
  });

  it("does not treat 'hybrid apps' / 'distributed systems' as work arrangements", () => {
    expectTier(isDrFriendly("Remote - LATAM", "Experience building hybrid apps with Ionic."), "explicit_latam");
  });

  it("sends remote listings that mention on-site work to review", () => {
    expectTier(isDrFriendly("Remote - LATAM", "This is a hybrid role."), "ambiguous");
  });

  it("keeps on-site roles in the DR", () => {
    expectTier(isDrFriendly("Santo Domingo, DR", "On-site"), "explicit_latam");
  });

  // --- DR aliases ---

  it.each([
    ["Santiago de los Caballeros", ""],
    ["Remote (RD)", ""],
    ["Santo Domingo, DO", ""],
    ["Rep. Dom.", ""],
    ["Punta Cana", ""],
    ["Bávaro", ""],
    ["Distrito Nacional", ""],
    ["Santo Domingo, R.D.", ""],
    ["La Vega, Dominican Republic", ""],
    ["", "Trabajo remoto desde República Dominicana"],
    ["Remote - LATAM, Colombia, Dominican Republic", ""],
  ])("recognizes DR alias %j / %j", (loc, desc) => {
    expectTier(isDrFriendly(loc, desc), "explicit_latam");
  });

  it("treats bare 'Santiago' as Chile, not DR", () => {
    expectTier(isDrFriendly("Santiago", ""), "restricted");
  });

  it("does not read 'Dr.' / 'do' in prose as DR codes", () => {
    expectTier(isDrFriendly("Remote", "Dr. Smith will be your manager; what we do"), "ambiguous");
  });

  // --- Generic LATAM is kept ---

  it("keeps generic LATAM postings", () => {
    expectTier(isDrFriendly("Remote", "We are the leading fintech in LATAM"), "explicit_latam");
    expectTier(isDrFriendly("Remote", "Hiring across Latin America"), "explicit_latam");
    expectTier(isDrFriendly("Remote - Americas", ""), "explicit_latam");
    expectTier(isDrFriendly("Remote - Nearshore LATAM", ""), "explicit_latam");
    expectTier(isDrFriendly("Remote (US or LATAM)", ""), "explicit_latam");
  });

  it("keeps LATAM postings that exclude a different country", () => {
    expectTier(isDrFriendly("Remote", "Open to candidates in LATAM, excluding Brazil"), "explicit_latam");
  });

  it("restricts LATAM postings that exclude the Caribbean", () => {
    expectTier(isDrFriendly("Remote - Latin America, excluding Caribbean", ""), "restricted");
  });

  it("does not match place names inside other words", () => {
    expectTier(isDrFriendly("Remote", "Climate tech startup"), "ambiguous");
  });
  // --- Remote roles based outside LATAM ---

  it("restricts a remote role based in Greece (Goodpath)", () => {
    const desc =
      "-> Team in Greece <-\nThis is a remote role based in Greece, and you'll join existing team members in the Athens and Chania areas. We're remote-first, and we value time together in person when it makes the work better.";
    for (const loc of ["Remote", "Anywhere", "Worldwide", ""]) {
      expectTier(isDrFriendly(loc, desc, "Senior Full-Stack Software Engineer"), "restricted");
    }
  });

  it("restricts remote roles scoped to any non-LATAM country", () => {
    expectTier(isDrFriendly("Remote", "Candidates must reside in Poland."), "restricted");
    expectTier(isDrFriendly("Remote", "Open to candidates in Turkey only."), "restricted");
    expectTier(isDrFriendly("Remote, US", ""), "restricted");
    expectTier(isDrFriendly("Athens", ""), "restricted");
  });

  it("does not treat a foreign HQ as a restriction when hiring is worldwide", () => {
    expectTier(
      isDrFriendly("Remote", "Our company is based in Germany. We hire from anywhere in the world."),
      "global_remote",
    );
  });

  it("keeps 'based in LATAM or Spain' as LATAM-friendly", () => {
    expectTier(isDrFriendly("Remote", "Candidates must be based in LATAM or Spain."), "explicit_latam");
  });

  it("does not read first names like 'Jordan' in prose as countries", () => {
    expectTier(isDrFriendly("Remote", "You'll report to Jordan, our CTO."), "ambiguous");
  });
});
