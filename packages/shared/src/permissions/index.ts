import { z } from "zod"

export const ORG_ROLES = ["owner", "admin", "member"] as const

export type OrgRole = (typeof ORG_ROLES)[number]

export const PLATFORM_ADMIN_ROLE = "platform_admin"

export const ROLES = [...ORG_ROLES, PLATFORM_ADMIN_ROLE] as const

export const RoleSchema = z.enum(ROLES)

export type Role = z.infer<typeof RoleSchema>

const CATALOG = [
  { slug: "servers:view" },
  { slug: "servers:enroll", implies: ["servers:view"] },
  { slug: "servers:assign", implies: ["servers:view"] },
  { slug: "servers:delete", implies: ["servers:view"] },
  {
    slug: "servers:manage",
    implies: [
      "servers:view",
      "servers:enroll",
      "servers:assign",
      "servers:delete",
    ],
  },
  { slug: "devices:view" },
  { slug: "devices:manage", implies: ["devices:view"] },
  { slug: "members:view" },
  { slug: "members:invite", implies: ["members:view"] },
  { slug: "members:manage", implies: ["members:view", "members:invite"] },
  { slug: "billing:view" },
  { slug: "billing:manage", implies: ["billing:view"] },
  { slug: "audit:view" },
  // Plural: Better Auth's own `organization` statement would be overwritten.
  { slug: "organizations:manage" },
  { slug: "admin:servers" },
  { slug: "admin:releases" },
  { slug: "admin:users" },
  { slug: "admin:affiliate_links" },
] as const

export type Permission = (typeof CATALOG)[number]["slug"]

export const PERMISSIONS: readonly Permission[] = CATALOG.map(
  (entry) => entry.slug
)

export const PermissionSchema = z.enum(
  PERMISSIONS as [Permission, ...Permission[]]
)

const PERMISSION_HIERARCHY = Object.fromEntries(
  CATALOG.flatMap((entry) =>
    "implies" in entry ? [[entry.slug, entry.implies]] : []
  )
) as Partial<Record<Permission, readonly Permission[]>>

export function expandPermissions(permissions: readonly string[]): Set<string> {
  const expanded = new Set<string>(permissions)

  for (const permission of permissions) {
    const implied = PERMISSION_HIERARCHY[permission as Permission]

    if (implied) {
      for (const slug of implied) {
        expanded.add(slug)
      }
    }
  }

  return expanded
}

const MEMBER_PERMISSIONS: readonly Permission[] = [
  "servers:view",
  "devices:manage",
  "members:view",
]

const ADMIN_PERMISSIONS: readonly Permission[] = [
  ...MEMBER_PERMISSIONS,
  "servers:manage",
  "members:manage",
  "audit:view",
  "organizations:manage",
]

const OWNER_PERMISSIONS: readonly Permission[] = [
  ...ADMIN_PERMISSIONS,
  "billing:manage",
]

const PLATFORM_ADMIN_PERMISSIONS: readonly Permission[] = [
  "admin:servers",
  "admin:releases",
  "admin:users",
  "admin:affiliate_links",
]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: OWNER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  member: MEMBER_PERMISSIONS,
  platform_admin: PLATFORM_ADMIN_PERMISSIONS,
}

export function permissionsOf(role: Role): Set<string> {
  return expandPermissions(ROLE_PERMISSIONS[role] ?? [])
}

export function hasPermission(role: Role, slug: Permission): boolean {
  return permissionsOf(role).has(slug)
}

export function isPlatformPermission(slug: string): boolean {
  return slug.startsWith("admin:")
}

export function isOrgRole(value: unknown): value is OrgRole {
  return (ORG_ROLES as readonly unknown[]).includes(value)
}
