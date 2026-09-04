import type {
  StatusShape,
  StatusTone,
} from "@renderer/components/ui/status-dot";
import { StatusDot } from "@renderer/components/ui/status-dot";
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

function lookOf(usage: UsageRight): Look {
  if (usage.status === "granted") {
    if (usage.source === "development") {
      return {
        shape: "empty",
        title: "Build de développement",
        tone: "neutral",
      };
    }

    return usage.source === "platform"
      ? { shape: "filled", title: "Droit d'usage valide", tone: "ok" }
      : { shape: "ringed", title: "Droit d'usage en cache", tone: "warn" };
  }

  if (usage.status === "suspended") {
    return { shape: "struck", title: "Droit d'usage suspendu", tone: "danger" };
  }

  if (usage.status === "stale") {
    return { shape: "struck", title: "Droit d'usage expiré", tone: "danger" };
  }

  return { shape: "empty", title: "Aucun compte connecté", tone: "warn" };
}

function detailOf(usage: UsageRight, checkedAt: string | null): string {
  if (usage.status === "granted" && usage.source === "development") {
    return "Sans compte, Pupitre travaille en mode développement. Un build de production demande un compte.";
  }

  if (usage.status === "granted") {
    return `Vérifié ${since(Date.parse(checkedAt ?? ""))}. Pupitre reste utilisable sept jours sans la plateforme.`;
  }

  if (usage.status === "stale") {
    return `Dernière réponse de la plateforme ${since(Date.parse(usage.since))}, au-delà des sept jours de tolérance.`;
  }

  if (usage.status === "suspended") {
    return "Les serveurs de cette organisation ne peuvent plus être installés ni mis à jour.";
  }

  return "Un build de production refuse d'installer un serveur sans compte.";
}

export function AccountUsageNotice({
  usage,
  checkedAt,
}: {
  usage: UsageRight;
  checkedAt: string | null;
}) {
  const look = lookOf(usage);

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
        <p className="mt-1 text-[11px] text-ink-3 leading-relaxed">
          {detailOf(usage, checkedAt)}
        </p>
        {usage.status === "granted" && usage.validUntil ? (
          <p className="mt-1.5 font-data text-[11px] text-ink-4">
            valable jusqu'au{" "}
            {new Date(usage.validUntil).toLocaleDateString("fr-FR")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
