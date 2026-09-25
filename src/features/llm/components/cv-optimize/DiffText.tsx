import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { diffWords, type DiffOp } from "@/lib/cv/word-diff";

interface DiffTextProps {
  original: string;
  proposed: string;
  side: "original" | "proposed";
  className?: string;
}

/**
 * One side of a word-level diff. The original side shows deletions struck through in
 * red; the proposed side shows insertions highlighted in green. Plain text only.
 */
export function DiffText({ original, proposed, side, className }: DiffTextProps) {
  const ops: DiffOp[] = useMemo(() => diffWords(original, proposed), [original, proposed]);
  return (
    <p className={cn("whitespace-pre-wrap break-words text-sm leading-relaxed", className)}>
      {ops.map((op, i) => {
        if (op.op === "equal") return <span key={i}>{op.text}</span>;
        if (side === "original" && op.op === "delete") {
          return (
            <del
              key={i}
              className="bg-red-100 text-red-800 line-through decoration-red-500/70 dark:bg-red-950/50 dark:text-red-300"
            >
              {op.text}
            </del>
          );
        }
        if (side === "proposed" && op.op === "insert") {
          return (
            <ins
              key={i}
              className="bg-emerald-100 text-emerald-900 no-underline dark:bg-emerald-950/50 dark:text-emerald-200"
            >
              {op.text}
            </ins>
          );
        }
        return null;
      })}
    </p>
  );
}

/** Plain text with the given terms highlighted (used when a word diff is meaningless, e.g. translation). */
export function HighlightedText({
  text,
  terms,
  className,
}: {
  text: string;
  terms: string[];
  className?: string;
}) {
  const parts = useMemo(() => {
    const cleaned = terms.map((t) => t.trim()).filter((t) => t.length > 1);
    if (cleaned.length === 0) return [{ text, hit: false }];
    const escaped = cleaned
      .sort((a, b) => b.length - a.length)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(${escaped.join("|")})`, "gi");
    const out: Array<{ text: string; hit: boolean }> = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false });
      out.push({ text: m[0], hit: true });
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    if (last < text.length) out.push({ text: text.slice(last), hit: false });
    return out;
  }, [text, terms]);

  return (
    <p className={cn("whitespace-pre-wrap break-words text-sm leading-relaxed", className)}>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-sm bg-emerald-100 px-0.5 text-inherit dark:bg-emerald-950/60">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}
