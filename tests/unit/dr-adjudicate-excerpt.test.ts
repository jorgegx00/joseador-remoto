import { describe, it, expect, vi } from "vitest";

vi.mock("@/services/database", () => ({ getAllJobs: vi.fn(), upsertJob: vi.fn() }));
vi.mock("@/services/llm", () => ({ getConfig: vi.fn() }));
vi.mock("@/lib/llm", () => ({ LlmService: vi.fn() }));
vi.mock("@/stores/settingsStore", () => ({ useSettingsStore: { getState: () => ({ llm: {} }) } }));

import { buildDescriptionForAdjudication } from "../../src/services/dr-adjudicate";

describe("buildDescriptionForAdjudication", () => {
  it("returns short descriptions unchanged", () => {
    expect(buildDescriptionForAdjudication("Remote role.")).toBe("Remote role.");
  });

  it("appends location sentences that sit beyond the description head", () => {
    const filler = "We build great software with modern tools. ".repeat(40);
    const desc = `${filler}\nYou love TypeScript.\n-> Team in Greece <-\nThis is a remote role based in Greece.`;
    const out = buildDescriptionForAdjudication(desc);
    expect(out).toContain("Team in Greece");
    expect(out).toContain("remote role based in Greece");
    expect(out).not.toContain("You love TypeScript");
  });
});
