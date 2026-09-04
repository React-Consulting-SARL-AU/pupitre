import type { StatusShape, StatusTone } from "@/lib/domain/server-status"

export const ALERT_KINDS = [
  "server_unreachable",
  "disk_high",
  "agent_outdated",
  "entitlement_grace",
] as const

export type AlertKind = (typeof ALERT_KINDS)[number]

export interface AlertLook {
  shape: StatusShape
  tone: StatusTone
  label: string
  fix: string
}

const LOOKS: Record<AlertKind, AlertLook> = {
  server_unreachable: {
    shape: "barred",
    tone: "danger",
    label: "Injoignable depuis 30 minutes",
    fix: "Ouvrez une session SSH sur la machine et vérifiez le service : systemctl status pupitred.",
  },
  disk_high: {
    shape: "barred",
    tone: "danger",
    label: "Disque au-dessus de 90 %",
    fix: "Effacez les journaux et les images inutiles, ou agrandissez le volume chez votre hébergeur.",
  },
  agent_outdated: {
    shape: "hollow",
    tone: "warn",
    label: "Agent périmé de deux versions",
    fix: "L'agent se met à jour à son prochain contact ; relancez la mise à jour depuis l'app si rien ne bouge.",
  },
  entitlement_grace: {
    shape: "hollow",
    tone: "warn",
    label: "Droit d'usage en tolérance",
    fix: "Mettez le moyen de paiement à jour depuis la facturation.",
  },
}

const UNKNOWN: AlertLook = {
  shape: "hollow",
  tone: "warn",
  label: "Alerte",
  fix: "Ouvrez la fiche du serveur pour en savoir plus.",
}

export function alertLook(kind: string): AlertLook {
  return LOOKS[kind as AlertKind] ?? UNKNOWN
}

export interface AlertCount {
  alerts: number
  servers: number
}

export function countAlerts(
  servers: { alerts: { kind: string }[] }[]
): AlertCount {
  const touched = servers.filter((server) => server.alerts.length > 0)

  return {
    alerts: touched.reduce((total, server) => total + server.alerts.length, 0),
    servers: touched.length,
  }
}

export function alertBannerLabel({ alerts, servers }: AlertCount): string {
  const subject = alerts > 1 ? "alertes actives" : "alerte active"
  const object = servers > 1 ? "serveurs" : "serveur"

  return `${alerts} ${subject} sur ${servers} ${object}`
}
