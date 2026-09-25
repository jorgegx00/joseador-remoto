import { Component, type ReactNode } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
import { AlertOctagon, RotateCcw, Bug, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ErrorBoundaryProps extends WithTranslation {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
  copied: boolean;
}

class GlobalErrorBoundaryInner extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: "",
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const errorInfo = info.componentStack ?? "";
    this.setState({ errorInfo });

    console.error("[GlobalErrorBoundary] Uncaught error:", error);
    console.error("[GlobalErrorBoundary] Component stack:", errorInfo);
  }

  private handleRestart = (): void => {
    window.location.reload();
  };

  private handleReport = (): void => {
    const { error, errorInfo } = this.state;
    const body = encodeURIComponent(
      `Error: ${error?.message ?? "Unknown"}\n\nStack:\n${error?.stack ?? "N/A"}\n\nComponent Stack:\n${errorInfo}`
    );
    window.open(
      `https://github.com/joseador-remoto/issues/new?title=Bug+Report&body=${body}`,
      "_blank"
    );
  };

  private handleCopyError = (): void => {
    const { error, errorInfo } = this.state;
    const text = `Error: ${error?.message ?? "Unknown"}\n\nStack:\n${error?.stack ?? "N/A"}\n\nComponent Stack:\n${errorInfo}`;
    void navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  render(): ReactNode {
    const { t } = this.props;

    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo, copied } = this.state;
    const fullStack = [error?.stack ?? "", errorInfo].filter(Boolean).join("\n\n--- Component Stack ---\n");

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-destructive/10 p-4">
                <AlertOctagon className="h-12 w-12 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-xl">
              {t("onboarding:error_boundary.title")}
            </CardTitle>
            <CardDescription>
              {t("onboarding:error_boundary.description")}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm font-mono text-destructive break-words">
                {error?.message ?? t("common:errors.generic_error")}
              </p>
            </div>

            {fullStack && (
              <Accordion type="single" collapsible>
                <AccordionItem value="stack-trace" className="border-b-0">
                  <AccordionTrigger className="py-2 text-sm">
                    {t("onboarding:error_boundary.stack_trace")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="xs"
                        className="absolute top-1 right-1"
                        onClick={this.handleCopyError}
                      >
                        {copied ? (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            {t("onboarding:error_boundary.copied")}
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 mr-1" />
                            {t("onboarding:error_boundary.copy_error")}
                          </>
                        )}
                      </Button>
                      <pre className="text-xs whitespace-pre-wrap break-all bg-muted rounded-md p-3 pt-8 max-h-48 overflow-y-auto font-mono">
                        {fullStack}
                      </pre>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </CardContent>

          <CardFooter className="flex gap-3 justify-center">
            <Button onClick={this.handleRestart} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              {t("onboarding:error_boundary.restart")}
            </Button>
            <Button
              variant="outline"
              onClick={this.handleReport}
              className="gap-2"
            >
              <Bug className="h-4 w-4" />
              {t("onboarding:error_boundary.report")}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
}

export const GlobalErrorBoundary = withTranslation()(GlobalErrorBoundaryInner);
