import { PLATFORM_ADMIN_ROLE } from "@pupitre/shared/permissions"
import {
  PLATFORM_ADMIN_MEMBER_ID,
  PLATFORM_ADMIN_USER_ID,
  PLATFORM_ORGANIZATION_ID,
  PLATFORM_ORGANIZATION_NAME,
  PLATFORM_ORGANIZATION_SLUG,
} from "@pupitre/shared/platform"
import {
  assertMigrationAllowed,
  targetOf,
  wranglerTarget,
} from "../src/migration-guard"
import { BINDING, fail, wrangler } from "./wrangler"

/**
 * Pupitre's own organization, and the owner's account as its owner and the
 * platform's administrator, under identifiers that never move:
 *
 *   bun run db:seed local owner@example.com
 *   PUPITRE_ALLOW_MIGRATE_ON=production bun run db:seed production owner@example.com
 *
 * D1 has neither transactions nor bound parameters: every statement stands on
 * its own, is idempotent on its own, and carries its values inline — which is
 * why the address is validated before anything is written.
 */

const EMAIL_RE =
  /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i

const EMAIL_MAX = 254

const OWNER_ROLE = "owner"

export function emailOf(value: string | undefined): string {
  const email = value?.trim() ?? ""

  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    throw new Error(
      [
        `${email ? `"${email}"` : "no address"} is not an email address.`,
        "  → bun run db:seed <local|production> <email>",
      ].join("\n")
    )
  }

  return email
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/** Prisma reads SQLite dates back in this shape, offset spelled out. */
export function stamp(date: Date): string {
  return date.toISOString().replace("Z", "+00:00")
}

const ORGANIZATION = quote(PLATFORM_ORGANIZATION_ID)
const ADMIN = quote(PLATFORM_ADMIN_USER_ID)
const MEMBERSHIP = quote(PLATFORM_ADMIN_MEMBER_ID)
const ROLE = quote(PLATFORM_ADMIN_ROLE)

function currentId(address: string): string {
  return `(SELECT "id" FROM "user" WHERE "email" = ${address})`
}

export interface TSeedInput {
  email: string
  now: Date
}

export function seedStatements({ email, now }: TSeedInput): string[] {
  const address = quote(email)
  const at = quote(stamp(now))
  const name = quote(email.slice(0, email.indexOf("@")))
  const current = currentId(address)

  return [
    `UPDATE "ServerRevokedDevice" SET "revokedByUserId" = ${ADMIN} WHERE "revokedByUserId" = ${current} AND "revokedByUserId" <> ${ADMIN};`,
    `UPDATE "AffiliateLink" SET "createdById" = ${ADMIN} WHERE "createdById" = ${current} AND "createdById" <> ${ADMIN};`,
    `UPDATE "deviceCode" SET "userId" = ${ADMIN} WHERE "userId" = ${current} AND "userId" <> ${ADMIN};`,
    `UPDATE "user" SET "id" = ${ADMIN}, "role" = ${ROLE}, "emailVerified" = 1, "updatedAt" = ${at} WHERE "email" = ${address} AND ("id" <> ${ADMIN} OR "role" IS NOT ${ROLE} OR "emailVerified" IS NOT 1);`,
    `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt", "role") SELECT ${ADMIN}, ${name}, ${address}, 1, ${at}, ${at}, ${ROLE} WHERE NOT EXISTS (SELECT 1 FROM "user" WHERE "email" = ${address});`,
    `INSERT OR IGNORE INTO "organization" ("id", "name", "slug", "createdAt") VALUES (${ORGANIZATION}, ${quote(PLATFORM_ORGANIZATION_NAME)}, ${quote(PLATFORM_ORGANIZATION_SLUG)}, ${at});`,
    `UPDATE "organization" SET "name" = ${quote(PLATFORM_ORGANIZATION_NAME)}, "slug" = ${quote(PLATFORM_ORGANIZATION_SLUG)} WHERE "id" = ${ORGANIZATION} AND ("name" <> ${quote(PLATFORM_ORGANIZATION_NAME)} OR "slug" <> ${quote(PLATFORM_ORGANIZATION_SLUG)});`,
    `INSERT INTO "member" ("id", "organizationId", "userId", "role", "createdAt") SELECT ${MEMBERSHIP}, ${ORGANIZATION}, ${ADMIN}, ${quote(OWNER_ROLE)}, ${at} WHERE NOT EXISTS (SELECT 1 FROM "member" WHERE "organizationId" = ${ORGANIZATION} AND "userId" = ${ADMIN});`,
    `UPDATE "member" SET "role" = ${quote(OWNER_ROLE)} WHERE "organizationId" = ${ORGANIZATION} AND "userId" = ${ADMIN} AND "role" <> ${quote(OWNER_ROLE)};`,
  ]
}

export interface TConflict {
  subject: string
  held: string
}

export function conflictStatement(email: string): string {
  const address = quote(email)

  return `${[
    `SELECT 'organization' AS subject, "id" AS held FROM "organization" WHERE "slug" = ${quote(PLATFORM_ORGANIZATION_SLUG)} AND "id" <> ${ORGANIZATION}`,
    `SELECT 'user', "email" FROM "user" WHERE "id" = ${ADMIN} AND "email" <> ${address}`,
    `SELECT 'member', "organizationId" || '/' || "userId" FROM "member" WHERE "id" = ${MEMBERSHIP} AND NOT ("organizationId" = ${ORGANIZATION} AND "userId" = ${ADMIN})`,
  ].join(" UNION ALL ")};`
}

function conflictLine({ subject, held }: TConflict, email: string): string {
  if (subject === "organization") {
    return `  the slug "${PLATFORM_ORGANIZATION_SLUG}" belongs to organization ${held}, not to ${PLATFORM_ORGANIZATION_ID}.`
  }

  if (subject === "user") {
    return `  ${PLATFORM_ADMIN_USER_ID} belongs to ${held}, not to ${email}.`
  }

  return `  ${PLATFORM_ADMIN_MEMBER_ID} belongs to the pair ${held}.`
}

export function conflictMessage(
  conflicts: TConflict[],
  email: string
): string | null {
  if (conflicts.length === 0) {
    return null
  }

  return [
    "Refused: another row already holds an identifier the seed writes.",
    ...conflicts.map((conflict) => conflictLine(conflict, email)),
    "  Nothing was written.",
  ].join("\n")
}

export interface TSeedState {
  userId: string | null
  userRole: string | null
  userVerified: number | null
  organizationId: string | null
  memberRole: string | null
}

export function stateStatement(email: string): string {
  const address = quote(email)
  const current = currentId(address)

  return [
    `SELECT ${current} AS "userId",`,
    `(SELECT "role" FROM "user" WHERE "email" = ${address}) AS "userRole",`,
    `(SELECT "emailVerified" FROM "user" WHERE "email" = ${address}) AS "userVerified",`,
    `(SELECT "id" FROM "organization" WHERE "id" = ${ORGANIZATION}) AS "organizationId",`,
    `(SELECT "role" FROM "member" WHERE "organizationId" = ${ORGANIZATION} AND "userId" = ${current}) AS "memberRole";`,
  ].join(" ")
}

function userLine(state: TSeedState, email: string): string {
  if (!state.userId) {
    return `user ${email} created as ${PLATFORM_ADMIN_USER_ID}, platform admin`
  }

  if (state.userId !== PLATFORM_ADMIN_USER_ID) {
    return `user ${email} re-idded ${state.userId} to ${PLATFORM_ADMIN_USER_ID}, platform admin`
  }

  if (state.userRole !== PLATFORM_ADMIN_ROLE || state.userVerified !== 1) {
    return `user ${email} already ${PLATFORM_ADMIN_USER_ID}, promoted to platform admin`
  }

  return `user ${email} already in place`
}

function organizationLine(state: TSeedState): string {
  if (state.organizationId) {
    return `organization ${PLATFORM_ORGANIZATION_SLUG} already in place`
  }

  return `organization ${PLATFORM_ORGANIZATION_SLUG} created as ${PLATFORM_ORGANIZATION_ID}`
}

function memberLine(state: TSeedState): string {
  if (!state.memberRole) {
    return `membership created as ${PLATFORM_ADMIN_MEMBER_ID}, owner of ${PLATFORM_ORGANIZATION_ID}`
  }

  if (state.memberRole !== OWNER_ROLE) {
    return `membership ${state.memberRole} to owner`
  }

  return "membership already in place"
}

export function seedReport(state: TSeedState, email: string): string[] {
  return [userLine(state, email), organizationLine(state), memberLine(state)]
}

interface TAnswer<T> {
  results?: T[]
}

function rowsOf<T>(json: string): T[] {
  return (JSON.parse(json) as TAnswer<T>[]).flatMap(
    (answer) => answer.results ?? []
  )
}

function main(): void {
  const target = targetOf(process.argv[2])
  const email = emailOf(process.argv[3])

  assertMigrationAllowed(target, (key) => process.env[key])

  const where = wranglerTarget(target)
  const read = (sql: string): string =>
    wrangler(["d1", "execute", BINDING, ...where, "--command", sql, "--json"], {
      capture: true,
    })

  const conflict = conflictMessage(
    rowsOf<TConflict>(read(conflictStatement(email))),
    email
  )

  if (conflict) {
    throw new Error(conflict)
  }

  const [state] = rowsOf<TSeedState>(read(stateStatement(email)))

  wrangler(
    [
      "d1",
      "execute",
      BINDING,
      ...where,
      "--command",
      seedStatements({ email, now: new Date() }).join(" "),
    ],
    { capture: true }
  )

  for (const line of seedReport(state, email)) {
    process.stdout.write(`${line}\n`)
  }
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    fail(error)
  }
}
