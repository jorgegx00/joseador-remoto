import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketProfileForm } from "@/features/markets/MarketProfileForm";

export function MarketSettings() {
  const { t } = useTranslation("settings");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("markets.title")}</CardTitle>
        <CardDescription>{t("markets.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <MarketProfileForm />
      </CardContent>
    </Card>
  );
}
