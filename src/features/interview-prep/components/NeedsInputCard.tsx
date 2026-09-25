import { useTranslation } from "react-i18next";
import { MessageCircleQuestion } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface NeedsInputCardProps {
  items: Array<{ question: string; why: string }>;
}

/** Facts the model refused to invent — the candidate should answer these for stronger prep. */
export function NeedsInputCard({ items }: NeedsInputCardProps) {
  const { t } = useTranslation("interview-prep");
  if (items.length === 0) return null;
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageCircleQuestion className="h-4 w-4" />
          {t("prep_ai.needs_input_title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("prep_ai.needs_input_hint")}</p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {items.map((item, i) => (
            <li key={i}>
              <p>{item.question}</p>
              <p className="text-xs text-muted-foreground">{item.why}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
