import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, Loader2, FileText, FileType, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportCvToFile, exportMarkdownToFile } from "@/services/file-export";
import type { CvExportFormat, CvExportMeta } from "@/lib/cv/export/types";
import type { CvRecord } from "@/types";

type CvExportMenuProps = {
  disabled?: boolean;
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "default";
  label?: string;
} & (
  | { cv: CvRecord; markdown?: never; fileName?: never; meta?: never }
  | { cv?: never; markdown: string; fileName: string; meta: CvExportMeta }
);

const FORMATS: Array<{ format: CvExportFormat; icon: typeof FileText }> = [
  { format: "pdf", icon: FileText },
  { format: "docx", icon: FileType },
  { format: "md", icon: FileCode },
];

/** "Export ▾" → PDF / Word / Markdown, each through the native Save As dialog. */
export function CvExportMenu(props: CvExportMenuProps) {
  const { t } = useTranslation("common");
  const [busy, setBusy] = useState(false);

  const run = async (format: CvExportFormat) => {
    setBusy(true);
    try {
      const path = props.cv
        ? await exportCvToFile(props.cv, format)
        : await exportMarkdownToFile(props.markdown!, format, { fileName: props.fileName!, meta: props.meta! });
      if (path) toast.success(t("export.saved_to", { path }));
      else toast.info(t("export.cancelled"));
    } catch (err) {
      console.error("[CvExportMenu] export failed:", err);
      toast.error(t("export.failed", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size={props.size ?? "sm"}
          variant={props.variant ?? "outline"}
          disabled={props.disabled || busy}
          className={props.size === "default" ? undefined : "h-8"}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
          {busy ? t("export.exporting") : props.label ?? t("export.button")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {FORMATS.map(({ format, icon: Icon }) => (
          <DropdownMenuItem key={format} onSelect={() => void run(format)}>
            <Icon className="h-4 w-4 mr-2" />
            {t(`export.${format}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
