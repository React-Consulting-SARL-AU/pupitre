import {
  STATUS_STALE_AFTER_MINUTES,
  type StatusFreshness,
} from "@pupitre/shared/status"
import type { StatusLook } from "@/lib/domain/server-status"
import type { Translate } from "@/lib/i18n/i18n"
import { formatRelative } from "@/lib/utils/format"

const HEALTH_LOOKS: Record<"ok" | "down", StatusLook> = {
  ok: { shape: "filled", tone: "ok", label: "service.responds" },
  down: { shape: "barred", tone: "danger", label: "service.doesNotRespond" },
}

export function healthLook(health: string): StatusLook {
  return health === "ok" ? HEALTH_LOOKS.ok : HEALTH_LOOKS.down
}

export function releaseLook(published: boolean): StatusLook {
  return published
    ? { shape: "filled", tone: "ok", label: "statusPage.releasePublished" }
    : { shape: "hollow", tone: "muted", label: "statusPage.noRelease" }
}

export interface FreshnessNotice {
  look: StatusLook
  headline: string
  detail: string
}

export function freshnessNotice(
  freshness: StatusFreshness,
  lastObservationAt: string | null,
  t: Translate,
  now: Date = new Date()
): FreshnessNotice | null {
  if (freshness === "fresh") {
    return null
  }

  if (freshness === "unknown") {
    return {
      look: { shape: "hollow", tone: "muted", label: "service.noObservation" },
      headline: t("service.noObservationHeadline"),
      detail: t("service.noObservationDetail"),
    }
  }

  return {
    look: { shape: "hollow", tone: "warn", label: "service.staleLabel" },
    headline: t("service.staleHeadline", {
      when: formatRelative(lastObservationAt, t, now),
    }),
    detail: t("service.staleDetail", { minutes: STATUS_STALE_AFTER_MINUTES }),
  }
}

export function observationLabel(
  freshness: StatusFreshness,
  lastObservationAt: string | null,
  t: Translate,
  now: Date = new Date()
): string {
  if (freshness === "unknown" || !lastObservationAt) {
    return t("service.observationNone")
  }

  return t("service.observationLast", {
    when: formatRelative(lastObservationAt, t, now),
  })
}

export function activeServersLabel(
  freshness: StatusFreshness,
  t: Translate
): string {
  return freshness === "fresh"
    ? t("service.activeServers")
    : t("service.activeServersStale")
}

export function activeServersValue(
  freshness: StatusFreshness,
  activeServers: number,
  t: Translate
): string {
  return freshness === "unknown" ? t("format.none") : String(activeServers)
}
