import { create } from "zustand";
import {
  getAllApplications,
  getApplicationById,
  insertApplication,
  updateApplicationStatus,
  updateApplicationNotes,
  deleteApplication as dbDeleteApplication,
  getAllInterviews,
  getInterviewsByApplicationId,
  insertInterview,
  updateInterview as dbUpdateInterview,
  deleteInterview as dbDeleteInterview,
} from "@/services/database";
import { ulid } from "ulid";
import type { Application, ApplicationStatus, Interview } from "@/types";

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
  updateStatus: (appId: string, status: ApplicationStatus) => Promise<void>;
  addNote: (appId: string, note: string) => Promise<void>;
  scheduleInterview: (
    applicationId: string,
    interview: Omit<Interview, "id" | "created_at" | "updated_at">,
  ) => Promise<void>;
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
      };
      await insertApplication(app);
      await get().fetchApplications();
      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: String(err) });
    }
  },

  updateStatus: async (appId, status) => {
    try {
      await updateApplicationStatus(appId, status);
      set((state) => ({
        applications: state.applications.map((a) =>
          a.id === appId
            ? { ...a, status, applied_at: status === "applied" ? Date.now() : a.applied_at, updated_at: Date.now() }
            : a,
        ),
        selectedApplication:
          state.selectedApplication?.id === appId
            ? { ...state.selectedApplication, status, updated_at: Date.now() }
            : state.selectedApplication,
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
      const interview: Omit<Interview, "created_at" | "updated_at"> = {
        id: ulid(),
        application_id: applicationId,
        scheduled_at: interviewData.scheduled_at,
        duration_minutes: interviewData.duration_minutes,
        interview_type: interviewData.interview_type,
        location: interviewData.location,
        meeting_url: interviewData.meeting_url,
        interviewer_name: interviewData.interviewer_name,
        interviewer_role: interviewData.interviewer_role,
        notes: interviewData.notes,
        feedback: interviewData.feedback,
        outcome: interviewData.outcome,
        status: interviewData.status,
      };
      await insertInterview(interview);
      await get().fetchInterviews(applicationId);
      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: String(err) });
    }
  },

  updateInterview: async (id, data) => {
    try {
      await dbUpdateInterview(id, data);
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
