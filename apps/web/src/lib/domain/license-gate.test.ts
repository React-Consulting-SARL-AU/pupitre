import { describe, expect, it } from "bun:test"
import {
  isAdminRoute,
  opensWithoutLicense,
  sendsToLicense,
} from "./license-gate"

describe("la porte de la licence", () => {
  it("laisse passer une organisation qui a le droit d'usage", () => {
    expect(
      sendsToLicense({ license: "valid", pathname: "/dashboard/members" })
    ).toBe(false)
    expect(
      sendsToLicense({ license: "grace", pathname: "/dashboard/members" })
    ).toBe(false)
  })

  it("renvoie sur la licence une organisation qui n'a plus le droit d'usage", () => {
    for (const pathname of [
      "/dashboard",
      "/dashboard/start",
      "/dashboard/members",
      "/dashboard/audit",
      "/dashboard/backups",
      "/dashboard/devices",
    ]) {
      expect(sendsToLicense({ license: "suspended", pathname }), pathname).toBe(
        true
      )
    }
  })

  it("laisse ouverts la licence, les serveurs, le profil et la plateforme", () => {
    for (const pathname of [
      "/dashboard/billing",
      "/dashboard/servers",
      "/dashboard/servers/abc",
      "/dashboard/settings",
      "/dashboard/settings/",
      "/dashboard/organization",
      "/dashboard/download",
      "/dashboard/admin",
      "/dashboard/admin/",
      "/dashboard/admin/users",
      "/dashboard/admin/affiliate-links",
    ]) {
      expect(opensWithoutLicense(pathname), pathname).toBe(true)
      expect(sendsToLicense({ license: "suspended", pathname }), pathname).toBe(
        false
      )
    }
  })

  it("ne prend pas une page voisine pour la liste des serveurs", () => {
    expect(opensWithoutLicense("/dashboard/serversx")).toBe(false)
  })
})

describe("isAdminRoute", () => {
  it("reconnaît les pages de la plateforme, et elles seules", () => {
    expect(isAdminRoute("/dashboard/admin")).toBe(true)
    expect(isAdminRoute("/dashboard/admin/users")).toBe(true)
    expect(isAdminRoute("/dashboard/administration")).toBe(false)
    expect(isAdminRoute("/dashboard/servers")).toBe(false)
  })
})
