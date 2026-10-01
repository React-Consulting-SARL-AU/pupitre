import { describe, expect, it } from "bun:test"
import {
  landingRoute,
  licenseNotice,
  onboardingComplete,
  onboardingProgress,
  onboardingSteps,
} from "./onboarding"

const NOTHING = { devices: null, servers: null }

function statesOf(input: Parameters<typeof onboardingSteps>[0]) {
  return onboardingSteps(input).map((step) => `${step.id}:${step.state}`)
}

describe("la page d'arrivée", () => {
  it("ouvre les étapes tant que l'organisation n'a aucun serveur", () => {
    expect(landingRoute({ used: 0 })).toBe("/dashboard/start")
  })

  it("ouvre la liste dès qu'un serveur occupe un siège, ou sans réponse", () => {
    expect(landingRoute({ used: 1 })).toBe("/dashboard/servers")
    expect(landingRoute(null)).toBe("/dashboard/servers")
  })
})

describe("les trois pas du démarrage", () => {
  it("commence sur l'app : le compte est déjà là", () => {
    expect(statesOf({ devices: 0, servers: [] })).toEqual([
      "account:done",
      "app:current",
      "server:ahead",
    ])
  })

  it("ne devine rien tant qu'une réponse manque", () => {
    expect(statesOf(NOTHING)).toEqual([
      "account:done",
      "app:ahead",
      "server:ahead",
    ])
  })

  it("passe au serveur dès qu'un appareil est lié", () => {
    expect(statesOf({ devices: 1, servers: [] })).toEqual([
      "account:done",
      "app:done",
      "server:current",
    ])
  })

  it("dit le serveur en cours tant qu'il s'enrôle, et sans point qui respire ailleurs", () => {
    const steps = onboardingSteps({
      devices: 1,
      servers: [{ status: "enrolling" }],
    })

    expect(steps.map((step) => step.state)).toEqual(["done", "done", "current"])
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
      devices: 1,
      servers: [{ status: "revoked" }, { status: "active" }],
    })

    expect(steps.every((step) => step.state === "done")).toBe(true)
    expect(steps.some((step) => step.inProgress)).toBe(false)
    expect(onboardingProgress(steps)).toEqual({ done: 3, total: 3 })
  })

  it("dit un pas fait même quand un pas plus tôt reste inconnu", () => {
    expect(
      statesOf({ devices: null, servers: [{ status: "active" }] })
    ).toEqual(["account:done", "app:ahead", "server:done"])
  })

  it("compte les pas faits", () => {
    expect(onboardingProgress(onboardingSteps(NOTHING))).toEqual({
      done: 1,
      total: 3,
    })
    expect(
      onboardingProgress(onboardingSteps({ devices: 2, servers: [] }))
    ).toEqual({ done: 2, total: 3 })
  })

  it("porte un libellé et une phrase par pas", () => {
    for (const step of onboardingSteps(NOTHING)) {
      expect(step.title).toBe(`onboarding.${step.id}.title`)
      expect(step.lead).toBe(`onboarding.${step.id}.lead`)
    }
  })
})

describe("la pastille de licence", () => {
  it("ne dit rien quand tout est en règle, gratuité comprise", () => {
    expect(
      licenseNotice({ license: "valid", canManageBilling: true })
    ).toBeNull()
  })

  it("mène à la licence quand elle est requise et se gère", () => {
    expect(
      licenseNotice({ license: "suspended", canManageBilling: true })
    ).toEqual({
      label: "license.suspended",
      to: "/dashboard/billing",
      look: { shape: "barred", tone: "danger", label: "license.suspended" },
    })

    expect(
      licenseNotice({ license: "grace", canManageBilling: true })
    ).toMatchObject({ label: "license.grace", to: "/dashboard/billing" })
  })

  it("ne mène nulle part quand la licence n'est pas la sienne", () => {
    expect(
      licenseNotice({ license: "suspended", canManageBilling: false })
    ).toMatchObject({ label: "license.suspended", to: null })
  })

  it("nomme l'absence d'organisation sans proposer de geste", () => {
    expect(
      licenseNotice({ license: "none", canManageBilling: true })
    ).toMatchObject({ label: "license.none", to: null })
  })
})
