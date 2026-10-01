import { describe, expect, it } from "bun:test"
import {
  isAdminRoute,
  opensWithoutLicense,
  sendsToLicense,
} from "./license-gate"

describe("the licence gate", () => {
  it("lets through an organization that has the right of use", () => {
    expect(
      sendsToLicense({ license: "valid", pathname: "/dashboard/members" })
    ).toBe(false)
    expect(
      sendsToLicense({ license: "grace", pathname: "/dashboard/members" })
    ).toBe(false)
  })

  it("sends an organization that no longer has the right of use to the licence", () => {
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

  it("leaves the licence, servers, profile and platform open", () => {
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

  it("does not mistake a neighbouring page for the server list", () => {
    expect(opensWithoutLicense("/dashboard/serversx")).toBe(false)
  })
})

describe("isAdminRoute", () => {
  it("recognizes the platform pages, and only those", () => {
    expect(isAdminRoute("/dashboard/admin")).toBe(true)
    expect(isAdminRoute("/dashboard/admin/users")).toBe(true)
    expect(isAdminRoute("/dashboard/administration")).toBe(false)
    expect(isAdminRoute("/dashboard/servers")).toBe(false)
  })
})
