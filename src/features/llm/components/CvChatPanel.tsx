import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Send, Sparkles, AlertCircle, Square } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { CvChatTurn } from "@/lib/llm/prompts";

export interface ChatQuickAction {
  label: string;
  message: string;
}

interface CvChatPanelProps {
  history: CvChatTurn[];
  isRefining: boolean;
  error: string | null;
  /**
   * Send a message. Resolve `false` when it failed so the draft is put back in the box
   * (resolving `void`/`true` keeps the box cleared).
   */
  onSend: (message: string) => Promise<boolean | void> | boolean | void;
  /** Shows a Stop button while refining. */
  onCancel?: () => void;
  /** One-click instructions shown above the input. */
  quickActions?: ChatQuickAction[];
  /** Status line while refining, e.g. "Updating: Skills, Summary". */
  streamingStatus?: string | null;
  /** Disables sending (e.g. while a section editor has unsaved changes). */
  disabled?: boolean;
  disabledReason?: string | null;
}

export function CvChatPanel({
  history,
  isRefining,
  error,
  onSend,
  onCancel,
  quickActions,
  streamingStatus,
  disabled = false,
  disabledReason,
}: CvChatPanelProps) {
  const { t } = useTranslation("generation");
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // The Radix ScrollArea viewport is the scrolling element, not our inner div — scroll a
  // sentinel into view instead of setting scrollTop.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [history.length, isRefining]);

  const send = useCallback(
    async (message: string, fromDraft: boolean) => {
      const trimmed = message.trim();
      if (!trimmed || isRefining || disabled) return;
      if (fromDraft) setDraft("");
      const ok = await onSend(trimmed);
      if (ok === false && fromDraft) {
        setDraft((current) => (current ? current : trimmed));
      }
    },
    [disabled, isRefining, onSend],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void send(draft, true);
      }
    },
    [draft, send],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {t("chat.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("chat.description")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScrollArea className="h-[260px]">
          <div className="space-y-2 pr-2" aria-live="polite">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">{t("chat.empty_state")}</p>
            ) : (
              history.map((turn, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "rounded-md px-3 py-2 text-xs leading-relaxed",
                    turn.role === "user"
                      ? "bg-primary/10 text-foreground border border-primary/20"
                      : "bg-muted text-foreground/80 border border-border",
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-1 opacity-70">
                    {turn.role === "user" ? t("chat.user_label") : t("chat.assistant_label")}
                  </p>
                  <p className="whitespace-pre-wrap">{turn.content}</p>
                </div>
              ))
            )}
            {isRefining && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="truncate">{streamingStatus || t("chat.thinking")}</span>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </ScrollArea>

        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-3.5 w-3.5" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {quickActions && quickActions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={isRefining || disabled}
                onClick={() => void send(action.message, false)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("chat.placeholder")}
            aria-label={t("chat.placeholder")}
            className="min-h-[72px] text-sm resize-none"
            disabled={isRefining}
          />
          {disabled && disabledReason && (
            <p className="text-[11px] text-muted-foreground">{disabledReason}</p>
          )}
          <div className="flex justify-end gap-2">
            {isRefining && onCancel && (
              <Button type="button" size="sm" variant="outline" onClick={onCancel}>
                <Square className="h-3.5 w-3.5 mr-1.5" />
                {t("chat.stop")}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => void send(draft, true)}
              disabled={isRefining || disabled || draft.trim().length === 0}
            >
              {isRefining ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1.5" />
              )}
              {t("chat.send")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
