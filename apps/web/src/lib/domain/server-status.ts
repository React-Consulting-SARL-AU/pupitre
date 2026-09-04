export const SERVER_STATUSES = [
  "enrolling",
  "active",
  "grace",
  "suspended",
  "revoked",
] as const

export type ServerStatus = (typeof SERVER_STATUSES)[number]

export type StatusShape = "filled" | "hollow" | "barred" | "breathing"

export type StatusTone = "ok" | "warn" | "danger" | "muted"

export interface StatusLook {
  shape: StatusShape
  tone: StatusTone
  label: string
}

const LOOKS: Record<ServerStatus, StatusLook> = {
  enrolling: { shape: "breathing", tone: "muted", label: "Enrôlement" },
  active: { shape: "filled", tone: "ok", label: "En ligne" },
  grace: { shape: "hollow", tone: "warn", label: "Tolérance" },
  suspended: { shape: "barred", tone: "danger", label: "Suspendu" },
  revoked: { shape: "barred", tone: "muted", label: "Révoqué" },
}

const STALE: StatusLook = {
  shape: "hollow",
  tone: "warn",
  label: "Sans nouvelles",
}

export function statusLook(status: string, stale = false): StatusLook {
  if (stale) {
    return STALE
  }

  return LOOKS[status as ServerStatus] ?? LOOKS.revoked
}

export const ENTITLEMENT_LABELS: Record<string, string> = {
  none: "Aucune organisation",
  valid: "Droit d'usage actif",
  grace: "Droit d'usage en tolérance",
  suspended: "Droit d'usage suspendu",
}
