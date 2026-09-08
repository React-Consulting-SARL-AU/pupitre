import { describe, expect, it } from "bun:test"
import {
  entitlementNotice,
  onboardingComplete,
  onboardingProgress,
  onboardingSteps,
} from "./onboarding"

const NOTHING = { entitlement: "suspended", devices: null, servers: null }

function statesOf(input: Parameters<typeof onboardingSteps>[0]) {
  return onboardingSteps(input).map((step) => `${step.id}:${step.state}`)
}

describe("les quatre pas du démarrage", () => {
  it("commence sur l'essai : le compte est déjà là", () => {
    expect(statesOf({ ...NOTHING, devices: 0, servers: [] })).toEqual([
      "account:done",
      "trial:current",
      "app:ahead",
      "server:ahead",
    ])
  })

  it("ne devine rien tant qu'une réponse manque", () => {
    expect(statesOf(NOTHING)).toEqual([
      "account:done",
      "trial:current",
      "app:ahead",
      "server:ahead",
    ])

    expect(
      statesOf({ entitlement: "valid", devices: null, servers: null })
    ).toEqual(["account:done", "trial:done", "app:ahead", "server:ahead"])
  })

  it("passe à l'app dès que l'essai est ouvert, en tolérance comme en cours", () => {
    for (const entitlement of ["valid", "grace"]) {
      expect(
        statesOf({ entitlement, devices: 0, servers: [] }),
        entitlement
      ).toEqual(["account:done", "trial:done", "app:current", "server:ahead"])
    }
  })

  it("passe au serveur dès qu'un appareil est lié", () => {
    expect(statesOf({ entitlement: "valid", devices: 1, servers: [] })).toEqual(
      ["account:done", "trial:done", "app:done", "server:current"]
    )
  })

  it("dit le serveur en cours tant qu'il s'enrôle, et sans point qui respire ailleurs", () => {
    const steps = onboardingSteps({
      entitlement: "valid",
      devices: 1,
      servers: [{ status: "enrolling" }],
    })

    expect(steps.map((step) => step.state)).toEqual([
      "done",
      "done",
      "done",
      "current",
    ])
    expect(
      steps.filter((step) => step.inProgress).map((step) => step.id)
    ).toEqual(["server"])
  })

  it("compte un serveur qui a été en ligne, jamais un serveur révoqué", () => {
    for (const status of ["active", "grace", "suspended"]) {
      expect(onboardingComplete([{ status }]), status).toBe(true)
    }

    for (const status of ["enrolling", "revoked"]) {
      expect(onboardingComplete([{ status }]), status).toBe(false)
    }

    expect(onboardingComplete([])).toBe(false)
    expect(onboardingComplete(null)).toBe(false)
  })

  it("termine la liste quand un serveur a été en ligne", () => {
    const steps = onboardingSteps({
      entitlement: "valid",
      devices: 1,
      servers: [{ status: "revoked" }, { status: "active" }],
    })

    expect(steps.every((step) => step.state === "done")).toBe(true)
    expect(steps.some((step) => step.inProgress)).toBe(false)
    expect(onboardingProgress(steps)).toEqual({ done: 4, total: 4 })
  })

  it("dit un pas fait même quand un pas plus tôt reste inconnu", () => {
    expect(
      statesOf({
        entitlement: "valid",
        devices: null,
        servers: [{ status: "active" }],
      })
    ).toEqual(["account:done", "trial:done", "app:ahead", "server:done"])
  })

  it("compte les pas faits", () => {
    expect(onboardingProgress(onboardingSteps(NOTHING))).toEqual({
      done: 1,
      total: 4,
    })
    expect(
      onboardingProgress(
        onboardingSteps({ entitlement: "valid", devices: 0, servers: [] })
      )
    ).toEqual({ done: 2, total: 4 })
    expect(
      onboardingProgress(
        onboardingSteps({ entitlement: "valid", devices: 2, servers: [] })
      )
    ).toEqual({ done: 3, total: 4 })
  })

  it("porte un libellé et une phrase par pas", () => {
    for (const step of onboardingSteps(NOTHING)) {
      expect(step.title).toBe(`onboarding.${step.id}.title`)
      expect(step.lead).toBe(`onboarding.${step.id}.lead`)
    }
  })
})

describe("la pastille de droit d'usage", () => {
  it("ne dit rien quand tout est en règle", () => {
    expect(
      entitlementNotice({
        entitlement: "valid",
        subscription: "trialing",
        canManageBilling: true,
      })
    ).toBeNull()
  })

  it("ne dit jamais « suspendu » à un compte qui n'a rien souscrit", () => {
    expect(
      entitlementNotice({
        entitlement: "suspended",
        subscription: "none",
        canManageBilling: true,
      })
    ).toEqual({
      label: "entitlement.trialPending",
      to: "/dashboard/start",
      look: {
        shape: "hollow",
        tone: "muted",
        label: "entitlement.trialPending",
      },
    })
  })

  it("dit l'attente à qui ne peut pas lire la facturation", () => {
    expect(
      entitlementNotice({
        entitlement: "suspended",
        subscription: "unknown",
        canManageBilling: false,
      })
    ).toEqual({
      label: "entitlement.waitingTrial",
      to: "/dashboard/start",
      look: {
        shape: "hollow",
        tone: "muted",
        label: "entitlement.waitingTrial",
      },
    })
  })

  it("mène à la facturation quand un abonnement existe et se gère", () => {
    expect(
      entitlementNotice({
        entitlement: "suspended",
        subscription: "canceled",
        canManageBilling: true,
      })
    ).toEqual({
      label: "entitlement.suspended",
      to: "/dashboard/billing",
      look: {
        shape: "barred",
        tone: "danger",
        label: "entitlement.suspended",
      },
    })

    expect(
      entitlementNotice({
        entitlement: "grace",
        subscription: "past_due",
        canManageBilling: true,
      })
    ).toMatchObject({ label: "entitlement.grace", to: "/dashboard/billing" })
  })

  it("ne mène nulle part quand la facturation n'est pas la sienne", () => {
    expect(
      entitlementNotice({
        entitlement: "grace",
        subscription: "past_due",
        canManageBilling: false,
      })
    ).toMatchObject({ label: "entitlement.grace", to: null })
  })

  it("nomme l'absence d'organisation sans proposer de geste", () => {
    expect(
      entitlementNotice({
        entitlement: "none",
        subscription: "unknown",
        canManageBilling: true,
      })
    ).toMatchObject({ label: "entitlement.none", to: null })
  })
})
