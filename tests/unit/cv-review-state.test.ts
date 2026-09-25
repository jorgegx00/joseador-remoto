import { describe, it, expect } from "vitest";
import {
  composeFinal,
  createReviewState,
  explainChange,
  historyInit,
  historyPush,
  historyRedo,
  historyUndo,
  reviewProgress,
  reviewReducer,
  rowFinalBody,
  rowFinalHeading,
  type ReviewAction,
  type ReviewRow,
  type ReviewState,
} from "@/lib/cv/review-state";

const ORIGINAL = `# Juan Perez

juan@example.com

## Skills

**Technical Skills:** JavaScript, React

## Experience

### Engineer at Acme

*2020 - Present*

- Built APIs

## Volunteer

Taught kids.
`;

const PROPOSED = `# Juan Perez

juan@example.com

## Professional Summary

Engineer focused on React and Kubernetes.

## Skills

**Technical Skills:** JavaScript, React, Kubernetes

## Experience

### Engineer at Acme

*2020 - Present*

- Built REST APIs in Node.js
`;

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const row = (s: ReviewState, id: string) => s.rows.find((r) => r.id === id)!;
const reduce = (s: ReviewState, a: ReviewAction) => reviewReducer(freeze(s), a, ORIGINAL);
const SUMMARY_ID = "p:professional summary#1";

describe("createReviewState", () => {
  const state = createReviewState(ORIGINAL, PROPOSED);

  it("marks equal rows unchanged and different rows ai", () => {
    expect(row(state, "o:h").status).toBe("unchanged");
    expect(row(state, "o:s2").status).toBe("unchanged"); // "## Experience" with empty body
    expect(row(state, "o:s1").status).toBe("ai");
    expect(row(state, "o:s2.1").status).toBe("ai");
    expect(row(state, SUMMARY_ID)).toMatchObject({ status: "ai", original: null });
    expect(row(state, "o:s3")).toMatchObject({ status: "ai", proposed: null });
    expect(state.rows.every((r) => !r.reviewed && r.edited === null)).toBe(true);
  });

  it("composes the AI version by default (dropped sections omitted)", () => {
    expect(composeFinal(state)).toBe(PROPOSED);
  });

  it("treats whitespace-only differences as unchanged", () => {
    const s = createReviewState(ORIGINAL, ORIGINAL.replace("- Built APIs", "-   Built   APIs"));
    expect(s.rows.every((r) => r.status === "unchanged")).toBe(true);
  });

  it("reports progress over changed rows", () => {
    expect(reviewProgress(state)).toEqual({ changed: 4, reviewed: 0 });
  });
});

describe("reviewReducer", () => {
  const initial = createReviewState(ORIGINAL, PROPOSED);

  it("keepOriginal / restoreAi switch the row and mark it reviewed", () => {
    const kept = reduce(initial, { type: "keepOriginal", id: "o:s1" });
    expect(row(kept, "o:s1")).toMatchObject({ status: "original", reviewed: true });
    expect(rowFinalBody(row(kept, "o:s1"))).toBe("**Technical Skills:** JavaScript, React");
    expect(row(initial, "o:s1").status).toBe("ai"); // input untouched

    const back = reduce(kept, { type: "restoreAi", id: "o:s1" });
    expect(row(back, "o:s1")).toMatchObject({ status: "ai", reviewed: true });
    expect(reviewProgress(back)).toEqual({ changed: 4, reviewed: 1 });
  });

  it("keepOriginal restores a section the AI dropped", () => {
    const s = reduce(initial, { type: "keepOriginal", id: "o:s3" });
    expect(composeFinal(s)).toContain("## Volunteer\n\nTaught kids.");
  });

  it("keepOriginal on an AI-added section removes it", () => {
    const s = reduce(initial, { type: "keepOriginal", id: SUMMARY_ID });
    expect(row(s, SUMMARY_ID).status).toBe("original");
    expect(rowFinalHeading(row(s, SUMMARY_ID))).toBeNull();
    expect(composeFinal(s)).not.toContain("Professional Summary");
  });

  it("edit sets edited text, collapsing to ai/original when equal", () => {
    const edited = reduce(initial, { type: "edit", id: "o:s2.1", text: "*2020 - Present*\n\n- Built APIs at scale" });
    expect(row(edited, "o:s2.1")).toMatchObject({
      status: "edited",
      edited: "*2020 - Present*\n\n- Built APIs at scale",
      reviewed: true,
    });
    expect(composeFinal(edited)).toContain("- Built APIs at scale");

    const same = reduce(initial, { type: "edit", id: "o:s2.1", text: "*2020 - Present*\n\n- Built REST APIs in Node.js  " });
    expect(row(same, "o:s2.1")).toMatchObject({ status: "ai", edited: null });

    const orig = reduce(initial, { type: "edit", id: "o:s2.1", text: "*2020 - Present*\n\n- Built APIs" });
    expect(row(orig, "o:s2.1")).toMatchObject({ status: "original", edited: null });
  });

  it("stashes an edit when switching away and restoreEdit brings it back", () => {
    let s = reduce(initial, { type: "edit", id: "o:s1", text: "**Technical Skills:** JS" });
    s = reduce(s, { type: "restoreAi", id: "o:s1" });
    expect(row(s, "o:s1")).toMatchObject({ status: "ai", stashedEdit: "**Technical Skills:** JS" });
    s = reduce(s, { type: "restoreEdit", id: "o:s1" });
    expect(row(s, "o:s1")).toMatchObject({ status: "edited", edited: "**Technical Skills:** JS", stashedEdit: null });
    // No stash → no-op, same reference.
    expect(reduce(s, { type: "restoreEdit", id: "o:s1" })).toBe(s);
  });

  it("markReviewed toggles the flag", () => {
    const s = reduce(initial, { type: "markReviewed", id: "o:s1" });
    expect(row(s, "o:s1").reviewed).toBe(true);
    const u = reduce(s, { type: "markReviewed", id: "o:s1", reviewed: false });
    expect(row(u, "o:s1").reviewed).toBe(false);
    expect(reduce(initial, { type: "markReviewed", id: "missing" })).toBe(initial);
  });

  it("revertAll yields the original CV; restoreAllAi yields the proposal", () => {
    const edited = reduce(initial, { type: "edit", id: "o:s1", text: "custom" });
    const reverted = reduce(edited, { type: "revertAll" });
    expect(composeFinal(reverted)).toBe(ORIGINAL);
    expect(row(reverted, "o:s1").stashedEdit).toBe("custom");

    const ai = reduce(reverted, { type: "restoreAllAi" });
    expect(composeFinal(ai)).toBe(PROPOSED);
    expect(row(ai, "o:h").status).toBe("unchanged");
  });

  it("mergeRefined keeps untouched rows and resets changed ones, stashing edits", () => {
    let s = reduce(initial, { type: "keepOriginal", id: "o:s1" });
    s = reduce(s, { type: "edit", id: "o:s2.1", text: "*2020 - Present*\n\n- My own wording" });
    s = reduce(s, { type: "markReviewed", id: SUMMARY_ID });
    const current = composeFinal(s);

    // The LLM only rewrote the Acme role.
    const draft = current.replace("- My own wording", "- Built REST APIs serving mobile apps");
    const merged = reduce(s, { type: "mergeRefined", draftMd: draft });

    expect(row(merged, "o:s1")).toBe(row(s, "o:s1")); // untouched → same object
    expect(row(merged, SUMMARY_ID)).toBe(row(s, SUMMARY_ID));
    expect(row(merged, "o:s2.1")).toMatchObject({
      status: "ai",
      proposed: "*2020 - Present*\n\n- Built REST APIs serving mobile apps",
      stashedEdit: "*2020 - Present*\n\n- My own wording",
      reviewed: false,
      edited: null,
    });
    // The dropped Volunteer section (absent from final and draft) is still there.
    expect(row(merged, "o:s3")).toMatchObject({ proposed: null, status: "ai" });
    expect(composeFinal(merged)).toBe(draft);
  });

  it("mergeRefined keeps rejected AI-only rows so they can be restored", () => {
    const s = reduce(initial, { type: "keepOriginal", id: SUMMARY_ID });
    const merged = reduce(s, { type: "mergeRefined", draftMd: composeFinal(s) });
    expect(row(merged, SUMMARY_ID)).toBeDefined();
    const restored = reduce(merged, { type: "restoreAi", id: SUMMARY_ID });
    expect(composeFinal(restored)).toContain("## Professional Summary");
    expect(merged.rows.findIndex((r) => r.id === SUMMARY_ID)).toBe(1);
  });

  it("applyFullMarkdown turns changed rows into edits and missing rows into removed", () => {
    const md = composeFinal(initial)
      .replace("Engineer focused on React and Kubernetes.", "Engineer focused on React.")
      .replace("## Skills", "## Core Skills")
      .replace(/## Experience[\s\S]*$/, "## Awards\n\nHackathon winner\n");
    const s = reduce(initial, { type: "applyFullMarkdown", md });

    expect(row(s, SUMMARY_ID)).toMatchObject({ status: "edited", edited: "Engineer focused on React.", reviewed: true });
    expect(row(s, "o:s1")).toMatchObject({ status: "edited", headingOverride: "## Core Skills" });
    expect(row(s, "o:s2").status).toBe("removed");
    expect(row(s, "o:s2.1").status).toBe("removed");
    expect(row(s, "o:h").status).toBe("unchanged");
    const awards = s.rows.find((r) => r.headingOverride === "## Awards")!;
    expect(awards).toMatchObject({ status: "edited", original: null, proposed: null, edited: "Hackathon winner" });
    expect(composeFinal(s)).toBe(md);
  });

  it("applyFullMarkdown with the current final is a no-op on statuses", () => {
    const s = reduce(initial, { type: "applyFullMarkdown", md: composeFinal(initial) });
    expect(s.rows.map((r) => [r.id, r.status])).toEqual(initial.rows.map((r) => [r.id, r.status]));
  });
});

describe("composeFinal", () => {
  it("keeps a section heading when its own row is dropped but children are kept", () => {
    const original = "## Projects\n\n### Alpha\n\nA\n";
    const proposed = "## Summary\n\nNew\n";
    let s = createReviewState(original, proposed);
    s = reviewReducer(s, { type: "keepOriginal", id: "o:s1.1" }, original);
    // Projects was the first original section, so it keeps the first position.
    expect(composeFinal(s)).toBe("## Projects\n\n### Alpha\n\nA\n\n## Summary\n\nNew\n");
  });

  it("cascades keepOriginal from a dropped section to its subsections", () => {
    const original = "## Projects\n\n### Alpha\n\nA\n";
    const proposed = "## Summary\n\nNew\n";
    const s = reviewReducer(createReviewState(original, proposed), { type: "keepOriginal", id: "o:s1" }, original);
    expect(composeFinal(s)).toContain("## Projects\n\n### Alpha\n\nA");
  });
});

describe("history", () => {
  it("pushes, undoes and redoes", () => {
    let h = historyInit(0);
    h = historyPush(h, 1);
    h = historyPush(h, 2);
    expect(h).toEqual({ past: [0, 1], present: 2, future: [] });
    h = historyUndo(h);
    expect(h).toEqual({ past: [0], present: 1, future: [2] });
    h = historyRedo(h);
    expect(h.present).toBe(2);
    h = historyUndo(historyUndo(h));
    expect(historyUndo(h)).toBe(h);
    h = historyPush(h, 9);
    expect(h.future).toEqual([]);
    expect(historyRedo(h)).toBe(h);
  });

  it("ignores pushes of the same state and caps the past", () => {
    const state = { n: 1 };
    const h = historyInit(state);
    expect(historyPush(h, state)).toBe(h);
    let capped = historyInit(0);
    for (let i = 1; i <= 60; i++) capped = historyPush(capped, i);
    expect(capped.past).toHaveLength(50);
    expect(capped.past[0]).toBe(10);
    let small = historyInit(0);
    for (let i = 1; i <= 5; i++) small = historyPush(small, i, 3);
    expect(small.past).toEqual([2, 3, 4]);
  });
});

describe("explainChange", () => {
  const keywords = ["Kubernetes", "React", "Node.js"];

  it("labels new and removed sections", () => {
    expect(explainChange(null, "Uses Kubernetes", keywords, false)).toEqual({
      reasons: ["new_section"],
      addedKeywords: ["Kubernetes"],
    });
    expect(explainChange("text", null, keywords, false)).toEqual({ reasons: ["removed"], addedKeywords: [] });
    expect(explainChange("same", " same ", keywords, false)).toEqual({ reasons: [], addedKeywords: [] });
  });

  it("detects keyword additions without calling pure insertions rewording", () => {
    const r = explainChange("JavaScript, React", "JavaScript, React, Kubernetes", keywords, false);
    expect(r.addedKeywords).toEqual(["Kubernetes"]);
    expect(r.reasons).toContain("keywords");
    expect(r.reasons).not.toContain("reworded");
  });

  it("detects reordering", () => {
    const r = explainChange("- Built APIs\n- Led team\n- Wrote docs", "- Led team\n- Built APIs\n- Wrote docs", keywords, false);
    expect(r.reasons).toEqual(["reordered"]);
  });

  it("detects rewording, shortening and expansion", () => {
    expect(
      explainChange("Responsible for building many internal tools for the whole company team", "Built internal tools", [], false)
        .reasons,
    ).toEqual(["reworded", "shortened"]);
    expect(explainChange("Built tools", "Built internal developer tools used by five product teams", [], false).reasons).toEqual([
      "expanded",
    ]);
  });

  it("reports translation instead of rewording", () => {
    const r = explainChange("Desarrollé APIs en Node.js", "Developed APIs in Node.js", keywords, true);
    expect(r.reasons).toEqual(["translated"]);
  });
});

describe("purity", () => {
  it("never mutates the input state", () => {
    const s = createReviewState(ORIGINAL, PROPOSED);
    const snapshot = JSON.stringify(s);
    const actions: ReviewAction[] = [
      { type: "keepOriginal", id: "o:s1" },
      { type: "restoreAi", id: "o:s3" },
      { type: "edit", id: "o:s2.1", text: "x" },
      { type: "revertAll" },
      { type: "restoreAllAi" },
      { type: "mergeRefined", draftMd: PROPOSED.replace("Kubernetes", "Docker") },
      { type: "applyFullMarkdown", md: ORIGINAL },
    ];
    for (const a of actions) reviewReducer(s, a, ORIGINAL);
    expect(JSON.stringify(s)).toBe(snapshot);
    const rows: ReviewRow[] = s.rows;
    expect(rows.length).toBeGreaterThan(0);
  });
});
