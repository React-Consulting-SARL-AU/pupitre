import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { useFakeBilling } from "@pupitre/api/testing/billing"
import {
  createOrganizationWithMembers,
  createServer,
} from "@pupitre/api/testing/factories"
import { recordSteps } from "@/testing/workflow"
import {
  PURGE_ORGANIZATIONS_STEP,
  PURGE_USERS_STEP,
  runPurgeDeletions,
} from "./purge-deletions"

const DAY_MS = 86_400_000

describe("le workflow PurgeDeletions", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("efface d'abord les organisations échues, puis les comptes, chacun dans une étape nommée", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })

    await createServer({ organizationId: organization.id })
    await prisma.organization.update({
      where: { id: organization.id },
      data: { deletionAt: new Date(Date.now() - DAY_MS) },
    })
    await prisma.user.update({
      where: { id: members[0].user.id },
      data: { deletionAt: new Date(Date.now() - DAY_MS) },
    })

    const recorder = recordSteps()
    const report = await runPurgeDeletions(recorder.step)

    expect(report).toEqual({
      organizations: [organization.id],
      users: [members[0].user.id],
    })
    expect(recorder.names).toEqual([PURGE_ORGANIZATIONS_STEP, PURGE_USERS_STEP])
    expect(
      await prisma.organization.findUnique({ where: { id: organization.id } })
    ).toBeNull()
    expect(
      await prisma.user.findUnique({ where: { id: members[0].user.id } })
    ).toBeNull()
    expect(
      await prisma.server.count({ where: { organizationId: organization.id } })
    ).toBe(0)
    expect(
      await prisma.event.count({ where: { action: "organization.purged" } })
    ).toBe(1)
    expect(await prisma.event.count({ where: { action: "user.purged" } })).toBe(
      1
    )
  })

  it("laisse intacte une purge encore dans sa grâce", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })

    await prisma.organization.update({
      where: { id: organization.id },
      data: { deletionAt: new Date(Date.now() + DAY_MS) },
    })
    await prisma.user.update({
      where: { id: members[0].user.id },
      data: { deletionAt: new Date(Date.now() + DAY_MS) },
    })

    expect(await runPurgeDeletions(recordSteps().step)).toEqual({
      organizations: [],
      users: [],
    })
    expect(
      await prisma.organization.findUnique({ where: { id: organization.id } })
    ).not.toBeNull()
  })

  it("ne touche à rien quand aucune purge n'est programmée", async () => {
    await createOrganizationWithMembers({ roles: ["owner"] })

    expect(await runPurgeDeletions(recordSteps().step)).toEqual({
      organizations: [],
      users: [],
    })
  })
})
