import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ErrorStateProps {
  error: string;
  details?: string;
  onRetry?: () => void;
}

export function ErrorState({ error, details, onRetry }: ErrorStateProps) {
  const { t } = useTranslation("common");

  return (
    <Alert variant="destructive" className="max-w-lg">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{t("status.error")}</AlertTitle>
      <AlertDescription>
        <p className="mb-3">{error}</p>

        {details && (
          <Accordion type="single" collapsible className="border-t border-destructive/20">
            <AccordionItem value="details" className="border-b-0">
              <AccordionTrigger className="py-2 text-xs">
                {t("actions.edit")}
              </AccordionTrigger>
              <AccordionContent>
                <pre className="text-xs whitespace-pre-wrap break-all bg-destructive/10 rounded p-2">
                  {details}
                </pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onRetry}
          >
            {t("actions.retry")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
