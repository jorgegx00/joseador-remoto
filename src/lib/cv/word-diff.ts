/**
 * Word-level diff for the CV review screen (original vs optimized text per row).
 *
 * Tokens are words (tech-aware: "Node.js", "C++", "C#", ".NET", "CI/CD", "don't", "1,000"),
 * whitespace runs and single punctuation characters. The diff is a plain LCS over tokens —
 * CV sections are small, and the cell cap below keeps the worst case bounded.
 */

export type DiffOp = { op: "equal" | "insert" | "delete"; text: string };

/** Above this many DP cells (tokensA × tokensB) the diff degrades to delete-all + insert-all. */
export const MAX_DIFF_CELLS = 400_000;

// word | whitespace run | any other single character (punctuation, symbols, emoji)
const TOKEN_RE =
  /(?:(?<![\p{L}\p{N}_.])\.)?[\p{L}\p{N}_]+(?:[./\-'’][\p{L}\p{N}_]+|(?<=\p{N}),\p{N}+)*[+#]*|\s+|[^\s]/gu;

/** Splits text into word, whitespace and punctuation tokens. `tokens.join("") === text`. */
export function tokenizeWords(text: string): string[] {
  if (!text) return [];
  return text.match(TOKEN_RE) ?? [];
}

/**
 * Word diff of `a` → `b`. Invariants: concatenating equal+delete texts yields `a`;
 * equal+insert yields `b`. Adjacent ops of the same type are merged, empty ops dropped,
 * and within a changed run deletions come before insertions.
 */
export function diffWords(a: string, b: string): DiffOp[] {
  if (a === b) return a ? [{ op: "equal", text: a }] : [];
  const ta = tokenizeWords(a);
  const tb = tokenizeWords(b);

  // Common prefix / suffix never need the DP table.
  let start = 0;
  while (start < ta.length && start < tb.length && ta[start] === tb[start]) start++;
  let endA = ta.length;
  let endB = tb.length;
  while (endA > start && endB > start && ta[endA - 1] === tb[endB - 1]) {
    endA--;
    endB--;
  }

  const ops: DiffOp[] = [];
  if (start > 0) ops.push({ op: "equal", text: ta.slice(0, start).join("") });

  const midA = ta.slice(start, endA);
  const midB = tb.slice(start, endB);
  if (midA.length * midB.length > MAX_DIFF_CELLS) {
    ops.push({ op: "delete", text: midA.join("") });
    ops.push({ op: "insert", text: midB.join("") });
  } else {
    lcsDiff(midA, midB, ops);
  }

  if (endA < ta.length) ops.push({ op: "equal", text: ta.slice(endA).join("") });
  return absorbWeakEquals(mergeOps(ops));
}

function lcsDiff(a: string[], b: string[], out: DiffOp[]): void {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) {
    if (n) out.push({ op: "delete", text: a.join("") });
    if (m) out.push({ op: "insert", text: b.join("") });
    return;
  }
  const w = m + 1;
  // dp[i*w + j] = LCS length of a[i:] and b[j:]
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] =
        a[i] === b[j]
          ? dp[(i + 1) * w + j + 1] + 1
          : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "equal", text: a[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      out.push({ op: "delete", text: a[i] });
      i++;
    } else {
      out.push({ op: "insert", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ op: "delete", text: a[i++] });
  while (j < m) out.push({ op: "insert", text: b[j++] });
}

/** Merges adjacent same-type ops; inside a changed run emits one delete then one insert. */
function mergeOps(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = [];
  let del = "";
  let ins = "";
  const flush = () => {
    if (del) out.push({ op: "delete", text: del });
    if (ins) out.push({ op: "insert", text: ins });
    del = "";
    ins = "";
  };
  for (const op of ops) {
    if (!op.text) continue;
    if (op.op === "delete") del += op.text;
    else if (op.op === "insert") ins += op.text;
    else {
      flush();
      const prev = out[out.length - 1];
      if (prev && prev.op === "equal") prev.text += op.text;
      else out.push({ op: "equal", text: op.text });
    }
  }
  flush();
  return out;
}

/**
 * A lone whitespace run matched between two changes ("foo bar" → "baz qux") fragments the
 * diff into noise. Fold such runs into the surrounding change: the whitespace is added to
 * both the deleted and the inserted text, so the a/b invariants still hold.
 */
function absorbWeakEquals(ops: DiffOp[]): DiffOp[] {
  if (ops.length < 3) return ops;
  const out: DiffOp[] = [];
  let del = "";
  let ins = "";
  let inRun = false;
  const flush = () => {
    if (del) out.push({ op: "delete", text: del });
    if (ins) out.push({ op: "insert", text: ins });
    del = "";
    ins = "";
    inRun = false;
  };
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.op === "delete") {
      del += op.text;
      inRun = true;
      continue;
    }
    if (op.op === "insert") {
      ins += op.text;
      inRun = true;
      continue;
    }
    const next = ops[i + 1];
    // Only fold into replacements (run has both sides); pure insertions stay readable as-is.
    if (inRun && del && ins && next && next.op !== "equal" && /^\s+$/.test(op.text)) {
      del += op.text;
      ins += op.text;
      continue;
    }
    flush();
    out.push({ op: "equal", text: op.text });
  }
  flush();
  return out;
}
