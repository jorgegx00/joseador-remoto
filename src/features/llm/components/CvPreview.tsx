import { Fragment, useMemo, type ReactNode } from "react";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { parseMarkdownBlocks, type InlineRun, type MdBlock } from "@/lib/cv/markdown-blocks";

interface CvPreviewProps {
  content: string;
  className?: string;
}

function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((run, i) => {
        let node: ReactNode = run.text;
        if (run.italic) node = <em className="italic text-foreground/80">{node}</em>;
        if (run.bold) node = <strong className="font-semibold">{node}</strong>;
        if (run.href) {
          const href = run.href;
          node = (
            <a
              href={href}
              className="text-blue-600 dark:text-blue-400 underline"
              onClick={(e) => {
                // Open in the system browser instead of navigating the app webview.
                e.preventDefault();
                void shellOpen(href).catch(() => undefined);
              }}
            >
              {node}
            </a>
          );
        }
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}

function Block({ block }: { block: MdBlock }) {
  switch (block.type) {
    case "heading":
      if (block.level === 1) {
        return (
          <h1 className="text-xl font-bold mb-1 text-foreground">
            <Runs runs={block.runs} />
          </h1>
        );
      }
      if (block.level === 2) {
        return (
          <h2 className="text-lg font-bold mt-5 mb-2 text-foreground border-b border-border pb-1">
            <Runs runs={block.runs} />
          </h2>
        );
      }
      return (
        <h3 className="text-base font-semibold mt-4 mb-1 text-foreground">
          <Runs runs={block.runs} />
        </h3>
      );
    case "paragraph":
      return (
        <p className="text-sm leading-relaxed text-foreground/80 my-1">
          {block.lines.map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              <Runs runs={line} />
            </Fragment>
          ))}
        </p>
      );
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag className={cn("my-1 space-y-0.5", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, i) => (
            <li key={i} className={cn("text-sm leading-relaxed", item.level === 1 ? "ml-8" : "ml-4")}>
              <Runs runs={item.runs} />
            </li>
          ))}
        </ListTag>
      );
    }
    case "rule":
      return <hr className="my-4 border-border" />;
  }
}

/**
 * Renders markdown CV/letter content as a document-like preview. Built from the shared
 * block model (no HTML strings), so LLM or pasted-job text can never inject markup or
 * script links into the app webview.
 */
export function CvPreview({ content, className }: CvPreviewProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  return (
    <Card className={cn("bg-white dark:bg-zinc-950 shadow-md print:shadow-none print:border-none", className)}>
      <CardContent className="p-8 print:p-0">
        <div className="cv-preview font-sans max-w-none">
          {blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
