import { useTranslations } from "@renderer/i18n/use-translations";
import type { FleetOpening } from "@renderer/stores/fleet";
import type { ServerGrant } from "@shared/servers";
import { grantPending, grantWithdrawn } from "@shared/servers";
import { ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import { ErrorNotice } from "../ui/error-notice";
import { WaitingNotice } from "../ui/waiting-notice";

export function ServerGrantOpen({
  grant,
  opening,
  onOpen,
}: {
  grant: ServerGrant;
  opening: FleetOpening | null;
  onOpen: () => void;
}) {
  const t = useTranslations();

  const withdrawn = grantWithdrawn(grant);
  const pending = grantPending(grant);

  if (withdrawn) {
    return (
      <p className="mt-4 pl-7 text-ink-3 leading-relaxed">
        {t("fleet.row.withdrawnDetail")}
      </p>
    );
  }

  const waiting = opening?.status === "waiting";
  const refused = opening?.status === "refused" ? opening : null;

  if (grant.opened && !(waiting || refused)) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col gap-4 pl-7">
      {grant.opened ? null : (
        <div>
          <Button
            disabled={pending}
            icon={ArrowRight}
            onClick={onOpen}
            size="sm"
            variant="inverse"
          >
            {t("fleet.row.open")}
          </Button>
        </div>
      )}

      {waiting ? (
        <WaitingNotice
          detail={t("fleet.waiting.detail")}
          title={t("fleet.waiting.title")}
        />
      ) : null}

      {refused ? <ErrorNotice error={refused.error} onRetry={onOpen} /> : null}
    </div>
  );
}
