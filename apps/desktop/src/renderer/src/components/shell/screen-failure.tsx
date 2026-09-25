import { Callout } from "@renderer/components/ui/callout";
import { useTranslations } from "@renderer/i18n/use-translations";
import { RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Details } from "../ui/details";

export function ScreenFailure({
  detail,
  onRetry,
}: {
  detail: string;
  onRetry: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="h-full bg-base p-8" data-screen-failure="true">
      <Callout
        action={
          <Button icon={RefreshCw} onClick={onRetry}>
            {t("shell.failure.retry")}
          </Button>
        }
        tone="danger"
      >
        {t("shell.failure.message")}
      </Callout>

      <Details className="mt-2">
        <span className="font-data">{detail}</span>
      </Details>
    </div>
  );
}
