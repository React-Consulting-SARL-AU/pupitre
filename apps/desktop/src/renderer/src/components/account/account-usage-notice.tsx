import type {
  StatusShape,
  StatusTone,
} from "@renderer/components/ui/status-dot";
import { StatusDot } from "@renderer/components/ui/status-dot";
import type { Translate } from "@renderer/i18n/i18n";
import { useTranslations } from "@renderer/i18n/use-translations";
import { since } from "@renderer/lib/format";
import type { UsageRight } from "@shared/account";

/**
 * The right to work, told by a shape.
 *
 * A full dot is a fresh answer from the platform, a ringed one the cache that
 * still holds, a hollow circle a development build that answers for itself, a
 * struck dot a refusal. The seven days are named, because that is the promise.
 */

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

  return t("account.usage.none");
}

export function AccountUsageNotice({
  usage,
  checkedAt,
}: {
  usage: UsageRight;
  checkedAt: string | null;
}) {
  const t = useTranslations();

  const look = lookOf(usage, t);

  return (
    <div
      className="elevation-raised flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-3.5"
      data-usage={usage.status}
    >
      <span className="translate-y-1">
        <StatusDot shape={look.shape} size={12} tone={look.tone} />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-ink">{look.title}</p>
        <p className="mt-1 text-[12px] text-ink-3 leading-relaxed">
          {detailOf(usage, checkedAt, t)}
        </p>
        {usage.status === "granted" && usage.validUntil ? (
          <p className="mt-1.5 font-data text-[12px] text-ink-4">
            {t("account.usage.validUntil", {
              date: new Date(usage.validUntil).toLocaleDateString("fr-FR"),
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
