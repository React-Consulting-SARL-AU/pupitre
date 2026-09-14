import type { DictionaryKey } from "@renderer/i18n/en";
import type { Translate } from "@renderer/i18n/i18n";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ServerGrant } from "@shared/servers";
import { grantPending, grantWithdrawn } from "@shared/servers";
import { Fact } from "../ui/fact";
import type { StatusShape, StatusTone } from "../ui/status-dot";
import { StatusDot } from "../ui/status-dot";

/**
 * What the console says about a server of the list, among its other facts.
 *
 * A granted machine is one entry, not two: the platform's word sits next to
 * the address and the host key rather than in a list of its own. Three shapes
 * tell the three states apart before the words do.
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

/** The platform's own word for a server, said in the reader's language; an unknown one is said as it came. */
const STATUS_KEYS: Record<string, DictionaryKey> = {
  active: "fleet.status.active",
  enrolling: "fleet.status.enrolling",
  grace: "fleet.status.grace",
  revoked: "fleet.status.revoked",
  suspended: "fleet.status.suspended",
};

export function grantStatusLabel(t: Translate, status: string): string {
  const key = STATUS_KEYS[status];

  return key ? t(key) : status;
}

export function grantLook(grant: ServerGrant): Look {
  if (grantWithdrawn(grant)) {
    return WITHDRAWN;
  }

  return grantPending(grant) ? PENDING : GRANTED;
}

export function ServerGrantDetail({ grant }: { grant: ServerGrant }) {
  const t = useTranslations();

  const look = grantLook(grant);

  return (
    <>
      <Fact label={t("fleet.row.platformState")}>
        <span className="inline-flex items-center gap-1.5">
          <StatusDot shape={look.shape} size={9} tone={look.tone} />
          {t(look.label)} · {grantStatusLabel(t, grant.status)}
        </span>
      </Fact>

      {grant.organization ? (
        <Fact label={t("fleet.row.organization")} prose>
          {grant.organization.name}
        </Fact>
      ) : null}
    </>
  );
}
