import type { AccountLicense, ServerStatus } from "@pupitre/shared/platform-api"
import type { DictionaryKey } from "@/lib/i18n/en"

export type StatusShape = "filled" | "hollow" | "barred" | "breathing"

export type StatusTone = "ok" | "warn" | "danger" | "muted"

export interface StatusLook {
  shape: StatusShape
  tone: StatusTone
  label: DictionaryKey
}

const LOOKS: Record<ServerStatus, StatusLook> = {
  enrolling: { shape: "breathing", tone: "muted", label: "status.enrolling" },
  active: { shape: "filled", tone: "ok", label: "status.active" },
  grace: { shape: "hollow", tone: "warn", label: "status.grace" },
  suspended: { shape: "barred", tone: "danger", label: "status.suspended" },
  revoked: { shape: "barred", tone: "muted", label: "status.revoked" },
}

const STALE: StatusLook = {
  shape: "hollow",
  tone: "warn",
  label: "status.stale",
}

export function statusLook(status: string, stale = false): StatusLook {
  if (stale) {
    return STALE
  }

  return LOOKS[status as ServerStatus] ?? LOOKS.revoked
}

const LICENSE_LOOKS: Record<AccountLicense, StatusLook> = {
  none: { shape: "hollow", tone: "warn", label: "license.none" },
  valid: { shape: "filled", tone: "ok", label: "license.valid" },
  grace: { shape: "hollow", tone: "warn", label: "license.grace" },
  suspended: {
    shape: "barred",
    tone: "danger",
    label: "license.suspended",
  },
}

export function licenseLook(license: string): StatusLook | null {
  return LICENSE_LOOKS[license as AccountLicense] ?? null
}
