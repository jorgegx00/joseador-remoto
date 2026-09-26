import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";
import { Upload, FileText, Check, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { toast } from "sonner";
import { useCvUpload } from "@/features/cv/hooks/useCvUpload";
import { cn } from "@/lib/utils";

interface CvUploadZoneProps {
  onUploadComplete?: (cvId: string) => void;
  compact?: boolean;
}

export interface CvUploadZoneHandle {
  triggerUpload: () => void;
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export const CvUploadZone = forwardRef<CvUploadZoneHandle, CvUploadZoneProps>(function CvUploadZone(
  { onUploadComplete, compact = false },
  ref,
) {
  const { t } = useTranslation("cv");
  const {
    upload,
    isUploading,
    step,
    progress,
    pendingRefinement,
    refinementFailed,
    parseProgress,
    confirmEnhanced,
    skipEnhanced,
  } = useCvUpload();
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async () => {
    const cvId = await upload();
    if (cvId) {
      toast.success(t("upload_success"));
      onUploadComplete?.(cvId);
    }
  }, [upload, onUploadComplete, t]);

  useImperativeHandle(ref, () => ({
    triggerUpload: () => {
      void handleUpload();
    },
  }), [handleUpload]);

  useEffect(() => {
    if (step === "complete" && refinementFailed) {
      toast.error(t("enhanced_import.refined_error"));
    }
  }, [step, refinementFailed, t]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const file = files[0];
      if (!isAcceptedFile(file)) {
        toast.error(t("upload_invalid_format"));
        return;
      }

      // Tauri uses native file picker, so we trigger upload through the store
      void handleUpload();
    },
    [handleUpload, t],
  );

  const handleFileSelect = useCallback(
    (_e: React.ChangeEvent<HTMLInputElement>) => {
      // Tauri apps use native file picker through the store action,
      // but we also handle web file input as fallback
      void handleUpload();
    },
    [handleUpload],
  );

  const handleClick = useCallback(() => {
    if (isUploading) return;
    // On Tauri, trigger the native file picker via the store action
    void handleUpload();
  }, [isUploading, handleUpload]);

  // Show upload progress stepper
  if (isUploading) {
    return (
      <>
        <Card className="border-dashed border-2 border-primary/30">
          <CardContent className={cn("text-center", compact ? "p-4" : "p-8")}>
            <div className="max-w-sm mx-auto space-y-4">
              <Progress value={progress} className="h-2" />
              <div className="space-y-3">
                <StepIndicator
                  label={t("upload_steps.uploading")}
                  status={step === "uploading" ? "active" : (progress >= 45 ? "complete" : "pending")}
                />
                <StepIndicator
                  label={t("upload_steps.extracting")}
                  status={step === "extracting" ? "active" : (progress >= 65 ? "complete" : "pending")}
                />
                <StepIndicator
                  label={t("upload_steps.analyzing")}
                  status={
                    step === "analyzing" || step === "awaiting_enhanced_choice"
                      ? "active"
                      : (progress >= 85 ? "complete" : "pending")
                  }
                />
                {(step === "refining" || pendingRefinement !== null) && (
                  <StepIndicator
                    label={
                      step === "refining" && parseProgress?.step === "entries"
                        ? `${t("upload_steps.refining")} · ${t("refine.progress_entries", { done: parseProgress.done, total: parseProgress.total })}`
                        : t("upload_steps.refining")
                    }
                    status={step === "refining" ? "active" : "pending"}
                  />
                )}
                <StepIndicator
                  label={t("upload_steps.complete")}
                  status={step === "complete" ? "complete" : "pending"}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        <ConfirmDialog
          open={step === "awaiting_enhanced_choice" && pendingRefinement !== null}
          onOpenChange={(open) => {
            if (!open) skipEnhanced();
          }}
          title={t("enhanced_import.title")}
          description={t("enhanced_import.description")}
          confirmLabel={t("enhanced_import.use")}
          cancelLabel={t("enhanced_import.skip")}
          onConfirm={confirmEnhanced}
        />
      </>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        onChange={handleFileSelect}
      />
      <Card
        className={cn(
          "border-dashed border-2 transition-colors cursor-pointer",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
        )}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <CardContent className={cn("text-center", compact ? "p-4" : "p-8")}>
          <div className="flex flex-col items-center gap-2">
            {isDragOver ? (
              <FileText className="h-8 w-8 text-primary animate-bounce" />
            ) : (
              <Upload className={cn("text-muted-foreground", compact ? "h-6 w-6" : "h-8 w-8")} />
            )}
            <div>
              <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>
                {isDragOver ? t("drop_here") : t("upload_description")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("supported_formats")}
              </p>
            </div>
            {!compact && (
              <Button variant="outline" size="sm" className="mt-2" type="button">
                <Upload className="h-4 w-4 mr-2" />
                {t("upload")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
});

function StepIndicator({
  label,
  status,
}: {
  label: string;
  status: "pending" | "active" | "complete";
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center h-6 w-6 shrink-0">
        {status === "complete" && (
          <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="h-3 w-3 text-white" />
          </div>
        )}
        {status === "active" && (
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        )}
        {status === "pending" && (
          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
        )}
      </div>
      <span
        className={cn(
          "text-sm",
          status === "complete" && "text-green-600 dark:text-green-400",
          status === "active" && "text-foreground font-medium",
          status === "pending" && "text-muted-foreground",
        )}
      >
        {label}
      </span>
      {status === "active" && (
        <AlertCircle className="h-3 w-3 text-muted-foreground ml-auto hidden" />
      )}
    </div>
  );
}
