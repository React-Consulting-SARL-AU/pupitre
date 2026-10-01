import { LEGAL_CONTACTS } from "@pupitre/shared/legal";
import {
  FREE_SERVERS,
  type MeLicenseGrant,
  type MeServers,
} from "@pupitre/shared/plans";
import { Button } from "@renderer/components/ui/button";
import { Fact, FactList } from "@renderer/components/ui/fact";
import { Panel } from "@renderer/components/ui/panel";
import type {
  StatusShape,
  StatusTone,
} from "@renderer/components/ui/status-dot";
import { StatusDot } from "@renderer/components/ui/status-dot";
import type { DictionaryKey } from "@renderer/i18n/en";
import type { Translate } from "@renderer/i18n/i18n";
import { currentLocale } from "@renderer/i18n/translate";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Mail } from "lucide-react";

interface Look {
  shape: StatusShape;
  tone: StatusTone;
  title: string;
}

interface NamedLook {
  shape: StatusShape;
  tone: StatusTone;
  title: DictionaryKey;
}

const LOOKS: Record<string, NamedLook> = {
  active: {
    shape: "filled",
    title: "account.license.status.active",
    tone: "ok",
  },
  canceled: {
    shape: "struck",
    title: "account.license.status.canceled",
    tone: "neutral",
  },
  incomplete: {
    shape: "empty",
    title: "account.license.status.incomplete",
    tone: "warn",
  },
  past_due: {
    shape: "empty",
    title: "account.license.status.past_due",
    tone: "warn",
  },
  paused: {
    shape: "empty",
    title: "account.license.status.paused",
    tone: "warn",
  },
  unpaid: {
    shape: "struck",
    title: "account.license.status.unpaid",
    tone: "danger",
  },
};

// A status Stripe adds later falls back to its raw name.
function lookOf(status: string, t: Translate): Look {
  const named = LOOKS[status];

  return named
    ? { shape: named.shape, title: t(named.title), tone: named.tone }
    : { shape: "empty", title: status, tone: "neutral" };
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat(currentLocale(), { dateStyle: "long" }).format(
    new Date(iso)
  );
}

export function AccountLicenseCard({
  servers,
  grant,
  onContactSupport,
}: {
  servers: MeServers;
  grant: MeLicenseGrant | null;
  onContactSupport: () => void;
}) {
  const t = useTranslations();

  const full = servers.used >= servers.limit;
  const look = grant ? lookOf(grant.status, t) : null;

  return (
    <Panel
      className="flex flex-col gap-4"
      data-license={grant?.status ?? "free"}
    >
      {look ? (
        <div className="flex min-w-0 items-start gap-3">
          <span className="translate-y-1">
            <StatusDot shape={look.shape} size={12} tone={look.tone} />
          </span>
          <p className="font-medium text-ink">{look.title}</p>
        </div>
      ) : null}

      <FactList className={look ? "border-line border-t pt-3" : undefined}>
        <Fact
          detail={t("account.license.freeTier", {
            free: FREE_SERVERS,
            support: LEGAL_CONTACTS.support,
          })}
          label={t("account.license.servers")}
        >
          {t("account.license.serversOf", {
            limit: servers.limit,
            used: servers.used,
          })}
        </Fact>

        {grant && grant.seats > 0 ? (
          <Fact label={t("account.usage.title")}>
            {t.plural("account.license.seats", grant.seats)}
          </Fact>
        ) : null}

        {grant?.current_period_end ? (
          <Fact label={t("account.license.endsOn")}>
            {formatDay(grant.current_period_end)}
          </Fact>
        ) : null}
      </FactList>

      {full ? (
        <Button
          className="self-start"
          icon={Mail}
          onClick={onContactSupport}
          size="sm"
        >
          {t("account.usage.contactSupport")}
        </Button>
      ) : null}
    </Panel>
  );
}
