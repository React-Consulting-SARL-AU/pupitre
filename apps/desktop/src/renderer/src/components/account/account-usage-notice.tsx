import { LEGAL_CONTACTS } from "@pupitre/shared/legal";
import { FREE_SERVERS } from "@pupitre/shared/plans";
import { Button } from "@renderer/components/ui/button";
import { Panel } from "@renderer/components/ui/panel";
import type {
  StatusShape,
  StatusTone,
} from "@renderer/components/ui/status-dot";
import { StatusDot } from "@renderer/components/ui/status-dot";
import type { Translate } from "@renderer/i18n/i18n";
import { currentLocale } from "@renderer/i18n/translate";
import { useTranslations } from "@renderer/i18n/use-translations";
import { since } from "@renderer/lib/format";
import { useContactSupport } from "@renderer/lib/use-contact-support";
import type { UsageRight } from "@shared/account";
import { ExternalLink, Mail } from "lucide-react";

interface Look {
  shape: StatusShape;
  tone: StatusTone;
  title: string;
}

function lookOf(usage: UsageRight, t: Translate): Look {
  if (usage.status === "granted") {
    if (usage.source === "development") {
      return {
        shape: "empty",
        title: t("account.usage.look.development"),
        tone: "neutral",
      };
    }

    return usage.source === "platform"
      ? { shape: "filled", title: t("account.usage.look.valid"), tone: "ok" }
      : {
          shape: "ringed",
          title: t("account.usage.look.cached"),
          tone: "warn",
        };
  }

  if (usage.status === "suspended") {
    return {
      shape: "struck",
      title: t("account.usage.look.suspended"),
      tone: "danger",
    };
  }

  if (usage.status === "stale") {
    return {
      shape: "struck",
      title: t("account.usage.look.stale"),
      tone: "danger",
    };
  }

  if (usage.status === "unlicensed") {
    return {
      shape: "empty",
      title: t("account.usage.look.unlicensed"),
      tone: "warn",
    };
  }

  return { shape: "empty", title: t("account.usage.look.none"), tone: "warn" };
}

function detailOf(
  usage: UsageRight,
  checkedAt: string | null,
  t: Translate
): string {
  if (usage.status === "granted" && usage.source === "development") {
    return t("account.usage.development");
  }

  if (usage.status === "granted") {
    return t("account.usage.checked", {
      since: since(Date.parse(checkedAt ?? "")),
    });
  }

  if (usage.status === "stale") {
    return t("account.usage.stale", { since: since(Date.parse(usage.since)) });
  }

  if (usage.status === "suspended") {
    return t("account.usage.suspended");
  }

  if (usage.status === "unlicensed") {
    return t("account.usage.unlicensed", {
      free: FREE_SERVERS,
      support: LEGAL_CONTACTS.support,
      used: usage.servers.used,
    });
  }

  return t("account.usage.none");
}

/** Only the platform lifts a suspension or grants a licence: both are asked of support, not of the console. */
function asksSupport(usage: UsageRight): boolean {
  return usage.status === "suspended" || usage.status === "unlicensed";
}

export function AccountUsageNotice({
  usage,
  checkedAt,
  onOpenConsole,
}: {
  usage: UsageRight;
  checkedAt: string | null;
  onOpenConsole?: (url: string) => void;
}) {
  const t = useTranslations();

  const contactSupport = useContactSupport();
  const look = lookOf(usage, t);
  const console =
    usage.status === "granted" || asksSupport(usage) ? null : usage.consoleUrl;

  return (
    <Panel className="flex items-start gap-3" data-usage={usage.status}>
      <span className="translate-y-1">
        <StatusDot shape={look.shape} size={12} tone={look.tone} />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-ink">{look.title}</p>
        <p className="mt-1 text-ink-3 text-small leading-relaxed">
          {detailOf(usage, checkedAt, t)}
        </p>
        {usage.status === "stale" ? (
          <p className="mt-1 text-ink-2 text-small leading-relaxed">
            {t("account.usage.stale.fix")}
          </p>
        ) : null}
        {usage.status === "granted" && usage.validUntil ? (
          <p className="mt-1.5 font-data text-ink-3 text-small">
            {t("account.usage.validUntil", {
              date: new Intl.DateTimeFormat(currentLocale()).format(
                new Date(usage.validUntil)
              ),
            })}
          </p>
        ) : null}
      </div>

      {asksSupport(usage) ? (
        <Button
          className="shrink-0 self-center"
          icon={Mail}
          onClick={contactSupport}
          size="sm"
          variant="inverse"
        >
          {t("account.usage.contactSupport")}
        </Button>
      ) : null}

      {console && onOpenConsole ? (
        <Button
          className="shrink-0 self-center"
          icon={ExternalLink}
          onClick={() => onOpenConsole(console)}
          size="sm"
          variant="inverse"
        >
          {t("account.usage.openConsole")}
        </Button>
      ) : null}
    </Panel>
  );
}
