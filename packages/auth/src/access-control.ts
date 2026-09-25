import {
  isPlatformPermission,
  type OrgRole,
  PERMISSIONS,
  type Permission,
  permissionsOf,
} from "@pupitre/shared/permissions"
import { createAccessControl } from "better-auth/plugins/access"
import {
  defaultStatements as platformStatements,
  userAc,
} from "better-auth/plugins/admin/access"
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access"

type ScopeOf<Slug extends string> = Slug extends `${infer Scope}:${string}`
  ? Scope
  : never

type ActionOf<
  Slug extends string,
  Scope extends string,
> = Slug extends `${Scope}:${infer Action}` ? Action : never

type OrganizationPermission = Exclude<Permission, `admin:${string}`>

type OrganizationStatement = {
  [Scope in ScopeOf<OrganizationPermission>]: ActionOf<
    OrganizationPermission,
    Scope
  >[]
}

function statementOf(slugs: Iterable<string>): Record<string, string[]> {
  const statement: Record<string, string[]> = {}

  for (const slug of slugs) {
    const separator = slug.indexOf(":")
    const resource = slug.slice(0, separator)
    const action = slug.slice(separator + 1)

    statement[resource] = [...(statement[resource] ?? []), action]
  }

  return statement
}

const organizationStatement = statementOf(
  PERMISSIONS.filter((slug) => !isPlatformPermission(slug))
) as OrganizationStatement

export const ac = createAccessControl({
  ...defaultStatements,
  ...organizationStatement,
})

type RoleStatement = Parameters<typeof ac.newRole>[0]

function organizationRole(base: { statements: object }, role: OrgRole) {
  return ac.newRole({
    ...base.statements,
    ...statementOf(permissionsOf(role)),
  } as RoleStatement)
}

export const roles = {
  owner: organizationRole(ownerAc, "owner"),
  admin: organizationRole(adminAc, "admin"),
  member: organizationRole(memberAc, "member"),
}

export const platformAc = createAccessControl(platformStatements)

/** Team actions go through the platform's audited routes, so these roles grant nothing in Better Auth. */
export const platformRoles = {
  user: platformAc.newRole(userAc.statements),
  platform_admin: platformAc.newRole({}),
}
