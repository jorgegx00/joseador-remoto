import { describe, it, expect } from "vitest";
import {
  assessJobMarkets,
  assessMarket,
  extractLocationScope,
  type AssessContext,
} from "../../src/lib/markets/eligibility";
import { isDrFriendly } from "../../src/lib/dr-filter";
import { resolveCountry } from "../../src/lib/markets/countries";
import type { MarketProfile } from "../../src/types";

const inMexico: AssessContext = { residenceCountry: "MX", authorizations: ["MX"] };
const inSpain: AssessContext = { residenceCountry: "ES", authorizations: ["ES"] };

function judge(location: string, description: string, market: string, ctx = inMexico, title = "") {
  return assessMarket(extractLocationScope(location, description, title), market, ctx);
}

describe("extractLocationScope", () => {
  it("reads countries and cities from the location", () => {
    const s = extractLocationScope("Bogotá, Colombia", "");
    expect(s.countries).toEqual(["CO"]);
  });

  it("treats a US state abbreviation after a comma as the US", () => {
    expect(extractLocationScope("Denver, CO", "").countries).toEqual(["US"]);
    expect(extractLocationScope("Austin, TX (Hybrid)", "").workplace).toBe("hybrid");
  });

  it("keeps both readings of a code that is a US state and a country", () => {
    expect(extractLocationScope("Remote, DE", "").countries).toEqual(["DE", "US"]);
    expect(judge("Nuremberg, DE (Hybrid)", "", "DE", { residenceCountry: "DE", authorizations: ["DE"] }).verdict).toBe("explicit");
  });

  it("treats 'Americas' as both North and Latin America", () => {
    const s = extractLocationScope("Remote - Americas", "");
    expect(s.regions).toEqual(["LATAM", "NA"]);
    expect(judge("Remote - Americas", "", "US", { residenceCountry: "US", authorizations: ["US"] }).verdict).toBe("explicit");
  });

  it("lets a longer country name win over a region inside it", () => {
    const s = extractLocationScope("Remote - South Africa", "");
    expect(s.countries).toEqual(["ZA"]);
    expect(s.regions).toEqual([]);
    expect(judge("Remote - South Africa", "", "ES", inSpain).verdict).toBe("restricted");
  });

  it("does not turn a Canadian province code into the US", () => {
    expect(extractLocationScope("Toronto, ON", "").countries).toEqual(["CA"]);
  });

  it("prefers the longer DR city over bare Santiago", () => {
    expect(extractLocationScope("Santiago de los Caballeros", "").countries).toEqual(["DO"]);
    expect(extractLocationScope("Santiago", "").countries).toEqual(["CL"]);
  });

  it("recognises country names in other languages", () => {
    expect(extractLocationScope("Remoto - Alemania", "").countries).toEqual(["DE"]);
    expect(extractLocationScope("Remoto, Brasil", "").countries).toEqual(["BR"]);
  });

  it("detects regions and exclusions", () => {
    const s = extractLocationScope("Remote - LATAM excluding Brazil", "");
    expect(s.regions).toEqual(["LATAM"]);
    expect(s.excludedCountries).toEqual(["BR"]);
  });

  it("maps US work-authorization phrases to workAuth US", () => {
    const s = extractLocationScope("Remote", "Candidates must be authorized to work in the United States.");
    expect(s.workAuth).toEqual(["US"]);
  });

  it("scopes body places only after eligibility phrases", () => {
    expect(extractLocationScope("Remote", "Our HQ is in Berlin. We hire worldwide.").countries).toEqual([]);
    expect(extractLocationScope("Remote", "You must be based in Portugal.").countries).toEqual(["PT"]);
  });

  it("ignores example lists", () => {
    const s = extractLocationScope("Remote", "Open to candidates in LATAM (such as Colombia, Mexico, etc.)");
    expect(s.countries).toEqual([]);
    expect(s.regions).toEqual(["LATAM"]);
  });

  it("detects visa sponsorship statements", () => {
    expect(extractLocationScope("Berlin", "Visa sponsorship is available.").visaSponsorship).toBe("yes");
    expect(extractLocationScope("Berlin", "We are unable to sponsor visas.").visaSponsorship).toBe("no");
  });

  it("flags a worldwide statement as global", () => {
    expect(extractLocationScope("Remote", "We hire from anywhere in the world.").global).toBe(true);
  });
});

describe("assessMarket — country markets", () => {
  it("on-site in the market country is explicit", () => {
    expect(judge("Monterrey, Mexico (On-site)", "", "MX").verdict).toBe("explicit");
  });

  it("on-site elsewhere is restricted", () => {
    expect(judge("London, UK (Hybrid)", "", "MX").verdict).toBe("restricted");
  });

  it("remote limited to another country is restricted", () => {
    const r = judge("Remote - Colombia", "", "MX");
    expect(r.verdict).toBe("restricted");
    expect(r.reason).toMatch(/Limited to/);
  });

  it("a region containing the market is explicit", () => {
    expect(judge("Remote - LATAM", "", "MX").verdict).toBe("explicit");
  });

  it("an explicit exclusion wins", () => {
    expect(judge("Remote - LATAM except Mexico", "", "MX").verdict).toBe("restricted");
  });

  it("US work authorization restricts non-US markets but not US or Puerto Rico", () => {
    const desc = "Must be authorized to work in the US.";
    expect(judge("Remote", desc, "MX").verdict).toBe("restricted");
    expect(judge("Remote", desc, "US").verdict).not.toBe("restricted");
    expect(judge("Remote", desc, "PR").verdict).not.toBe("restricted");
  });

  it("a US work-authorization requirement makes a remote role explicit for the US market", () => {
    expect(judge("Remote", "Must be authorized to work in the US.", "US").verdict).toBe("explicit");
    expect(judge("Remote", "Must be authorized to work in the US.", "PR").verdict).toBe("explicit");
  });

  it("a user who holds the required authorization is not restricted", () => {
    // The authorization check passes, but the role is still a US role: it matches
    // the user's US market, not their Mexico market.
    const ctx: AssessContext = { residenceCountry: "MX", authorizations: ["MX", "US"] };
    const desc = "Must be authorized to work in the US.";
    expect(judge("Remote", desc, "US", ctx).verdict).toBe("explicit");
    expect(judge("Remote", desc, "MX", ctx).reason).toMatch(/Limited to/);
  });

  it("a US time-zone requirement is not a restriction", () => {
    expect(judge("Remote", "Must overlap with EST business hours. We hire worldwide.", "MX").verdict).toBe("global");
  });

  it("bare remote is ambiguous", () => {
    expect(judge("Remote", "Great team, great product.", "MX").verdict).toBe("ambiguous");
  });

  it("remote in the head plus on-site in the body needs review", () => {
    expect(judge("Remote - LATAM", "This is a hybrid role, 3 days a week in the office.", "MX").verdict).toBe("ambiguous");
  });
});

describe("assessMarket — region markets", () => {
  it("LATAM market accepts a LATAM-wide posting", () => {
    expect(judge("Remote (Latin America)", "", "LATAM").verdict).toBe("explicit");
  });

  it("LATAM market accepts a posting naming the user's residence", () => {
    expect(judge("Remote - Mexico", "", "LATAM").verdict).toBe("explicit");
  });

  it("LATAM market rejects a posting limited to another LATAM country", () => {
    expect(judge("Remote - Argentina only", "", "LATAM").verdict).toBe("restricted");
  });

  it("EU market for a Spanish resident accepts 'remote within Europe'", () => {
    expect(judge("Remote", "This role is remote within Europe.", "EU", inSpain).verdict).toBe("explicit");
  });

  it("WORLDWIDE market does not accept on-site roles abroad", () => {
    expect(judge("Berlin, Germany", "Office-based role.", "WORLDWIDE").verdict).toBe("restricted");
  });

  it("WORLDWIDE market accepts global remote", () => {
    expect(judge("Remote", "Work from anywhere in the world.", "WORLDWIDE").verdict).toBe("global");
  });
});

describe("assessJobMarkets", () => {
  const drProfile: MarketProfile = {
    residenceCountry: "DO",
    citizenships: ["DO"],
    workAuthorizations: [],
    targetMarkets: ["DO", "LATAM", "WORLDWIDE", "US"],
    openToRelocate: false,
    acceptsContractor: true,
    preferredCurrency: "USD",
  };

  it("delegates DR markets to the DR classifier for DR residents", () => {
    const job = { title: "Engineer", location: "Remote - LATAM excluding DR", description: "" };
    const dr = isDrFriendly(job.location, job.description, job.title);
    const a = assessJobMarkets(job, drProfile);
    expect(a.markets.DO.reason).toBe(dr.reason);
    expect(a.markets.LATAM.verdict).toBe("restricted");
  });

  it("uses the generic engine for non-DR markets and aggregates eligibility", () => {
    const job = { title: "Engineer", location: "New York, NY (On-site)", description: "" };
    const a = assessJobMarkets(job, drProfile);
    expect(a.markets.US.verdict).toBe("explicit");
    expect(a.markets.DO.verdict).toBe("restricted");
    expect(a.eligible).toBe(true);
    expect(a.best.market).toBe("US");
  });
});

describe("resolveCountry", () => {
  it("resolves codes, local abbreviations and names", () => {
    expect(resolveCountry("RD")).toBe("DO");
    expect(resolveCountry("dominicana")).toBe("DO");
    expect(resolveCountry("USA")).toBe("US");
    expect(resolveCountry("Brasil")).toBe("BR");
    expect(resolveCountry("de")).toBe("DE");
    expect(resolveCountry("Narnia")).toBeNull();
  });
});
