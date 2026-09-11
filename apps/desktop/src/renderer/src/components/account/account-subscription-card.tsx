import {
  type MeSubscription,
  TRIAL_WARN_DAYS,
  trialDaysLeft,
} from "@pupitre/shared/plans";
import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
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

/**
 * The subscription of the active organization, as the console mirrors it.
 *
 * A trial is what most accounts hold first: the days it has left are the one
 * figure that decides something, so they are the headline, and they turn to a
 * warning under three days. The rest — the renewal, the seats — is read, and
 * the only gesture goes to the console, which is where Stripe is spoken to.
 */

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

/** A status Stripe invents after this was written keeps its own word. */
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
  /** The moment the days are counted from; the clock, outside a test. */
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
    <div
      className="flex flex-col gap-4 rounded-md border border-line bg-surface px-4 py-4"
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
              <p className="mt-1 text-[12px] text-ink-3 leading-relaxed">
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

      <dl className="grid gap-3 border-line border-t pt-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt>
            <Label>{t("account.subscription.servers")}</Label>
          </dt>
          <dd className="mt-1 font-data text-[12px] text-ink-2 tabular-nums">
            {t("account.subscription.serversOf", {
              limit: subscription.servers.limit,
              used: subscription.servers.used,
            })}
          </dd>
        </div>

        {subscription.current_period_end ? (
          <div className="min-w-0">
            <dt>
              <Label>
                {trialing
                  ? t("account.subscription.trialEndsOn")
                  : t("account.subscription.renewsOn")}
              </Label>
            </dt>
            <dd className="mt-1 font-data text-[12px] text-ink-2 tabular-nums">
              {formatDay(subscription.current_period_end)}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
