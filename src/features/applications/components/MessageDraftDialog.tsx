import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CancelledError, describeLlmError } from "@/lib/llm/errors";
import { resolveMaterialLanguage, type MaterialLanguage } from "@/lib/llm/language";
import { getActiveLlmService } from "@/features/interview-prep/hooks/usePrepDocument";
import { getApplicationById, getCvById, getJobById } from "@/services/database";
import { useApplicationStore } from "@/stores/applicationStore";
import type { Interview, MessageKind } from "@/types";

const KINDS: MessageKind[] = ["follow_up", "thank_you", "withdraw", "accept"];

interface MessageDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  kind: MessageKind;
  interview?: Interview | null;
  /** Called after the user marks the message as sent. */
  onSent?: () => void;
}

export function MessageDraftDialog({
  open,
  onOpenChange,
  applicationId,
  kind: initialKind,
  interview,
  onSent,
}: MessageDraftDialogProps) {
  const { t, i18n } = useTranslation("applications");
  const { logMessageSent } = useApplicationStore();
  const [kind, setKind] = useState<MessageKind>(initialKind);
  const [language, setLanguage] = useState<MaterialLanguage | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (forKind: MessageKind, override: MaterialLanguage | null) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsGenerating(true);
      try {
        const llm = await getActiveLlmService();
        if (!llm) {
          toast.error(t("drafts.no_llm"));
          return;
        }
        const app = await getApplicationById(applicationId);
        if (!app) return;
        const [job, cv] = await Promise.all([getJobById(app.job_id), getCvById(app.cv_id).catch(() => null)]);
        if (!job) return;
        const lang = resolveMaterialLanguage(job, i18n.language, override);
        if (!override) setLanguage(lang);
        const draft = await llm.draftMessage(
          {
            kind: forKind,
            candidateName: cv?.parsed_data.full_name ?? "",
            cv: cv?.parsed_data ?? null,
            job,
            language: lang,
            daysSinceApplied: app.applied_at ? differenceInCalendarDays(Date.now(), app.applied_at) : null,
            interview:
              forKind === "thank_you" && interview
                ? {
                    type: interview.interview_type,
                    interviewerName: interview.interviewer_name,
                    interviewerRole: interview.interviewer_role,
                    notes: [interview.notes, interview.feedback].filter(Boolean).join("\n"),
                  }
                : null,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setSubject(draft.subject);
        setBody(draft.body);
      } catch (err) {
        if (err instanceof CancelledError || controller.signal.aborted) return;
        toast.error(t("drafts.failed"), { description: describeLlmError(err).message });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setIsGenerating(false);
      }
    },
    [applicationId, interview, i18n.language, t],
  );

  // Fresh draft each time the dialog opens. Through a ref so parent re-renders (new
  // interview object, language change) never trigger a surprise regeneration.
  const generateRef = useRef(generate);
  generateRef.current = generate;
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      return;
    }
    setKind(initialKind);
    setLanguage(null);
    setSubject("");
    setBody("");
    setCopied(false);
    void generateRef.current(initialKind, null);
  }, [open, initialKind]);

  const copy = async () => {
    const text = subject ? `${subject}\n\n${body}` : body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("drafts.copy_failed"));
    }
  };

  const markSent = async () => {
    await logMessageSent(applicationId, kind, kind === "thank_you" ? interview?.id : undefined);
    toast.success(t("drafts.marked_sent"));
    onSent?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(`drafts.title.${kind}`)}</DialogTitle>
          <DialogDescription>{t("drafts.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("drafts.kind")}</Label>
            <Select
              value={kind}
              onValueChange={(v) => {
                setKind(v as MessageKind);
                void generate(v as MessageKind, language);
              }}
              disabled={isGenerating}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.filter((k) => k !== "thank_you" || interview).map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`drafts.kinds.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("drafts.language")}</Label>
            <Select
              value={language ?? ""}
              onValueChange={(v) => {
                setLanguage(v as MaterialLanguage);
                void generate(kind, v as MaterialLanguage);
              }}
              disabled={isGenerating}
            >
              <SelectTrigger>
                <SelectValue placeholder="…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isGenerating && !body ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("drafts.generating")}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("drafts.subject")}</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("drafts.body")}</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
            </div>
            <p className="text-xs text-muted-foreground">{t("drafts.review_hint")}</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => void generate(kind, language)} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {t("drafts.regenerate")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void copy()} disabled={!body}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? t("drafts.copied") : t("drafts.copy")}
            </Button>
            <Button onClick={() => void markSent()} disabled={!body}>
              {t("drafts.mark_sent")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
