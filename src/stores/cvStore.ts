import { create } from "zustand";
import { cvService } from "@/services/cv";
import { CvInUseError } from "@/services/database";
import { pickDefaultCv } from "@/lib/cv/cv-document";
import type { CvRecord, AtsReport, ParsedCv } from "@/types";

interface CvState {
  cvs: CvRecord[];
  selectedCv: CvRecord | null;
  activeCv: CvRecord | null;
  currentAtsReport: AtsReport | null;
  isLoading: boolean;
  isUploading: boolean;
  isParsing: boolean;
  error: string | null;

  setCvs: (cvs: CvRecord[]) => void;
  selectCv: (cv: CvRecord | null) => void;
  setActiveCv: (cv: CvRecord | null) => void;
  setCurrentAtsReport: (report: AtsReport | null) => void;
  hydrate: () => Promise<void>;
  fetchCvs: () => Promise<void>;
  uploadCv: () => Promise<string | null>;
  parseCv: (cvId: string) => Promise<void>;
  updateCvData: (id: string, data: ParsedCv) => Promise<void>;
  setPrimary: (cvId: string) => Promise<void>;
  deleteCv: (cvId: string) => Promise<void>;
  duplicateCv: (id: string, name: string) => Promise<string | null>;
  /** Optimistic rename; rolls back and rethrows on failure. */
  renameCv: (id: string, name: string) => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useCvStore = create<CvState>((set, get) => ({
  cvs: [],
  selectedCv: null,
  activeCv: null,
  currentAtsReport: null,
  isLoading: false,
  isUploading: false,
  isParsing: false,
  error: null,

  setCvs: (cvs) => set({ cvs }),
  selectCv: (cv) => set({ selectedCv: cv }),
  setActiveCv: (cv) => set({ activeCv: cv }),
  setCurrentAtsReport: (report) => set({ currentAtsReport: report }),

  hydrate: async () => {
    try {
      const cvs = await cvService.getCvs();
      // Not simply cvs[0]: a freshly saved tailored CV is the newest row but shouldn't
      // silently become the CV used for match scores everywhere.
      set({ cvs, activeCv: pickDefaultCv(cvs) });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  fetchCvs: async () => {
    set({ isLoading: true, error: null });
    try {
      const cvs = await cvService.getCvs();
      set({ cvs, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: String(err) });
    }
  },

  uploadCv: async () => {
    set({ isUploading: true, error: null });
    try {
      const cvId = await cvService.uploadCv();
      // Re-fetch the list to include the new CV
      await get().fetchCvs();
      // Select the newly uploaded CV
      const newCv = await cvService.getCv(cvId);
      if (newCv) {
        set({ selectedCv: newCv, activeCv: newCv });
      }
      set({ isUploading: false });
      return cvId;
    } catch (err) {
      set({ isUploading: false, error: String(err) });
      return null;
    }
  },

  parseCv: async (cvId) => {
    set({ isParsing: true, error: null });
    try {
      await cvService.parseCv(cvId);
      // Re-fetch to get updated parsed data
      const updatedCv = await cvService.getCv(cvId);
      if (updatedCv) {
        set((state) => ({
          cvs: state.cvs.map((cv) => (cv.id === cvId ? updatedCv : cv)),
          selectedCv: state.selectedCv?.id === cvId ? updatedCv : state.selectedCv,
          activeCv: state.activeCv?.id === cvId ? updatedCv : state.activeCv,
        }));
      }
      set({ isParsing: false });
    } catch (err) {
      set({ isParsing: false, error: String(err) });
    }
  },

  updateCvData: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      await cvService.updateCvData(id, data);
      const updatedCv = await cvService.getCv(id);
      if (updatedCv) {
        set((state) => ({
          cvs: state.cvs.map((cv) => (cv.id === id ? updatedCv : cv)),
          selectedCv: state.selectedCv?.id === id ? updatedCv : state.selectedCv,
          activeCv: state.activeCv?.id === id ? updatedCv : state.activeCv,
        }));
      }
      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: String(err) });
    }
  },

  setPrimary: async (cvId) => {
    try {
      await cvService.setPrimaryCv(cvId);
      // Re-fetch all CVs to reflect the change
      await get().fetchCvs();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  deleteCv: async (cvId) => {
    try {
      await cvService.deleteCv(cvId);
      set((state) => ({
        cvs: state.cvs.filter((cv) => cv.id !== cvId),
        selectedCv: state.selectedCv?.id === cvId ? null : state.selectedCv,
        activeCv: state.activeCv?.id === cvId ? null : state.activeCv,
      }));
    } catch (err) {
      set({ error: err instanceof CvInUseError ? err.message : String(err) });
    }
  },

  renameCv: async (id, name) => {
    const previous = get().cvs.find((cv) => cv.id === id)?.name;
    const apply = (value: string) =>
      set((state) => ({
        cvs: state.cvs.map((cv) => (cv.id === id ? { ...cv, name: value } : cv)),
        selectedCv: state.selectedCv?.id === id ? { ...state.selectedCv, name: value } : state.selectedCv,
        activeCv: state.activeCv?.id === id ? { ...state.activeCv, name: value } : state.activeCv,
      }));
    apply(name.trim());
    try {
      await cvService.renameCv(id, name);
    } catch (err) {
      if (previous !== undefined) apply(previous);
      throw err;
    }
  },

  duplicateCv: async (id, name) => {
    set({ isLoading: true, error: null });
    try {
      const newId = await cvService.duplicateCv(id, name);
      await get().fetchCvs();
      set({ isLoading: false });
      return newId;
    } catch (err) {
      set({ isLoading: false, error: String(err) });
      return null;
    }
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
