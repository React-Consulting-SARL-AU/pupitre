import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Label } from "@renderer/components/ui/label";
import type {
  StatusShape,
  StatusTone,
} from "@renderer/components/ui/status-dot";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { FleetOpening, GrantedServer } from "@renderer/stores/fleet";
import { grantPending, grantWithdrawn } from "@shared/servers";
import { ArrowRight } from "lucide-react";

/**
 * One server the platform granted, and the single gesture it offers.
 *
 * The address is printed because it is worth reading, never because it is
 * asked for: it came from `GET /me/servers`, like the account and the
 * fingerprint. Three shapes tell the three states apart before the words do.
 */

interface Look {
  shape: StatusShape;
  tone: StatusTone;
  label: "fleet.row.granted" | "fleet.row.pending" | "fleet.row.withdrawn";
}

const GRANTED: Look = {
  label: "fleet.row.granted",
  shape: "filled",
  tone: "ok",
};
const PENDING: Look = {
  label: "fleet.row.pending",
  shape: "breathing",
  tone: "warn",
};
const WITHDRAWN: Look = {
  label: "fleet.row.withdrawn",
  shape: "struck",
  tone: "danger",
};

export function FleetServerRow({
  server,
  opening,
  onOpen,
}: {
  server: GrantedServer;
  /** The opening in flight, when it is this server's. */
  opening: FleetOpening | null;
  onOpen: () => void;
}) {
  const t = useTranslations();

  const withdrawn = grantWithdrawn(server.grant);
  const pending = grantPending(server.grant);

  let look = GRANTED;
  if (withdrawn) {
    look = WITHDRAWN;
  } else if (pending) {
    look = PENDING;
  }

  const address = `${server.user}@${server.host}:${server.port}`;

  return (
    <div className="elevation-raised rounded-md border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <StatusDot shape={look.shape} size={13} tone={look.tone} />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{server.name}</p>
          <p className="mt-0.5 break-all font-data text-[11px] text-ink-3">
            {address}
          </p>
        </div>

        {withdrawn ? null : (
          <Button
            disabled={pending}
            icon={ArrowRight}
            onClick={onOpen}
            size="sm"
            variant={server.grant.opened ? "default" : "inverse"}
          >
            {server.grant.opened ? t("fleet.row.reopen") : t("fleet.row.open")}
          </Button>
        )}
      </div>

      <dl className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 pl-7">
        <div className="min-w-0">
          <dt>
            <Label>{t("fleet.row.platformState")}</Label>
          </dt>
          <dd className="font-data text-[11px] text-ink-2">
            {t(look.label)} · {server.grant.status}
          </dd>
        </div>
        <div className="min-w-0">
          <dt>
            <Label>{t("servers.row.hostKeyLabel")}</Label>
          </dt>
          <dd className="break-all font-data text-[11px] text-ink-2">
            {server.hostFingerprint ?? t("servers.row.notPinned")}
          </dd>
        </div>
      </dl>

      {withdrawn ? (
        <p className="mt-4 pl-7 text-ink-3 leading-relaxed">
          {t("fleet.row.withdrawnDetail")}
        </p>
      ) : null}

      {opening?.status === "waiting" ? (
        <div className="mt-4 pl-7">
          <WaitingNotice
            detail={t("fleet.waiting.detail")}
            title={t("fleet.waiting.title")}
          />
        </div>
      ) : null}

      {opening?.status === "refused" ? (
        <div className="mt-4 pl-7">
          <ErrorNotice error={opening.error} onRetry={onOpen} />
        </div>
      ) : null}
    </div>
  );
}
