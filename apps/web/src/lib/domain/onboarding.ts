import { entitlementLook, type StatusLook } from "@/lib/domain/server-status"
import type { DictionaryKey } from "@/lib/i18n/en"

export const ONBOARDING_STEPS = ["account", "trial", "app", "server"] as const

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
  entitlement: string
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
  trial: { title: "onboarding.trial.title", lead: "onboarding.trial.lead" },
  app: { title: "onboarding.app.title", lead: "onboarding.app.lead" },
  server: { title: "onboarding.server.title", lead: "onboarding.server.lead" },
}

const ENTITLED = new Set(["valid", "grace"])

/** A server that has been online once: enrolling never was, revoked no longer counts. */
const EVER_ONLINE = new Set(["active", "grace", "suspended"])

export function onboardingComplete(
  servers: OnboardingServer[] | null
): boolean {
  return servers?.some((server) => EVER_ONLINE.has(server.status)) ?? false
}

/** `null` where the answer has not landed: the step is neither done nor current. */
type Known = boolean | null

function doneFlags({
  entitlement,
  devices,
  servers,
}: OnboardingInput): Known[] {
  return [
    true,
    ENTITLED.has(entitlement),
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

export type EntitlementNoticeTarget = "/dashboard/start" | "/dashboard/billing"

export interface EntitlementNotice {
  label: DictionaryKey
  to: EntitlementNoticeTarget | null
  look: StatusLook
}

export interface EntitlementNoticeInput {
  entitlement: string
  /** `unknown` while nothing has been read, `none` for an organisation Stripe ignores. */
  subscription: string
  canManageBilling: boolean
}

function beforeTheTrial(label: DictionaryKey): EntitlementNotice {
  return {
    label,
    to: "/dashboard/start",
    look: { shape: "hollow", tone: "muted", label },
  }
}

export function entitlementNotice({
  entitlement,
  subscription,
  canManageBilling,
}: EntitlementNoticeInput): EntitlementNotice | null {
  if (entitlement === "valid") {
    return null
  }

  if (entitlement === "suspended" && subscription === "none") {
    return beforeTheTrial("entitlement.trialPending")
  }

  if (entitlement === "suspended" && subscription === "unknown") {
    return beforeTheTrial("entitlement.waitingTrial")
  }

  const look = entitlementLook(entitlement)

  if (!look) {
    return null
  }

  const billable = entitlement === "suspended" || entitlement === "grace"

  return {
    label: look.label,
    to: billable && canManageBilling ? "/dashboard/billing" : null,
    look,
  }
}
