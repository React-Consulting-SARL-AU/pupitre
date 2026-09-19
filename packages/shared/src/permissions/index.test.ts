import { describe, expect, it } from "bun:test"
import {
  expandPermissions,
  hasPermission,
  ORG_ROLES,
  PERMISSIONS,
  PermissionSchema,
  ROLE_PERMISSIONS,
  ROLES,
  RoleSchema,
} from "./index"

const SLUG_RE = /^[a-z]+:[a-z_]+$/

describe("roles", () => {
  it("lists the three organization roles plus platform_admin", () => {
    expect(ORG_ROLES).toEqual(["owner", "admin", "member"])
    expect(ROLES).toEqual(["owner", "admin", "member", "platform_admin"])
    expect(RoleSchema.safeParse("admin").success).toBe(true)
    expect(RoleSchema.safeParse("superuser").success).toBe(false)
  })
})

describe("permissions", () => {
  it("are <scope>:<action> slugs over the six scopes", () => {
    const scopes = new Set(PERMISSIONS.map((slug) => slug.split(":")[0]))

    expect([...scopes].sort()).toEqual(
      ["admin", "audit", "billing", "devices", "members", "servers"].sort()
    )
    for (const slug of PERMISSIONS) {
      expect(slug).toMatch(SLUG_RE)
    }
    expect(PermissionSchema.safeParse("servers:view").success).toBe(true)
    expect(PermissionSchema.safeParse("servers:fly").success).toBe(false)
  })

  it("expand implied permissions", () => {
    expect(expandPermissions(["servers:manage"])).toContain("servers:view")
    expect(expandPermissions(["members:manage"])).toContain("members:invite")
    expect(expandPermissions(["audit:view"])).toEqual(new Set(["audit:view"]))
  })
})

describe("hasPermission", () => {
  it("follows the platform API: billing is the owner's, audit and invitations the admin's", () => {
    expect(hasPermission("owner", "billing:manage")).toBe(true)
    expect(hasPermission("admin", "billing:manage")).toBe(false)
    expect(hasPermission("admin", "billing:view")).toBe(false)
    expect(hasPermission("admin", "audit:view")).toBe(true)
    expect(hasPermission("admin", "members:invite")).toBe(true)
    expect(hasPermission("member", "members:invite")).toBe(false)
    expect(hasPermission("member", "members:view")).toBe(true)
  })

  it("lets every member see servers and manage their own devices", () => {
    expect(hasPermission("member", "servers:view")).toBe(true)
    expect(hasPermission("member", "servers:assign")).toBe(false)
    expect(hasPermission("admin", "servers:assign")).toBe(true)
    expect(hasPermission("member", "devices:manage")).toBe(true)
  })

  it("keeps the admin scope for platform_admin only", () => {
    expect(hasPermission("platform_admin", "admin:servers")).toBe(true)
    expect(hasPermission("platform_admin", "admin:releases")).toBe(true)
    expect(hasPermission("platform_admin", "admin:users")).toBe(true)
    expect(hasPermission("platform_admin", "admin:affiliate_links")).toBe(true)
    expect(hasPermission("owner", "admin:servers")).toBe(false)
    expect(hasPermission("owner", "admin:affiliate_links")).toBe(false)
    expect(hasPermission("platform_admin", "billing:manage")).toBe(false)
  })

  it("resolves implied permissions and rejects unknown input", () => {
    expect(ROLE_PERMISSIONS.owner).toContain("servers:manage")
    expect(hasPermission("owner", "servers:view")).toBe(true)
    expect(hasPermission("owner", "servers:nuke" as never)).toBe(false)
    expect(hasPermission("guest" as never, "servers:view")).toBe(false)
  })
})
