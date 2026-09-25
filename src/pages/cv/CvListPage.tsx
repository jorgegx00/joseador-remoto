import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { useNavigate } from "@tanstack/react-router";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Upload,
  FileText,
  File,
  FileCode,
  FileType,
  Sparkles,
  Star,
  MoreVertical,
  Eye,
  Pencil,
  Copy,
  Trash2,
} from "lucide-react";
import { useCvStore } from "@/stores/cvStore";
import { CvInUseError } from "@/services/database";
import { exportCvToFile } from "@/services/file-export";
import { hasParsedContent } from "@/lib/cv/cv-document";
import type { CvExportFormat } from "@/lib/cv/export/types";
import type { CvRecord } from "@/types";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { CvUploadZone, type CvUploadZoneHandle } from "@/features/cv/components/CvUploadZone";
import { toast } from "sonner";

const EXPORT_FORMATS: Array<{ format: CvExportFormat; icon: typeof FileText }> = [
  { format: "pdf", icon: FileText },
  { format: "docx", icon: FileType },
  { format: "md", icon: FileCode },
];

/** Message the store surfaces when deleteCv is blocked by foreign keys. */
const CV_IN_USE_MESSAGE = new CvInUseError(null).message;

export function CvListPage() {
  const { t, i18n } = useTranslation("cv");
  const navigate = useNavigate();
  const { cvs, isLoading, fetchCvs, deleteCv, setPrimary, duplicateCv, renameCv } =
    useCvStore();

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Id of the CV whose inline rename is open. Consumed on the first commit so an
  // Enter followed by the input's blur (on unmount) never submits twice.
  const renameSessionRef = useRef<string | null>(null);
  const uploadZoneRef = useRef<CvUploadZoneHandle>(null);

  const triggerUpload = useCallback(() => {
    uploadZoneRef.current?.triggerUpload();
  }, []);

  useEffect(() => {
    void fetchCvs();
  }, [fetchCvs]);

  const dateLocale = i18n.language.startsWith("es") ? es : enUS;

  const handleUploadComplete = useCallback(
    (cvId: string) => {
      void navigate({ to: "/cv/$cvId", params: { cvId } });
    },
    [navigate],
  );

  const handleView = useCallback(
    (cvId: string) => {
      void navigate({ to: "/cv/$cvId", params: { cvId } });
    },
    [navigate],
  );

  const handleDuplicate = useCallback(
    async (cvId: string, name: string) => {
      const newId = await duplicateCv(cvId, `${name} (${t("editor.copy")})`);
      if (newId) {
        toast.success(t("duplicate_success"));
      }
    },
    [duplicateCv, t],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      useCvStore.getState().setError(null);
      await deleteCv(deleteTarget);
      const stillExists = useCvStore.getState().cvs.some((c) => c.id === deleteTarget);
      if (stillExists) {
        const err = useCvStore.getState().error;
        toast.error(
          err === CV_IN_USE_MESSAGE ? t("in_use_error") : err ?? t("delete_error"),
        );
      } else {
        toast.success(t("delete_success"));
      }
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteCv, t]);

  const handleSetPrimary = useCallback(
    async (cvId: string) => {
      await setPrimary(cvId);
      toast.success(t("primary_set_success"));
    },
    [setPrimary, t],
  );

  const handleStartRename = useCallback(
    (cvId: string, currentName: string) => {
      renameSessionRef.current = cvId;
      setRenamingId(cvId);
      setRenameValue(currentName);
    },
    [],
  );

  const handleCancelRename = useCallback(() => {
    renameSessionRef.current = null;
    setRenamingId(null);
    setRenameValue("");
  }, []);

  const handleFinishRename = useCallback(async () => {
    const id = renameSessionRef.current;
    const value = renameValue.trim();
    // Clear first: the input unmounts right away and a second commit becomes a no-op.
    renameSessionRef.current = null;
    setRenamingId(null);
    setRenameValue("");
    if (!id || id !== renamingId) return;

    const current = useCvStore.getState().cvs.find((c) => c.id === id);
    if (!value || !current || value === current.name) return;

    try {
      await renameCv(id, value);
      toast.success(t("rename_success"));
    } catch (err) {
      toast.error(
        t("rename_error", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }, [renameValue, renamingId, renameCv, t]);

  const handleExport = useCallback(
    async (cv: CvRecord, format: CvExportFormat) => {
      try {
        const path = await exportCvToFile(cv, format);
        if (path) toast.success(t("common:export.saved_to", { path }));
        else toast.info(t("common:export.cancelled"));
      } catch (err) {
        console.error("[CvListPage] export failed:", err);
        toast.error(
          t("common:export.failed", {
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    },
    [t],
  );

  const getFileIcon = (cv: CvRecord) => {
    if (cv.source === "tailored") return Sparkles;
    if (cv.file_type === "pdf") return FileText;
    if (cv.file_type === "md") return FileCode;
    return File;
  };

  const getSkillCount = (cv: (typeof cvs)[0]) => {
    if (!cv.parsed_data) return 0;
    return (
      (cv.parsed_data.skills?.technical?.length ?? 0) +
      (cv.parsed_data.skills?.soft?.length ?? 0)
    );
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("supported_formats")}
            </p>
          </div>
          <Button onClick={triggerUpload}>
            <Upload className="h-4 w-4 mr-2" />
            {t("upload")}
          </Button>
        </div>

        {/* CV Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <LoadingSkeleton key={i} variant="cv-card" />
            ))}
          </div>
        ) : cvs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t("no_cvs")}
            description={t("upload_prompt")}
            action={{
              label: t("upload"),
              onClick: triggerUpload,
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cvs.map((cv) => {
              const IconComponent = getFileIcon(cv);
              const skillCount = getSkillCount(cv);
              const hasParsedData =
                cv.parsed_data &&
                (cv.parsed_data.full_name ||
                  cv.parsed_data.experience.length > 0);
              const isTailored = cv.source === "tailored";
              const canExport = isTailored || hasParsedContent(cv);

              return (
                <Card
                  key={cv.id}
                  className="group hover:border-primary/50 transition-colors relative cursor-pointer"
                  onClick={() => {
                    if (renamingId === cv.id) return;
                    handleView(cv.id);
                  }}
                >
                  <CardHeader className="flex flex-row items-start gap-3 pb-2">
                    <div className="rounded-md bg-muted p-2 shrink-0">
                      <IconComponent className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {renamingId === cv.id ? (
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => void handleFinishRename()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleFinishRename();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              handleCancelRename();
                            }
                          }}
                          className="h-7 text-sm font-semibold"
                          autoFocus
                        />
                      ) : (
                        <CardTitle
                          className="text-sm truncate"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(cv.id, cv.name);
                          }}
                        >
                          {cv.name}
                        </CardTitle>
                      )}
                      {isTailored && cv.target_job_title && (
                        <p
                          className="text-xs text-muted-foreground mt-0.5 truncate"
                          title={
                            cv.target_company
                              ? `${cv.target_job_title} @ ${cv.target_company}`
                              : cv.target_job_title
                          }
                        >
                          → {cv.target_job_title}
                          {cv.target_company ? ` @ ${cv.target_company}` : ""}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(cv.created_at), {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                      </p>
                    </div>
                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {cv.is_primary && (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          onCloseAutoFocus={(e) => {
                            // Keep focus on the inline rename input instead of the trigger.
                            if (renameSessionRef.current) e.preventDefault();
                          }}
                        >
                          <DropdownMenuItem
                            onClick={() => handleView(cv.id)}
                          >
                            <Eye className="h-4 w-4" />
                            {t("actions.view")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleStartRename(cv.id, cv.name)
                            }
                          >
                            <Pencil className="h-4 w-4" />
                            {t("actions.rename")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              void handleDuplicate(cv.id, cv.name)
                            }
                          >
                            <Copy className="h-4 w-4" />
                            {t("actions.duplicate_cv")}
                          </DropdownMenuItem>
                          {!cv.is_primary && (
                            <DropdownMenuItem
                              onClick={() => void handleSetPrimary(cv.id)}
                            >
                              <Star className="h-4 w-4" />
                              {t("actions.set_primary")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-xs text-muted-foreground">
                            {t("common:export.button")}
                          </DropdownMenuLabel>
                          {EXPORT_FORMATS.map(({ format, icon: Icon }) => (
                            <DropdownMenuItem
                              key={format}
                              disabled={!canExport}
                              onSelect={() => void handleExport(cv, format)}
                            >
                              <Icon className="h-4 w-4" />
                              {t(`common:export.${format}`)}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(cv.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            {t("actions.delete_cv")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1.5">
                        {isTailored ? (
                          <Badge variant="secondary" className="gap-1">
                            <Sparkles className="h-3 w-3" />
                            {t("badge_tailored")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            {t(`common:file_types.${cv.file_type}`, {
                              defaultValue: cv.file_type.toUpperCase(),
                            })}
                          </Badge>
                        )}
                        {cv.is_primary && (
                          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                            {t("primary")}
                          </Badge>
                        )}
                        {skillCount > 0 && (
                          <Badge variant="outline">
                            {t("skill_count", { count: skillCount })}
                          </Badge>
                        )}
                        {hasParsedData ? (
                          <Badge variant="default">{t("parsed")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("not_parsed")}</Badge>
                        )}
                      </div>
                      {/* Mini ATS gauge if available - we don't have ATS reports on the list record,
                          so this is a placeholder for when ATS reports are linked to CVs */}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Upload zone at bottom */}
        {!isLoading && (
          <CvUploadZone
            ref={uploadZoneRef}
            onUploadComplete={handleUploadComplete}
            compact={cvs.length > 0}
          />
        )}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("actions.delete_cv")}
        description={t("delete_confirm")}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </PageContainer>
  );
}
