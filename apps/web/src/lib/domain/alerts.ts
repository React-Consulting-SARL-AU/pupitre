import type { StatusShape, StatusTone } from "@/lib/domain/server-status"
import type { DictionaryKey } from "@/lib/i18n/en"

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
  label: DictionaryKey
  fix: DictionaryKey
}

const LOOKS: Record<AlertKind, AlertLook> = {
  server_unreachable: {
    shape: "barred",
    tone: "danger",
    label: "alert.server_unreachable",
    fix: "alert.server_unreachable.fix",
  },
  disk_high: {
    shape: "barred",
    tone: "danger",
    label: "alert.disk_high",
    fix: "alert.disk_high.fix",
  },
  agent_outdated: {
    shape: "hollow",
    tone: "warn",
    label: "alert.agent_outdated",
    fix: "alert.agent_outdated.fix",
  },
  entitlement_grace: {
    shape: "hollow",
    tone: "warn",
    label: "alert.entitlement_grace",
    fix: "alert.entitlement_grace.fix",
  },
}

const UNKNOWN: AlertLook = {
  shape: "hollow",
  tone: "warn",
  label: "alert.unknown",
  fix: "alert.unknown.fix",
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
