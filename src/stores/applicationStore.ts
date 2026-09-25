import { create } from "zustand";
import {
  getAllApplications,
  getApplicationById,
  insertApplication,
  updateApplicationStatus,
  updateApplicationNotes,
  updateApplicationFields,
  insertApplicationEvent,
  deleteApplication as dbDeleteApplication,
  getAllInterviews,
  getInterviewsByApplicationId,
  getInterviewById,
  insertInterview,
  updateInterview as dbUpdateInterview,
  deleteInterview as dbDeleteInterview,
} from "@/services/database";
import { ulid } from "ulid";
import { isForwardMove, statusAfterScheduling } from "@/lib/applications/status-rules";
import { DAY_MS } from "@/lib/applications/follow-up-rules";
import { scheduleInterviewReminder } from "@/lib/notifications";
import type {
  Application,
  ApplicationEvent,
  ApplicationStatus,
  ClosedReason,
  Interview,
  MessageKind,
} from "@/types";

async function logEvent(
  applicationId: string,
  event: Pick<ApplicationEvent, "type"> & Partial<Pick<ApplicationEvent, "from_status" | "to_status" | "payload">>,
): Promise<void> {
  try {
    await insertApplicationEvent({
      id: ulid(),
      application_id: applicationId,
      type: event.type,
      from_status: event.from_status ?? null,
      to_status: event.to_status ?? null,
      payload: event.payload ?? {},
      created_at: Date.now(),
    });
  } catch (err) {
    // History is best-effort: never block the user action on it.
    console.warn("[applications] event log failed:", err);
  }
}

export interface ScheduleResult {
  interview: Interview;
  /** Status the application was advanced to, or null when it stayed put. */
  advancedTo: ApplicationStatus | null;
}

interface ApplicationState {
  applications: Application[];
  selectedApplication: Application | null;
  interviews: Interview[];
  isLoading: boolean;
  error: string | null;

  setApplications: (apps: Application[]) => void;
  selectApplication: (app: Application | null) => void;
  setInterviews: (interviews: Interview[]) => void;
  fetchApplications: () => Promise<void>;
  fetchInterviews: (applicationId?: string) => Promise<void>;
  createApplication: (jobId: string, cvId: string, generatedCvId?: string) => Promise<void>;
  updateStatus: (appId: string, status: ApplicationStatus, closedReason?: ClosedReason) => Promise<void>;
  addNote: (appId: string, note: string) => Promise<void>;
  scheduleInterview: (
    applicationId: string,
    interview: Omit<Interview, "id" | "created_at" | "updated_at">,
  ) => Promise<ScheduleResult | null>;
  logMessageSent: (appId: string, kind: MessageKind, interviewId?: string) => Promise<void>;
  snooze: (appId: string, days: number) => Promise<void>;
  markHeardBack: (appId: string) => Promise<void>;
  updateInterview: (id: string, data: Partial<Interview>) => Promise<void>;
  deleteInterview: (id: string) => Promise<void>;
  deleteApplication: (appId: string) => Promise<void>;
  getApplicationsByStatus: (status: ApplicationStatus) => Application[];
  getUpcomingInterviews: () => Interview[];
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useApplicationStore = create<ApplicationState>((set, get) => ({
  applications: [],
  selectedApplication: null,
  interviews: [],
  isLoading: false,
  error: null,

  setApplications: (applications) => set({ applications }),
  selectApplication: (app) => set({ selectedApplication: app }),
  setInterviews: (interviews) => set({ interviews }),

  fetchApplications: async () => {
    set({ isLoading: true, error: null });
    try {
      const applications = await getAllApplications();
      set({ applications, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: String(err) });
    }
  },

  fetchInterviews: async (applicationId) => {
    set({ isLoading: true, error: null });
    try {
      const interviews = applicationId
        ? await getInterviewsByApplicationId(applicationId)
        : await getAllInterviews();
      set({ interviews, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: String(err) });
    }
  },

  createApplication: async (jobId, cvId, generatedCvId) => {
    set({ isLoading: true, error: null });
    try {
      const app: Omit<Application, "created_at" | "updated_at"> = {
        id: ulid(),
        job_id: jobId,
        cv_id: cvId,
        generated_cv_id: generatedCvId ?? null,
        status: "saved",
        applied_at: null,
        notes: "",
        last_contact_at: null,
        snoozed_until: null,
        closed_reason: null,
      };
      await insertApplication(app);
      await get().fetchApplications();
      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: String(err) });
    }
  },

  updateStatus: async (appId, status, closedReason) => {
    try {
      const current = get().applications.find((a) => a.id === appId) ?? (await getApplicationById(appId));
      const from = current?.status ?? null;
      const reason: ClosedReason | null =
        status === "rejected" ? (closedReason ?? "rejected") : status === "withdrawn" ? "withdrew" : null;
      if (from === status && reason === (current?.closed_reason ?? null)) return;

      const now = Date.now();
      await updateApplicationStatus(appId, status);
      // Moving past "applied" means the company answered; closing records why.
      const heardBack = from !== null && from !== "saved" && isForwardMove(from, status);
      const fields: Partial<Application> = { closed_reason: reason };
      if (heardBack) fields.last_contact_at = now;
      await updateApplicationFields(appId, fields);
      await logEvent(appId, {
        type: "status_change",
        from_status: from,
        to_status: status,
        payload: reason ? { closed_reason: reason } : {},
      });

      const patch = (a: Application): Application => ({
        ...a,
        ...fields,
        status,
        applied_at: status === "applied" ? (a.applied_at ?? now) : a.applied_at,
        updated_at: now,
      });
      set((state) => ({
        applications: state.applications.map((a) => (a.id === appId ? patch(a) : a)),
        selectedApplication:
          state.selectedApplication?.id === appId ? patch(state.selectedApplication) : state.selectedApplication,
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  addNote: async (appId, note) => {
    try {
      const existing = await getApplicationById(appId);
      const combinedNotes = existing?.notes
        ? `${existing.notes}\n---\n${note}`
        : note;
      await updateApplicationNotes(appId, combinedNotes);
      await logEvent(appId, { type: "note" });
      set((state) => ({
        applications: state.applications.map((a) =>
          a.id === appId ? { ...a, notes: combinedNotes, updated_at: Date.now() } : a,
        ),
        selectedApplication:
          state.selectedApplication?.id === appId
            ? { ...state.selectedApplication, notes: combinedNotes, updated_at: Date.now() }
            : state.selectedApplication,
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  scheduleInterview: async (applicationId, interviewData) => {
    set({ isLoading: true, error: null });
    try {
      const now = Date.now();
      const interview: Interview = {
        id: ulid(),
        application_id: applicationId,
        scheduled_at: interviewData.scheduled_at,
        duration_minutes: interviewData.duration_minutes,
        interview_type: interviewData.interview_type,
        location: interviewData.location,
        meeting_url: interviewData.meeting_url,
        interviewer_name: interviewData.interviewer_name,
        interviewer_role: interviewData.interviewer_role,
        interviewer_timezone: interviewData.interviewer_timezone,
        notes: interviewData.notes,
        feedback: interviewData.feedback,
        outcome: interviewData.outcome,
        status: interviewData.status,
        created_at: now,
        updated_at: now,
      };
      await insertInterview(interview);
      scheduleInterviewReminder(interview);
      await logEvent(applicationId, {
        type: "interview_scheduled",
        payload: { interview_id: interview.id, interview_type: interview.interview_type },
      });

      // Being invited to a round is contact; it may also move the card forward.
      const app = get().applications.find((a) => a.id === applicationId) ?? (await getApplicationById(applicationId));
      const advancedTo = app ? statusAfterScheduling(app.status, interview.interview_type) : null;
      if (advancedTo) await get().updateStatus(applicationId, advancedTo);
      await updateApplicationFields(applicationId, { last_contact_at: now, snoozed_until: null });
      set((state) => ({
        applications: state.applications.map((a) =>
          a.id === applicationId ? { ...a, last_contact_at: now, snoozed_until: null } : a,
        ),
      }));

      // Append rather than refetch: fetchInterviews(appId) would drop other applications'
      // interviews from the shared list the kanban board and calendar rely on.
      set((state) => ({
        interviews: [...state.interviews.filter((i) => i.id !== interview.id), interview].sort(
          (x, y) => x.scheduled_at - y.scheduled_at,
        ),
        isLoading: false,
      }));
      return { interview, advancedTo };
    } catch (err) {
      set({ isLoading: false, error: String(err) });
      return null;
    }
  },

  logMessageSent: async (appId, kind, interviewId) => {
    await logEvent(appId, {
      type: "message_sent",
      payload: { message_kind: kind, ...(interviewId ? { interview_id: interviewId } : {}) },
    });
  },

  snooze: async (appId, days) => {
    const until = Date.now() + days * DAY_MS;
    try {
      await updateApplicationFields(appId, { snoozed_until: until });
      set((state) => ({
        applications: state.applications.map((a) => (a.id === appId ? { ...a, snoozed_until: until } : a)),
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  markHeardBack: async (appId) => {
    const now = Date.now();
    try {
      await updateApplicationFields(appId, { last_contact_at: now, snoozed_until: null });
      set((state) => ({
        applications: state.applications.map((a) =>
          a.id === appId ? { ...a, last_contact_at: now, snoozed_until: null } : a,
        ),
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  updateInterview: async (id, data) => {
    try {
      // Only completion is logged; skip the lookup for frequent edits (feedback typing).
      const before =
        data.status === "completed"
          ? (get().interviews.find((i) => i.id === id) ?? (await getInterviewById(id)))
          : null;
      await dbUpdateInterview(id, data);
      if (before && data.status === "completed" && before.status !== "completed") {
        await logEvent(before.application_id, {
          type: "interview_completed",
          payload: { interview_id: id, interview_type: before.interview_type },
        });
      }
      set((state) => ({
        interviews: state.interviews.map((i) =>
          i.id === id ? { ...i, ...data, updated_at: Date.now() } : i,
        ),
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  deleteInterview: async (id) => {
    try {
      await dbDeleteInterview(id);
      set((state) => ({
        interviews: state.interviews.filter((i) => i.id !== id),
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  deleteApplication: async (appId) => {
    try {
      await dbDeleteApplication(appId);
      set((state) => ({
        applications: state.applications.filter((a) => a.id !== appId),
        selectedApplication:
          state.selectedApplication?.id === appId ? null : state.selectedApplication,
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  getApplicationsByStatus: (status) => {
    return get().applications.filter((a) => a.status === status);
  },

  getUpcomingInterviews: () => {
    const now = Date.now();
    return get()
      .interviews.filter(
        (i) => i.scheduled_at > now && i.status === "scheduled",
      )
      .sort((a, b) => a.scheduled_at - b.scheduled_at);
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
