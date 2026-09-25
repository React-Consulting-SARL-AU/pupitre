import {
  type MeSubscription,
  TRIAL_WARN_DAYS,
  trialDaysLeft,
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
import { ExternalLink } from "lucide-react";

const BILLING_PATH = "/dashboard/billing";

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
    title: "account.subscription.status.active",
    tone: "ok",
  },
  canceled: {
    shape: "struck",
    title: "account.subscription.status.canceled",
    tone: "neutral",
  },
  incomplete: {
    shape: "empty",
    title: "account.subscription.status.incomplete",
    tone: "warn",
  },
  past_due: {
    shape: "empty",
    title: "account.subscription.status.past_due",
    tone: "warn",
  },
  paused: {
    shape: "empty",
    title: "account.subscription.status.paused",
    tone: "warn",
  },
  trialing: {
    shape: "breathing",
    title: "account.subscription.status.trialing",
    tone: "neutral",
  },
  unpaid: {
    shape: "struck",
    title: "account.subscription.status.unpaid",
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

export function billingUrlOf(consoleUrl: string): string {
  return new URL(BILLING_PATH, consoleUrl).toString();
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat(currentLocale(), { dateStyle: "long" }).format(
    new Date(iso)
  );
}

export function AccountSubscriptionCard({
  subscription,
  consoleUrl,
  onOpenConsole,
  now = new Date(),
}: {
  subscription: MeSubscription;
  consoleUrl: string;
  onOpenConsole: (url: string) => void;
  now?: Date;
}) {
  const t = useTranslations();

  const look = lookOf(subscription.status, t);
  const trialing = subscription.status === "trialing";
  const daysLeft = trialing
    ? trialDaysLeft(subscription.trial_ends_at, now)
    : null;
  const ending = daysLeft !== null && daysLeft < TRIAL_WARN_DAYS;
  const trialTone = ending ? "warn" : "ok";
  const trialInk = ending ? "text-warn" : "text-ink";

  return (
    <Panel
      className="flex flex-col gap-4"
      data-subscription={subscription.status}
      data-trial-tone={daysLeft === null ? undefined : trialTone}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="translate-y-1">
            <StatusDot shape={look.shape} size={12} tone={look.tone} />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink">{look.title}</p>
            {daysLeft === null ? null : (
              <p
                className={`mt-1 font-semibold text-lg tabular-nums tracking-tight ${trialInk}`}
              >
                {daysLeft === 0
                  ? t("account.subscription.trialOver")
                  : t.plural("account.subscription.trialLeft", daysLeft)}
              </p>
            )}
            {ending ? (
              <p className="mt-1 text-ink-3 text-small leading-relaxed">
                {t("account.subscription.trialEndingFix")}
              </p>
            ) : null}
          </div>
        </div>

        <Button
          className="shrink-0"
          icon={ExternalLink}
          onClick={() => onOpenConsole(billingUrlOf(consoleUrl))}
          size="sm"
          variant={ending ? "inverse" : "default"}
        >
          {t("account.usage.manageSubscription")}
        </Button>
      </div>

      <FactList className="border-line border-t pt-3">
        <Fact label={t("account.subscription.servers")}>
          {t("account.subscription.serversOf", {
            limit: subscription.servers.limit,
            used: subscription.servers.used,
          })}
        </Fact>

        {subscription.current_period_end ? (
          <Fact
            label={
              trialing
                ? t("account.subscription.trialEndsOn")
                : t("account.subscription.renewsOn")
            }
          >
            {formatDay(subscription.current_period_end)}
          </Fact>
        ) : null}
      </FactList>
    </Panel>
  );
}
