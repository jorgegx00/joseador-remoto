import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, ClipboardPaste, X, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

interface ApiKeyInputProps {
  isKeySet: boolean;
  onSave: (key: string) => Promise<void>;
  onClear: () => Promise<void>;
  placeholder?: string;
}

export function ApiKeyInput({
  isKeySet,
  onSave,
  onClear,
  placeholder = "sk-...",
}: ApiKeyInputProps) {
  const { t } = useTranslation("settings");
  const [value, setValue] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setValue(text.trim());
        setIsEditing(true);
      }
    } catch {
      toast.error(t("llm.paste_failed"));
    }
  }, [t]);

  const handleSave = useCallback(async () => {
    if (!value.trim()) return;
    setIsSaving(true);
    try {
      await onSave(value.trim());
      setValue("");
      setIsEditing(false);
      setIsVisible(false);
      toast.success(t("llm.api_key_saved"));
    } catch {
      toast.error(t("llm.api_key_save_failed"));
    } finally {
      setIsSaving(false);
    }
  }, [value, onSave, t]);

  const handleClear = useCallback(async () => {
    try {
      await onClear();
      setValue("");
      setIsEditing(false);
      setIsVisible(false);
      toast.success(t("llm.api_key_cleared"));
    } catch {
      toast.error(t("llm.api_key_clear_failed"));
    }
  }, [onClear, t]);

  const handleStartEditing = useCallback(() => {
    setIsEditing(true);
    setValue("");
  }, []);

  // Saved state: show masked key with change button
  if (isKeySet && !isEditing) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2">
          <Badge variant="default" className="font-mono text-xs">
            {t("llm.api_key_masked")}
          </Badge>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartEditing}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                {t("llm.change_key")}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("llm.change_key_tooltip")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => void handleClear()}
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("llm.remove_key")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  // Editing state: show input with action buttons
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Input
            type={isVisible ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="pr-10 font-mono text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) {
                void handleSave();
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full w-10 text-muted-foreground hover:text-foreground"
            onClick={() => setIsVisible(!isVisible)}
          >
            {isVisible ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => void handlePaste()}
              >
                <ClipboardPaste className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("llm.paste_key")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!value.trim() || isSaving}
          onClick={() => void handleSave()}
        >
          {isSaving ? t("llm.saving_key") : t("llm.save_key")}
        </Button>
        {isKeySet && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(false)}
          >
            {t("llm.cancel_edit")}
          </Button>
        )}
      </div>
    </div>
  );
}
