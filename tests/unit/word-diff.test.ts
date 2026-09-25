import { describe, it, expect } from "vitest";
import { diffWords, tokenizeWords, MAX_DIFF_CELLS, type DiffOp } from "@/lib/cv/word-diff";

function sideA(ops: DiffOp[]): string {
  return ops.filter((o) => o.op !== "insert").map((o) => o.text).join("");
}
function sideB(ops: DiffOp[]): string {
  return ops.filter((o) => o.op !== "delete").map((o) => o.text).join("");
}

describe("tokenizeWords", () => {
  it("round-trips the input", () => {
    const text = "Built APIs in Node.js, C++ and C# (CI/CD) — don't stop! 1,000 users.";
    expect(tokenizeWords(text).join("")).toBe(text);
  });

  it("keeps tech tokens whole", () => {
    const tokens = tokenizeWords("Node.js C++ C# .NET CI/CD don't full-stack 1,000 3.5");
    for (const t of ["Node.js", "C++", "C#", ".NET", "CI/CD", "don't", "full-stack", "1,000", "3.5"]) {
      expect(tokens).toContain(t);
    }
  });

  it("splits punctuation and whitespace into their own tokens", () => {
    expect(tokenizeWords("Hello, world.")).toEqual(["Hello", ",", " ", "world", "."]);
    expect(tokenizeWords("a  \n b")).toEqual(["a", "  \n ", "b"]);
  });

  it("returns [] for empty input", () => {
    expect(tokenizeWords("")).toEqual([]);
  });
});

describe("diffWords", () => {
  const cases: Array<[string, string]> = [
    ["", ""],
    ["", "new text"],
    ["old text", ""],
    ["same", "same"],
    ["Built APIs with Node.js", "Built scalable APIs with Node.js and TypeScript"],
    ["Reduced latency by 40%.", "Cut latency by 40%, improving UX."],
    ["foo bar", "baz qux"],
    ["- Led team\n- Shipped v2", "- Shipped v2\n- Led a team of 5"],
    ["Desarrollé APIs en Node.js", "Developed APIs in Node.js"],
  ];

  it.each(cases)("keeps the a/b invariants for %j → %j", (a, b) => {
    const ops = diffWords(a, b);
    expect(sideA(ops)).toBe(a);
    expect(sideB(ops)).toBe(b);
    for (const op of ops) expect(op.text.length).toBeGreaterThan(0);
    for (let i = 1; i < ops.length; i++) expect(ops[i].op === ops[i - 1].op).toBe(false);
  });

  it("returns a single equal op for identical input and [] for two empty strings", () => {
    expect(diffWords("abc def", "abc def")).toEqual([{ op: "equal", text: "abc def" }]);
    expect(diffWords("", "")).toEqual([]);
  });

  it("marks inserted words", () => {
    const ops = diffWords("Built APIs", "Built REST APIs");
    expect(ops).toEqual([
      { op: "equal", text: "Built " },
      { op: "insert", text: "REST " },
      { op: "equal", text: "APIs" },
    ]);
  });

  it("treats Node.js as one token", () => {
    const ops = diffWords("Used Node.js daily", "Used Deno.js daily");
    expect(ops).toContainEqual({ op: "delete", text: "Node.js" });
    expect(ops).toContainEqual({ op: "insert", text: "Deno.js" });
  });

  it("diffs punctuation separately from words", () => {
    const ops = diffWords("Reduced latency.", "Reduced latency!");
    expect(ops).toEqual([
      { op: "equal", text: "Reduced latency" },
      { op: "delete", text: "." },
      { op: "insert", text: "!" },
    ]);
  });

  it("folds lone whitespace between replacements into one change", () => {
    expect(diffWords("foo bar", "baz qux")).toEqual([
      { op: "delete", text: "foo bar" },
      { op: "insert", text: "baz qux" },
    ]);
  });

  it("falls back to delete-all + insert-all above the size cap", () => {
    const n = Math.ceil(Math.sqrt(MAX_DIFF_CELLS)) + 10;
    const a = Array.from({ length: n }, (_, i) => `a${i}`).join(" ");
    const b = Array.from({ length: n }, (_, i) => `b${i}`).join(" ");
    const ops = diffWords(a, b);
    expect(ops).toEqual([
      { op: "delete", text: a },
      { op: "insert", text: b },
    ]);
  });
});
