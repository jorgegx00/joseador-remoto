import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { updateApplicationNotes } from "@/services/database";
import { useApplicationStore } from "@/stores/applicationStore";

interface ApplicationNotesProps {
  applicationId: string;
  initialNotes: string;
}

export function ApplicationNotes({
  applicationId,
  initialNotes,
}: ApplicationNotesProps) {
  const { t } = useTranslation("applications");
  const [notes, setNotes] = useState(initialNotes);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>(initialNotes);

  // Update local state if props change (e.g., navigating to different app)
  useEffect(() => {
    setNotes(initialNotes);
    lastSavedRef.current = initialNotes;
    setSaveState("idle");
  }, [initialNotes, applicationId]);

  const persistNotes = useCallback(
    async (text: string) => {
      if (text === lastSavedRef.current) return;

      setSaveState("saving");
      try {
        await updateApplicationNotes(applicationId, text);
        // Also update store state
        const store = useApplicationStore.getState();
        const apps = store.applications.map((a) =>
          a.id === applicationId
            ? { ...a, notes: text, updated_at: Date.now() }
            : a,
        );
        useApplicationStore.setState({ applications: apps });

        lastSavedRef.current = text;
        setSaveState("saved");

        // Reset to idle after 2 seconds
        setTimeout(() => {
          setSaveState((current) => (current === "saved" ? "idle" : current));
        }, 2000);
      } catch {
        setSaveState("idle");
      }
    },
    [applicationId],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setNotes(value);

      // Clear previous debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Debounce save for 2 seconds
      debounceRef.current = setTimeout(() => {
        void persistNotes(value);
      }, 2000);
    },
    [persistNotes],
  );

  const handleBlur = useCallback(() => {
    // Save immediately on blur
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    void persistNotes(notes);
  }, [notes, persistNotes]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-2">
      <Textarea
        value={notes}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={t("notes.placeholder")}
        className="min-h-[200px] resize-y"
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("notes.char_count", { count: notes.length })}</span>
        <div className="flex items-center gap-1.5">
          {saveState === "saving" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{t("notes.saving")}</span>
            </>
          )}
          {saveState === "saved" && (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span className="text-green-600 dark:text-green-400">
                {t("notes.saved")}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
