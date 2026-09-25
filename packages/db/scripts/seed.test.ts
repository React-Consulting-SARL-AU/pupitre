import { Database } from "bun:sqlite"
import { describe, expect, it } from "bun:test"
import {
  PLATFORM_ADMIN_MEMBER_ID,
  PLATFORM_ADMIN_USER_ID,
  PLATFORM_ORGANIZATION_ID,
} from "@pupitre/shared/platform"
import { replayMigrations } from "./new-migration"
import {
  conflictMessage,
  conflictStatement,
  emailOf,
  seedReport,
  seedStatements,
  stamp,
  stateStatement,
  type TSeedState,
} from "./seed"

const EMAIL = "owner@pupitre.studio"

const NOW = new Date("2026-09-18T10:00:00.000Z")

const AT = stamp(NOW)

const GENERATED = "h2swzyJasWx8IIKkByMkKiCTAwBt3IQg"

const NO_ADDRESS_RE = /no address/

const NOT_AN_ADDRESS_RE = /not an email address/

const TOUCHED = [
  "user",
  "session",
  "organization",
  "member",
  "Device",
  "Server",
  "ServerRevokedDevice",
  "AffiliateLink",
]

function migrated(): Database {
  const database = new Database(":memory:")

  replayMigrations(database)
  database.exec("PRAGMA foreign_keys = ON")

  return database
}

function seed(database: Database, email = EMAIL): void {
  for (const statement of seedStatements({ email, now: NOW })) {
    database.run(statement)
  }
}

function existingAccount(database: Database): void {
  database.run(
    `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt", "role") VALUES ('${GENERATED}', 'Jordan', '${EMAIL}', 0, '${AT}', '${AT}', 'user')`
  )
  database.run(
    `INSERT INTO "session" ("id", "expiresAt", "token", "createdAt", "updatedAt", "userId") VALUES ('ses_1', '${AT}', 'tok_1', '${AT}', '${AT}', '${GENERATED}')`
  )
  database.run(
    `INSERT INTO "organization" ("id", "name", "slug", "createdAt") VALUES ('org_perso', 'Perso', 'perso', '${AT}')`
  )
  database.run(
    `INSERT INTO "member" ("id", "organizationId", "userId", "role", "createdAt") VALUES ('mem_perso', 'org_perso', '${GENERATED}', 'owner', '${AT}')`
  )
  database.run(
    `INSERT INTO "Device" ("id", "userId", "name", "publicKey", "fingerprint", "createdAt") VALUES ('dev_1', '${GENERATED}', 'Mac', 'pk', 'fp', '${AT}')`
  )
  database.run(
    `INSERT INTO "Server" ("id", "organizationId", "name", "arch", "assignedUserId", "updatedAt") VALUES ('srv_1', 'org_perso', 'VPS', 'amd64', '${GENERATED}', '${AT}')`
  )
  database.run(
    `INSERT INTO "ServerRevokedDevice" ("serverId", "deviceId", "revokedByUserId", "revokedAt") VALUES ('srv_1', 'dev_1', '${GENERATED}', '${AT}')`
  )
  database.run(
    `INSERT INTO "AffiliateLink" ("id", "code", "name", "freeMonths", "seats", "createdById", "createdAt") VALUES ('aff_1', 'CODE', 'Parrainage', 1, 1, '${GENERATED}', '${AT}')`
  )
  database.run(
    `INSERT INTO "deviceCode" ("id", "deviceCode", "userCode", "userId", "expiresAt", "status") VALUES ('dc_1', 'device-1', 'USER-1', '${GENERATED}', '${AT}', 'approved')`
  )
}

function one<T>(database: Database, sql: string): T {
  return database.query(sql).get() as T
}

function dump(database: Database): string {
  return TOUCHED.map(
    (table) =>
      `${table}: ${JSON.stringify(database.query(`SELECT * FROM "${table}" ORDER BY rowid`).all())}`
  ).join("\n")
}

describe("the address the seed takes", () => {
  it("accepts an address and refuses anything that is not one", () => {
    expect(emailOf(" owner@pupitre.studio ")).toBe(EMAIL)
    expect(() => emailOf(undefined)).toThrow(NO_ADDRESS_RE)
    expect(() => emailOf("owner")).toThrow(NOT_AN_ADDRESS_RE)
    expect(() => emailOf("owner@studio")).toThrow(NOT_AN_ADDRESS_RE)
    expect(() => emailOf("o'; DROP TABLE user; --@x.io")).toThrow(
      NOT_AN_ADDRESS_RE
    )
  })
})

describe("the stamp the seed writes", () => {
  it("is the shape Prisma reads back from SQLite", () => {
    expect(stamp(NOW)).toBe("2026-09-18T10:00:00.000+00:00")
  })
})

describe("what the seed refuses", () => {
  it("names the row that already holds an identifier", () => {
    expect(conflictMessage([], EMAIL)).toBeNull()
    expect(
      conflictMessage([{ subject: "organization", held: "org_other" }], EMAIL)
    ).toContain("org_other")
    expect(
      conflictMessage([{ subject: "user", held: "someone@else.io" }], EMAIL)
    ).toContain("someone@else.io")
    expect(
      conflictMessage(
        [{ subject: "member", held: "org_other/usr_other" }],
        EMAIL
      )
    ).toContain("org_other/usr_other")
  })
})

describe("what the seed says it did", () => {
  it("reads the state it found before writing", () => {
    expect(
      seedReport(
        {
          userId: null,
          userRole: null,
          userVerified: null,
          organizationId: null,
          memberRole: null,
        },
        EMAIL
      )
    ).toEqual([
      `user ${EMAIL} created as ${PLATFORM_ADMIN_USER_ID}, platform admin`,
      `organization pupitre created as ${PLATFORM_ORGANIZATION_ID}`,
      `membership created as ${PLATFORM_ADMIN_MEMBER_ID}, owner of ${PLATFORM_ORGANIZATION_ID}`,
    ])

    expect(
      seedReport(
        {
          userId: GENERATED,
          userRole: "user",
          userVerified: 0,
          organizationId: PLATFORM_ORGANIZATION_ID,
          memberRole: "member",
        },
        EMAIL
      )
    ).toEqual([
      `user ${EMAIL} re-idded ${GENERATED} to ${PLATFORM_ADMIN_USER_ID}, platform admin`,
      "organization pupitre already in place",
      "membership member to owner",
    ])

    expect(
      seedReport(
        {
          userId: PLATFORM_ADMIN_USER_ID,
          userRole: "user",
          userVerified: 1,
          organizationId: PLATFORM_ORGANIZATION_ID,
          memberRole: "owner",
        },
        EMAIL
      )
    ).toEqual([
      `user ${EMAIL} already ${PLATFORM_ADMIN_USER_ID}, promoted to platform admin`,
      "organization pupitre already in place",
      "membership already in place",
    ])

    expect(
      seedReport(
        {
          userId: PLATFORM_ADMIN_USER_ID,
          userRole: "platform_admin",
          userVerified: 1,
          organizationId: PLATFORM_ORGANIZATION_ID,
          memberRole: "owner",
        },
        EMAIL
      )
    ).toEqual([
      `user ${EMAIL} already in place`,
      "organization pupitre already in place",
      "membership already in place",
    ])
  })
})

describe("the seed on a database the migrations built", () => {
  it("carries every reference to the account onto the fixed identifier", () => {
    const database = migrated()

    existingAccount(database)
    seed(database)

    expect(
      one<{ id: string; role: string; emailVerified: number }>(
        database,
        `SELECT "id", "role", "emailVerified" FROM "user" WHERE "email" = '${EMAIL}'`
      )
    ).toEqual({
      id: PLATFORM_ADMIN_USER_ID,
      role: "platform_admin",
      emailVerified: 1,
    })

    for (const [table, column, where] of [
      ["session", "userId", "\"id\" = 'ses_1'"],
      ["member", "userId", "\"id\" = 'mem_perso'"],
      ["Device", "userId", "\"id\" = 'dev_1'"],
      ["Server", "assignedUserId", "\"id\" = 'srv_1'"],
      ["ServerRevokedDevice", "revokedByUserId", "\"serverId\" = 'srv_1'"],
      ["AffiliateLink", "createdById", "\"id\" = 'aff_1'"],
      ["deviceCode", "userId", "\"id\" = 'dc_1'"],
    ]) {
      expect(
        one<Record<string, string>>(
          database,
          `SELECT "${column}" AS held FROM "${table}" WHERE ${where}`
        ).held
      ).toBe(PLATFORM_ADMIN_USER_ID)
    }

    expect(
      one<{ id: string; slug: string; name: string }>(
        database,
        `SELECT "id", "slug", "name" FROM "organization" WHERE "id" = '${PLATFORM_ORGANIZATION_ID}'`
      )
    ).toEqual({
      id: PLATFORM_ORGANIZATION_ID,
      slug: "pupitre",
      name: "Pupitre",
    })

    expect(
      one<{ id: string; role: string }>(
        database,
        `SELECT "id", "role" FROM "member" WHERE "organizationId" = '${PLATFORM_ORGANIZATION_ID}' AND "userId" = '${PLATFORM_ADMIN_USER_ID}'`
      )
    ).toEqual({ id: PLATFORM_ADMIN_MEMBER_ID, role: "owner" })

    database.close()
  })

  it("puts the platform organization's name and slug back", () => {
    const database = migrated()

    existingAccount(database)
    database.run(
      `INSERT INTO "organization" ("id", "name", "slug", "createdAt") VALUES ('${PLATFORM_ORGANIZATION_ID}', 'Renamed', 'renamed', '${AT}')`
    )
    seed(database)

    expect(
      one<{ slug: string; name: string }>(
        database,
        `SELECT "slug", "name" FROM "organization" WHERE "id" = '${PLATFORM_ORGANIZATION_ID}'`
      )
    ).toEqual({ slug: "pupitre", name: "Pupitre" })

    database.close()
  })

  it("changes nothing the second time", () => {
    const database = migrated()

    existingAccount(database)
    seed(database)

    const after = dump(database)

    seed(database)

    expect(dump(database)).toBe(after)

    database.close()
  })

  it("creates the account on a database that has none", () => {
    const database = migrated()

    seed(database)

    expect(
      one<{ id: string; name: string; role: string; locale: string }>(
        database,
        `SELECT "id", "name", "role", "locale" FROM "user" WHERE "email" = '${EMAIL}'`
      )
    ).toEqual({
      id: PLATFORM_ADMIN_USER_ID,
      name: "owner",
      role: "platform_admin",
      locale: "fr",
    })

    const before = dump(database)

    seed(database)

    expect(dump(database)).toBe(before)

    database.close()
  })

  it("reads the state it found, and the rows it would overwrite", () => {
    const database = migrated()

    existingAccount(database)

    expect(one<TSeedState>(database, stateStatement(EMAIL))).toEqual({
      userId: GENERATED,
      userRole: "user",
      userVerified: 0,
      organizationId: null,
      memberRole: null,
    })
    expect(database.query(conflictStatement(EMAIL)).all()).toEqual([])

    database.run(
      `INSERT INTO "organization" ("id", "name", "slug", "createdAt") VALUES ('org_autre', 'Autre', 'pupitre', '${AT}')`
    )

    expect(database.query(conflictStatement(EMAIL)).all()).toEqual([
      { subject: "organization", held: "org_autre" },
    ])

    database.close()
  })

  it("puts an owner back in place when the membership lost the role", () => {
    const database = migrated()

    existingAccount(database)
    seed(database)
    database.run(
      `UPDATE "member" SET "role" = 'member' WHERE "id" = '${PLATFORM_ADMIN_MEMBER_ID}'`
    )
    seed(database)

    expect(
      one<{ role: string }>(
        database,
        `SELECT "role" FROM "member" WHERE "id" = '${PLATFORM_ADMIN_MEMBER_ID}'`
      ).role
    ).toBe("owner")

    database.close()
  })
})
