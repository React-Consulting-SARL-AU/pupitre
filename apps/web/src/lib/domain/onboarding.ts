import { licenseLook, type StatusLook } from "@/lib/domain/server-status"
import type { DictionaryKey } from "@/lib/i18n/en"

export const ONBOARDING_STEPS = ["account", "app", "server"] as const

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]

export type OnboardingStepState = "done" | "current" | "ahead"

export interface OnboardingStep {
  id: OnboardingStepId
  state: OnboardingStepState
  inProgress: boolean
  title: DictionaryKey
  lead: DictionaryKey
}

export interface OnboardingServer {
  status: string
}

export interface OnboardingInput {
  devices: number | null
  servers: OnboardingServer[] | null
}

export interface OnboardingProgress {
  done: number
  total: number
}

interface StepCopy {
  title: DictionaryKey
  lead: DictionaryKey
}

const COPY: Record<OnboardingStepId, StepCopy> = {
  account: {
    title: "onboarding.account.title",
    lead: "onboarding.account.lead",
  },
  app: { title: "onboarding.app.title", lead: "onboarding.app.lead" },
  server: { title: "onboarding.server.title", lead: "onboarding.server.lead" },
}

export type LandingRoute = "/dashboard/start" | "/dashboard/servers"

// An organisation with no server yet has nothing to list: it starts on the steps.
export function landingRoute(servers: { used: number } | null): LandingRoute {
  return servers?.used === 0 ? "/dashboard/start" : "/dashboard/servers"
}

// Enrolling was never online; revoked no longer counts.
const EVER_ONLINE = new Set(["active", "grace", "suspended"])

export function onboardingComplete(
  servers: OnboardingServer[] | null
): boolean {
  return servers?.some((server) => EVER_ONLINE.has(server.status)) ?? false
}

// `null` until the answer lands: the step is then neither done nor current.
type Known = boolean | null

function doneFlags({ devices, servers }: OnboardingInput): Known[] {
  return [
    true,
    devices === null ? null : devices > 0,
    servers === null ? null : onboardingComplete(servers),
  ]
}

function stateOf(done: Known, passed: boolean): OnboardingStepState {
  if (done === true) {
    return "done"
  }

  return !passed && done === false ? "current" : "ahead"
}

export function onboardingSteps(input: OnboardingInput): OnboardingStep[] {
  const flags = doneFlags(input)
  const enrolling =
    input.servers?.some((server) => server.status === "enrolling") ?? false

  let passed = false

  return ONBOARDING_STEPS.map((id, index) => {
    const done = flags[index]
    const state = stateOf(done, passed)

    passed = passed || done !== true

    return {
      id,
      state,
      inProgress: id === "server" && state !== "done" && enrolling,
      ...COPY[id],
    }
  })
}

export function onboardingProgress(
  steps: OnboardingStep[]
): OnboardingProgress {
  return {
    done: steps.filter((step) => step.state === "done").length,
    total: steps.length,
  }
}

export interface LicenseNotice {
  label: DictionaryKey
  to: "/dashboard/billing" | null
  look: StatusLook
}

export interface LicenseNoticeInput {
  license: string
  canManageBilling: boolean
}

// A valid licence, free tier included, needs no word in the sidebar.
export function licenseNotice({
  license,
  canManageBilling,
}: LicenseNoticeInput): LicenseNotice | null {
  if (license === "valid") {
    return null
  }

  const look = licenseLook(license)

  if (!look) {
    return null
  }

  const actionable = license === "suspended" || license === "grace"

  return {
    label: look.label,
    to: actionable && canManageBilling ? "/dashboard/billing" : null,
    look,
  }
}
