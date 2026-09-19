import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { PURGE_BATCH_SIZE } from "@pupitre/api/platform/purge"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { useFakeBilling } from "@pupitre/api/testing/billing"
import {
  createOrganizationWithMembers,
  createServer,
  subscribeOrganization,
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

  it("efface vingt-cinq comptes par passe, et prend le reste à la suivante", async () => {
    const { prisma } = await bootApiTestServer()
    const due = new Date(Date.now() - DAY_MS)
    const ids: string[] = []

    for (let index = 0; index < PURGE_BATCH_SIZE + 1; index += 1) {
      const user = await prisma.user.create({
        data: {
          id: `usr_purge_${index}`,
          name: `purge-${index}`,
          email: `purge-${index}@test.local`,
          deletionAt: new Date(due.getTime() + index),
          deletionReason: "demande RGPD",
        },
      })

      ids.push(user.id)
    }

    const first = await runPurgeDeletions(recordSteps().step)

    expect(first.users).toHaveLength(PURGE_BATCH_SIZE)
    expect(await prisma.user.count({ where: { id: { in: ids } } })).toBe(1)

    const second = await runPurgeDeletions(recordSteps().step)

    expect(second.users).toEqual(ids.slice(PURGE_BATCH_SIZE))
    expect(await prisma.user.count({ where: { id: { in: ids } } })).toBe(0)
    expect(await runPurgeDeletions(recordSteps().step)).toEqual({
      organizations: [],
      users: [],
    })
  })

  it("emporte la facturation, la provenance et les invitations, et laisse le journal sans organisation", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const link = await prisma.affiliateLink.create({
      data: { code: "atelier", name: "Atelier", freeMonths: 2 },
    })

    await prisma.organizationBilling.create({
      data: {
        organizationId: organization.id,
        stripeCustomerId: `cus_${organization.id}`,
      },
    })
    await prisma.referral.create({
      data: { organizationId: organization.id, linkId: link.id },
    })
    await prisma.invitation.create({
      data: {
        id: `inv_${organization.id}`,
        organizationId: organization.id,
        email: "invitee@test.local",
        expiresAt: new Date(Date.now() + DAY_MS),
        inviterId: members[0].user.id,
      },
    })
    await subscribeOrganization({ organizationId: organization.id })
    await prisma.event.create({
      data: {
        action: "organization.closed",
        actorUserId: null,
        organizationId: organization.id,
        targetType: "organization",
        targetId: organization.id,
      },
    })
    await prisma.organization.update({
      where: { id: organization.id },
      data: { deletionAt: new Date(Date.now() - DAY_MS) },
    })

    expect((await runPurgeDeletions(recordSteps().step)).organizations).toEqual(
      [organization.id]
    )

    const where = { organizationId: organization.id }

    expect(await prisma.organizationBilling.count({ where })).toBe(0)
    expect(await prisma.referral.count({ where })).toBe(0)
    expect(await prisma.invitation.count({ where })).toBe(0)
    expect(await prisma.subscription.count({ where })).toBe(0)
    expect(await prisma.member.count({ where })).toBe(0)
    expect(await prisma.affiliateLink.count({ where: { id: link.id } })).toBe(1)
    expect(await prisma.event.count({ where })).toBe(0)

    const kept = await prisma.event.findFirstOrThrow({
      where: { action: "organization.closed", targetId: organization.id },
    })

    expect(kept.organizationId).toBeNull()
  })

  it("saute le compte devenu seul propriétaire d'une organisation qui porte encore une machine", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })

    await createServer({ organizationId: organization.id })
    await prisma.user.update({
      where: { id: members[0].user.id },
      data: { deletionAt: new Date(Date.now() - DAY_MS) },
    })

    expect(await runPurgeDeletions(recordSteps().step)).toEqual({
      organizations: [],
      users: [],
    })
    expect(await prisma.user.count({ where: { id: members[0].user.id } })).toBe(
      1
    )

    const skipped = await prisma.event.findFirstOrThrow({
      where: {
        action: "user.purge_skipped",
        targetId: members[0].user.id,
      },
    })

    expect(skipped.payload).toMatchObject({
      reason: "sole_owner",
      organization_id: organization.id,
    })
  })
})
