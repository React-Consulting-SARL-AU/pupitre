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

describe("the landing page", () => {
  it("opens the steps while the organization has no server", () => {
    expect(landingRoute({ used: 0 })).toBe("/dashboard/start")
  })

  it("opens the list as soon as a server occupies a seat, or with no response", () => {
    expect(landingRoute({ used: 1 })).toBe("/dashboard/servers")
    expect(landingRoute(null)).toBe("/dashboard/servers")
  })
})

describe("the three getting-started steps", () => {
  it("starts with the app: the account is already there", () => {
    expect(statesOf({ devices: 0, servers: [] })).toEqual([
      "account:done",
      "app:current",
      "server:ahead",
    ])
  })

  it("guesses nothing while a response is missing", () => {
    expect(statesOf(NOTHING)).toEqual([
      "account:done",
      "app:ahead",
      "server:ahead",
    ])
  })

  it("moves on to the server as soon as a device is linked", () => {
    expect(statesOf({ devices: 1, servers: [] })).toEqual([
      "account:done",
      "app:done",
      "server:current",
    ])
  })

  it("says the server is in progress while it enrols, with no pulsing dot elsewhere", () => {
    const steps = onboardingSteps({
      devices: 1,
      servers: [{ status: "enrolling" }],
    })

    expect(steps.map((step) => step.state)).toEqual(["done", "done", "current"])
    expect(
      steps.filter((step) => step.inProgress).map((step) => step.id)
    ).toEqual(["server"])
  })

  it("counts a server that has been online, never a revoked one", () => {
    for (const status of ["active", "grace", "suspended"]) {
      expect(onboardingComplete([{ status }]), status).toBe(true)
    }

    for (const status of ["enrolling", "revoked"]) {
      expect(onboardingComplete([{ status }]), status).toBe(false)
    }

    expect(onboardingComplete([])).toBe(false)
    expect(onboardingComplete(null)).toBe(false)
  })

  it("completes the list when a server has been online", () => {
    const steps = onboardingSteps({
      devices: 1,
      servers: [{ status: "revoked" }, { status: "active" }],
    })

    expect(steps.every((step) => step.state === "done")).toBe(true)
    expect(steps.some((step) => step.inProgress)).toBe(false)
    expect(onboardingProgress(steps)).toEqual({ done: 3, total: 3 })
  })

  it("says a step is done even when an earlier step stays unknown", () => {
    expect(
      statesOf({ devices: null, servers: [{ status: "active" }] })
    ).toEqual(["account:done", "app:ahead", "server:done"])
  })

  it("counts the steps done", () => {
    expect(onboardingProgress(onboardingSteps(NOTHING))).toEqual({
      done: 1,
      total: 3,
    })
    expect(
      onboardingProgress(onboardingSteps({ devices: 2, servers: [] }))
    ).toEqual({ done: 2, total: 3 })
  })

  it("carries a label and a sentence per step", () => {
    for (const step of onboardingSteps(NOTHING)) {
      expect(step.title).toBe(`onboarding.${step.id}.title`)
      expect(step.lead).toBe(`onboarding.${step.id}.lead`)
    }
  })
})

describe("the licence badge", () => {
  it("says nothing when everything is in order, being free included", () => {
    expect(
      licenseNotice({ license: "valid", canManageBilling: true })
    ).toBeNull()
  })

  it("leads to the licence when it is required and manageable", () => {
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

  it("leads nowhere when the licence is not theirs", () => {
    expect(
      licenseNotice({ license: "suspended", canManageBilling: false })
    ).toMatchObject({ label: "license.suspended", to: null })
  })

  it("names the absence of an organization without offering an action", () => {
    expect(
      licenseNotice({ license: "none", canManageBilling: true })
    ).toMatchObject({ label: "license.none", to: null })
  })
})
