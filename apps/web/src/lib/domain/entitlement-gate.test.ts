import { describe, expect, it } from "bun:test"
import { opensWhileSuspended, startRedirectFor } from "./entitlement-gate"

describe("la porte de l'essai", () => {
  it("laisse passer une organisation qui a un droit d'usage", () => {
    expect(
      startRedirectFor({ entitlement: "valid", pathname: "/dashboard/servers" })
    ).toBeNull()
    expect(
      startRedirectFor({ entitlement: "grace", pathname: "/dashboard/servers" })
    ).toBeNull()
  })

  it("renvoie sur l'étape de démarrage tant que rien n'est souscrit", () => {
    for (const pathname of [
      "/dashboard",
      "/dashboard/servers",
      "/dashboard/servers/abc",
      "/dashboard/members",
      "/dashboard/audit",
      "/dashboard/devices",
    ]) {
      expect(
        startRedirectFor({ entitlement: "suspended", pathname }),
        pathname
      ).toEqual({})
    }
  })

  it("laisse ouverts la facturation, le profil et l'étape elle-même", () => {
    for (const pathname of [
      "/dashboard/billing",
      "/dashboard/settings",
      "/dashboard/start",
      "/dashboard/settings/",
      "/dashboard/organization",
      "/dashboard/download",
    ]) {
      expect(
        startRedirectFor({ entitlement: "suspended", pathname }),
        pathname
      ).toBeNull()
    }
  })

  it("ramène le retour de Stripe sur l'étape, qui attend le webhook", () => {
    expect(
      startRedirectFor({
        entitlement: "suspended",
        pathname: "/dashboard/billing",
        checkout: "done",
      })
    ).toEqual({ checkout: "done" })
  })

  it("ne boucle pas sur l'étape au retour de Stripe", () => {
    expect(
      startRedirectFor({
        entitlement: "suspended",
        pathname: "/dashboard/start",
        checkout: "done",
      })
    ).toBeNull()
  })

  it("ne détourne pas un checkout abandonné hors de la facturation", () => {
    expect(
      startRedirectFor({
        entitlement: "suspended",
        pathname: "/dashboard/billing",
        checkout: "cancelled",
      })
    ).toBeNull()
  })
})

describe("ce qui s'ouvre sans abonnement", () => {
  it("nomme les pages que la barre latérale peut encore lister", () => {
    for (const pathname of [
      "/dashboard/start",
      "/dashboard/billing",
      "/dashboard/settings",
      "/dashboard/organization",
      "/dashboard/download",
    ]) {
      expect(opensWhileSuspended(pathname), pathname).toBe(true)
    }
  })

  it("écarte celles qui renverraient sur le démarrage", () => {
    for (const pathname of [
      "/dashboard",
      "/dashboard/servers",
      "/dashboard/servers/abc",
      "/dashboard/members",
      "/dashboard/audit",
      "/dashboard/devices",
    ]) {
      expect(opensWhileSuspended(pathname), pathname).toBe(false)
    }
  })

  it("ignore une barre oblique finale", () => {
    expect(opensWhileSuspended("/dashboard/settings/")).toBe(true)
  })
})
