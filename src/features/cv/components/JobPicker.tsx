import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { ClipboardPaste } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getJobsBySource } from "@/services/database";
import { useJobStore } from "@/stores/jobStore";
import type { Job } from "@/types/job";

interface JobPickerProps {
  open: boolean;
  onSelect: (job: Job) => void;
  onOpenChange: (open: boolean) => void;
  /**
   * Renders a "Paste a job post" footer button. The picker closes itself before
   * calling it, so the caller only has to open its PasteJobDialog.
   */
  onPasteNew?: () => void;
}

const newestFirst = (a: Job, b: Job) => b.posted_at - a.posted_at;

export function JobPicker({ open, onSelect, onOpenChange, onPasteNew }: JobPickerProps) {
  const { t } = useTranslation("cv");
  const { t: tJobs } = useTranslation("jobs");
  const { t: tCommon } = useTranslation("common");
  const jobs = useJobStore((s) => s.jobs);
  const fetchJobs = useJobStore((s) => s.fetchJobs);
  const storeLoading = useJobStore((s) => s.isLoading);

  // Pasted jobs are loaded straight from the DB: the store list is filtered by the
  // Jobs-page filters and may not include them. Null until the first load finishes;
  // refreshed on every open.
  const [pastedFromDb, setPastedFromDb] = useState<Job[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (useJobStore.getState().jobs.length === 0) void fetchJobs();
    getJobsBySource("manual")
      .then((rows) => {
        if (!cancelled) setPastedFromDb(rows);
      })
      .catch((err) => {
        console.warn("[JobPicker] could not load pasted jobs:", err);
        if (!cancelled) setPastedFromDb((prev) => prev ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [open, fetchJobs]);

  const { pastedJobs, otherJobs, allJobs } = useMemo(() => {
    const byId = new Map<string, Job>();
    for (const job of pastedFromDb ?? []) byId.set(job.id, job);
    // The store copy wins when both exist (it may be fresher).
    for (const job of jobs) if (job.source === "manual") byId.set(job.id, job);
    const pasted = Array.from(byId.values()).sort(newestFirst);
    const others = jobs.filter((j) => j.source !== "manual").sort(newestFirst);
    return { pastedJobs: pasted, otherJobs: others, allJobs: [...pasted, ...others] };
  }, [jobs, pastedFromDb]);

  const isLoading = allJobs.length === 0 && (pastedFromDb === null || storeLoading);
  const showGroupHeadings = pastedJobs.length > 0 && otherJobs.length > 0;

  const handleSelect = (jobId: string) => {
    const job = allJobs.find((j) => j.id === jobId);
    if (job) {
      onSelect(job);
      onOpenChange(false);
    }
  };

  const handlePasteNew = () => {
    onOpenChange(false);
    onPasteNew?.();
  };

  const renderItem = (job: Job) => {
    const postedAgo = job.posted_at
      ? formatDistanceToNow(new Date(job.posted_at), {
          addSuffix: true,
        })
      : "";

    return (
      <CommandItem
        key={job.id}
        // The id keeps values unique when two jobs share title + company.
        value={`${job.title} ${job.company_name || job.company_id} ${job.id}`}
        onSelect={() => handleSelect(job.id)}
        className="flex items-center justify-between gap-2 py-2.5 cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{job.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground truncate">
              {job.company_name || job.company_id}
            </span>
            {postedAgo && (
              <span className="text-[10px] text-muted-foreground">{postedAgo}</span>
            )}
          </div>
        </div>
        {job.source === "manual" ? (
          <ClipboardPaste
            className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
            role="img"
            aria-label={tCommon("job_sources.manual")}
          />
        ) : (
          job.is_dr_friendly && (
            <Badge
              variant="outline"
              className="text-[10px] shrink-0 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
            >
              {tCommon("dr_friendly.dr_friendly")}
            </Badge>
          )
        )}
      </CommandItem>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-lg">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>{t("ats.select_job")}</DialogTitle>
          <DialogDescription>
            {t("ats.select_job_description")}
          </DialogDescription>
        </DialogHeader>
        <Command className="rounded-none border-none">
          <CommandInput placeholder={t("ats.search_jobs")} />
          <CommandList className="max-h-[350px]">
            <CommandEmpty>
              {isLoading
                ? tJobs("paste.picker.loading")
                : allJobs.length === 0
                  ? tJobs("paste.picker.empty")
                  : tCommon("empty.no_results")}
            </CommandEmpty>
            {pastedJobs.length > 0 && (
              <CommandGroup heading={tJobs("paste.picker.pasted_group")}>
                {pastedJobs.map(renderItem)}
              </CommandGroup>
            )}
            {otherJobs.length > 0 && (
              <CommandGroup
                heading={showGroupHeadings ? tJobs("paste.picker.all_group") : undefined}
              >
                {otherJobs.map(renderItem)}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        {onPasteNew && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              onClick={handlePasteNew}
            >
              <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
              {tJobs("paste.picker.paste_new")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
