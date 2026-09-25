import { useCallback, useEffect, useMemo, useState } from "react";
import { useApplicationStore } from "@/stores/applicationStore";
import { getAllApplicationEvents, getJobById } from "@/services/database";
import {
  computeAllActions,
  groupActions,
  type ActionBucket,
  type PipelineAction,
} from "@/lib/applications/follow-up-rules";
import type { Application, ApplicationEvent, Interview } from "@/types";

export interface ActionItem extends PipelineAction {
  application: Application;
  interview: Interview | null;
  jobTitle: string;
  companyName: string;
}

/**
 * Suggested next steps across all applications (follow-ups, thank-yous, prep,
 * take-home deadlines, possible ghosting), grouped for the dashboard.
 * Reads applications/interviews from the store; the caller is expected to have
 * fetched them (useDashboard does).
 */
export function usePipelineActions() {
  const { applications, interviews } = useApplicationStore();
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [labels, setLabels] = useState<Record<string, { jobTitle: string; companyName: string }>>({});

  const reloadEvents = useCallback(async () => {
    try {
      setEvents(await getAllApplicationEvents());
    } catch (err) {
      console.warn("[dashboard] could not load application events:", err);
    }
  }, []);

  useEffect(() => {
    void reloadEvents();
  }, [reloadEvents, applications]);

  const actions = useMemo(
    () => computeAllActions(applications, interviews, events, Date.now()),
    [applications, interviews, events],
  );

  // Resolve job/company names only for applications that have something to do.
  useEffect(() => {
    const missing = [...new Set(actions.map((a) => a.application_id))].filter((id) => !labels[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const next: typeof labels = {};
      for (const id of missing) {
        // Always record an entry (even empty) so a failed lookup is not retried in a loop.
        const app = applications.find((a) => a.id === id);
        const job = app ? await getJobById(app.job_id).catch(() => null) : null;
        next[id] = { jobTitle: job?.title ?? "", companyName: job?.company_name ?? "" };
      }
      if (!cancelled) setLabels((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [actions, applications, labels]);

  const groups = useMemo(() => {
    const grouped = groupActions(actions, Date.now());
    const enrich = (a: PipelineAction): ActionItem | null => {
      const application = applications.find((x) => x.id === a.application_id);
      if (!application) return null;
      return {
        ...a,
        application,
        interview: a.interview_id ? (interviews.find((i) => i.id === a.interview_id) ?? null) : null,
        jobTitle: labels[a.application_id]?.jobTitle ?? "",
        companyName: labels[a.application_id]?.companyName ?? "",
      };
    };
    const out = {} as Record<ActionBucket, ActionItem[]>;
    for (const key of Object.keys(grouped) as ActionBucket[]) {
      out[key] = grouped[key].map(enrich).filter((x): x is ActionItem => x !== null);
    }
    return out;
  }, [actions, applications, interviews, labels]);

  const total = groups.attention.length + groups.today.length + groups.week.length;

  return { groups, total, reloadEvents };
}
