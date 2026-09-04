import { describe, expect, it } from "bun:test"
import { hasPermission, ORG_ROLES } from "@pupitre/shared/permissions"
import { ac, platformRoles, roles } from "./access-control"

describe("organization roles", () => {
  it("exist for every shared organization role", () => {
    expect(Object.keys(roles).sort()).toEqual([...ORG_ROLES].sort())
  })

  it("mirror hasPermission from @pupitre/shared/permissions", () => {
    expect(roles.owner.authorize({ billing: ["manage"] }).success).toBe(true)
    expect(roles.admin.authorize({ billing: ["manage"] }).success).toBe(false)
    expect(roles.admin.authorize({ servers: ["assign"] }).success).toBe(true)
    expect(roles.member.authorize({ servers: ["assign"] }).success).toBe(false)
    expect(roles.member.authorize({ servers: ["view"] }).success).toBe(true)
    expect(roles.member.authorize({ members: ["invite"] }).success).toBe(false)

    expect(hasPermission("admin", "billing:manage")).toBe(false)
    expect(hasPermission("member", "servers:view")).toBe(true)
  })

  it("keep Better Auth's own organization statements per role", () => {
    expect(roles.owner.authorize({ organization: ["delete"] }).success).toBe(
      true
    )
    expect(roles.admin.authorize({ organization: ["delete"] }).success).toBe(
      false
    )
    expect(roles.admin.authorize({ invitation: ["create"] }).success).toBe(true)
    expect(roles.member.authorize({ invitation: ["create"] }).success).toBe(
      false
    )
  })

  it("never expose the platform scope to organization roles", () => {
    expect(Object.keys(ac.statements)).not.toContain("admin")
    expect(Object.keys(ac.statements)).toEqual(
      expect.arrayContaining([
        "servers",
        "devices",
        "members",
        "billing",
        "audit",
      ])
    )
  })
})

describe("platform roles", () => {
  it("reserve user management to platform_admin", () => {
    expect(
      platformRoles.platform_admin.authorize({ user: ["list"] }).success
    ).toBe(true)
    expect(platformRoles.user.authorize({ user: ["list"] }).success).toBe(false)
  })
})
