import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { Prisma } from "@pupitre/db/client"
import {
  OrganizationScopeViolationError,
  serializeData,
  withOrganization,
} from "../../lib/api/prisma"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"

describe("serializeData", () => {
  it("turns dates, bigints and decimals into strings and walks nested values", () => {
    const at = new Date("2026-09-04T10:00:00.000Z")
    const serialized = serializeData({
      at,
      big: 42n,
      price: new Prisma.Decimal("19.90"),
      nested: { list: [at, null, { big: 1n }] },
      untouched: "text",
      nothing: null,
    })

    expect(serialized).toEqual({
      at: "2026-09-04T10:00:00.000Z",
      big: "42",
      price: "19.9",
      nested: { list: ["2026-09-04T10:00:00.000Z", null, { big: "1" }] },
      untouched: "text",
      nothing: null,
    })
  })
})

describe("withOrganization", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("confines reads, writes and deletes to the organization", async () => {
    const { prisma } = await bootApiTestServer()
    const mine = await createOrganizationWithMembers({ roles: ["owner"] })
    const theirs = await createOrganizationWithMembers({ roles: ["owner"] })
    const own = await createServer({ organizationId: mine.organization.id })
    const foreign = await createServer({
      organizationId: theirs.organization.id,
    })
    const scoped = withOrganization(prisma, mine.organization.id)

    expect((await scoped.server.findMany()).map((row) => row.id)).toEqual([
      own.server.id,
    ])
    expect(
      await scoped.server.findUnique({ where: { id: foreign.server.id } })
    ).toBeNull()
    expect(await scoped.server.count()).toBe(1)
    expect(
      (await scoped.server.updateMany({ data: { name: "renamed" } })).count
    ).toBe(1)
    expect(
      (
        await prisma.server.findUniqueOrThrow({
          where: { id: foreign.server.id },
        })
      ).name
    ).not.toBe("renamed")
    expect((await scoped.server.deleteMany()).count).toBe(1)
    expect(await prisma.server.count()).toBe(1)
  })

  it("keeps creates in the organization and refuses another one", async () => {
    const { prisma } = await bootApiTestServer()
    const mine = await createOrganizationWithMembers({ roles: ["owner"] })
    const theirs = await createOrganizationWithMembers({ roles: ["owner"] })
    const scoped = withOrganization(prisma, mine.organization.id)

    const created = await scoped.server.create({
      data: {
        name: "vps-1",
        arch: "amd64",
        organizationId: mine.organization.id,
      },
    })

    expect(created.organizationId).toBe(mine.organization.id)

    await expect(
      Promise.resolve(
        scoped.server.create({
          data: {
            name: "vps-2",
            arch: "amd64",
            organizationId: theirs.organization.id,
          },
        })
      )
    ).rejects.toBeInstanceOf(OrganizationScopeViolationError)
    await expect(
      Promise.resolve(
        scoped.server.findMany({
          where: { organizationId: theirs.organization.id },
        })
      )
    ).rejects.toBeInstanceOf(OrganizationScopeViolationError)
  })

  it("leaves models without an organization column alone", async () => {
    const { prisma } = await bootApiTestServer()
    const mine = await createOrganizationWithMembers({ roles: ["owner"] })
    const scoped = withOrganization(prisma, mine.organization.id)

    expect(await scoped.user.count()).toBe(1)
  })
})
