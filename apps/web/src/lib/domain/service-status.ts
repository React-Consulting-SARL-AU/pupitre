import {
  STATUS_STALE_AFTER_MINUTES,
  type StatusFreshness,
} from "@pupitre/shared/status"
import type { StatusLook } from "@/lib/domain/server-status"
import { formatRelative } from "@/lib/utils/format"

export interface FreshnessNotice {
  look: StatusLook
  headline: string
  detail: string
}

export function freshnessNotice(
  freshness: StatusFreshness,
  lastObservationAt: string | null,
  now: Date = new Date()
): FreshnessNotice | null {
  if (freshness === "fresh") {
    return null
  }

  if (freshness === "unknown") {
    return {
      look: { shape: "hollow", tone: "muted", label: "Sans observation" },
      headline: "Aucune observation à afficher",
      detail:
        "Aucun serveur actif ne rapporte à la plateforme : les chiffres ci-dessous ne disent rien de l'état réel.",
    }
  }

  return {
    look: { shape: "hollow", tone: "warn", label: "Données périmées" },
    headline: `Dernière observation ${formatRelative(lastObservationAt, now)}`,
    detail: `Plus de ${STATUS_STALE_AFTER_MINUTES} minutes sans nouvelles de la flotte : ce qui suit date de ce moment-là, pas de maintenant.`,
  }
}

export function observationLabel(
  freshness: StatusFreshness,
  lastObservationAt: string | null,
  now: Date = new Date()
): string {
  if (freshness === "unknown" || !lastObservationAt) {
    return "Aucune observation reçue."
  }

  return `Dernière observation ${formatRelative(lastObservationAt, now)}.`
}

export function activeServersLabel(freshness: StatusFreshness): string {
  return freshness === "fresh"
    ? "Serveurs actifs"
    : "Serveurs actifs à la dernière observation"
}

export function activeServersValue(
  freshness: StatusFreshness,
  activeServers: number
): string {
  return freshness === "unknown" ? "—" : String(activeServers)
}
