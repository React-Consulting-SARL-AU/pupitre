import { Callout } from "@renderer/components/ui/callout";
import { useTranslations } from "@renderer/i18n/use-translations";
import { RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Details } from "../ui/details";

/**
 * A screen that stopped on the app's own fault, rather than the server's.
 *
 * Nothing here is the machine's doing, so nothing is promised about it: the
 * screen says the app could not draw this one, offers to draw it again, and
 * keeps what was raised under Details for whoever reports it.
 */
export function ScreenFailure({
  detail,
  onRetry,
}: {
  detail: string;
  onRetry: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="p-8" data-screen-failure="true">
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
