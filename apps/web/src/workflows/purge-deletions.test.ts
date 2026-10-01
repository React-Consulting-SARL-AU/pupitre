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
  SWEEPS,
} from "./purge-deletions"
import { batchStep } from "./steps"

const DAY_MS = 86_400_000

const NOTHING_SWEPT = {
  metrics: 0,
  sessions: 0,
  verifications: 0,
  device_codes: 0,
}

const SWEEP_STEPS = Object.values(SWEEPS).map((sweep) =>
  batchStep(sweep.step, 0)
)

async function dueUser(id: string, deletionAt: Date) {
  const { prisma } = await bootApiTestServer()

  return await prisma.user.create({
    data: {
      id,
      name: id,
      email: `${id}@test.local`,
      deletionAt,
      deletionReason: "demande RGPD",
    },
  })
}

describe("the PurgeDeletions workflow", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("deletes the due organizations first, then the accounts, then sweeps, each in a named step", async () => {
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
      swept: NOTHING_SWEPT,
    })
    expect(recorder.names).toEqual([
      batchStep(PURGE_ORGANIZATIONS_STEP, 0),
      batchStep(PURGE_USERS_STEP, 0),
      ...SWEEP_STEPS,
    ])
    expect(
      await prisma.organization.findUnique({ where: { id: organization.id } })
    ).toBeNull()
    expect(
      await prisma.user.findUnique({ where: { id: members[0].user.id } })
    ).toBeNull()
    expect(
      await prisma.server.count({ where: { organizationId: organization.id } })
    ).toBe(0)

    const purges = await prisma.event.findMany({
      where: { targetId: { in: [organization.id, members[0].user.id] } },
      orderBy: { action: "asc" },
    })

    expect(
      purges.map((event) => [event.action, event.targetId, event.payload])
    ).toEqual([
      ["organization.purged", organization.id, null],
      ["user.purged", members[0].user.id, null],
    ])
  })

  it("leaves a purge still within its grace period untouched", async () => {
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

    expect(await runPurgeDeletions(recordSteps().step)).toMatchObject({
      organizations: [],
      users: [],
    })
    expect(
      await prisma.organization.findUnique({ where: { id: organization.id } })
    ).not.toBeNull()
  })

  it("touches nothing when no purge is scheduled", async () => {
    await createOrganizationWithMembers({ roles: ["owner"] })

    expect(await runPurgeDeletions(recordSteps().step)).toEqual({
      organizations: [],
      users: [],
      swept: NOTHING_SWEPT,
    })
  })

  it("deletes all due accounts in the same pass, one step per batch", async () => {
    const { prisma } = await bootApiTestServer()
    const due = new Date(Date.now() - DAY_MS)
    const ids: string[] = []

    for (let index = 0; index < PURGE_BATCH_SIZE + 1; index += 1) {
      const user = await dueUser(
        `usr_purge_${String(index).padStart(2, "0")}`,
        new Date(due.getTime() + index)
      )

      ids.push(user.id)
    }

    const recorder = recordSteps()
    const report = await runPurgeDeletions(recorder.step)

    expect(report.users).toEqual(ids)
    expect(await prisma.user.count({ where: { id: { in: ids } } })).toBe(0)
    expect(
      recorder.names.filter((name) => name.startsWith(PURGE_USERS_STEP))
    ).toEqual([batchStep(PURGE_USERS_STEP, 0), batchStep(PURGE_USERS_STEP, 1)])
  })

  it("deletes organizations in batches down to the last one", async () => {
    const { prisma } = await bootApiTestServer()
    const past = new Date(Date.now() - DAY_MS)

    for (let index = 0; index < PURGE_BATCH_SIZE + 1; index += 1) {
      await prisma.organization.create({
        data: {
          id: `org_purge_${index}`,
          name: `purge-${index}`,
          slug: `purge-${index}`,
          createdAt: past,
          deletionAt: past,
        },
      })
    }

    const recorder = recordSteps()
    const report = await runPurgeDeletions(recorder.step)

    expect(report.organizations).toHaveLength(PURGE_BATCH_SIZE + 1)
    expect(await prisma.organization.count()).toBe(0)
    expect(
      recorder.names.filter((name) => name.startsWith(PURGE_ORGANIZATIONS_STEP))
    ).toEqual([
      batchStep(PURGE_ORGANIZATIONS_STEP, 0),
      batchStep(PURGE_ORGANIZATIONS_STEP, 1),
    ])
  })

  it("takes away the billing, the provenance, the invitations and the organization's whole journal", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const link = await prisma.affiliateLink.create({
      data: { code: "atelier", name: "Atelier" },
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
    await prisma.event.createMany({
      data: [
        {
          action: "member.invited",
          actorUserId: members[0].user.id,
          organizationId: organization.id,
          targetType: "invitation",
          targetId: `inv_${organization.id}`,
          payload: { email: "invitee@test.local", role: "member" },
        },
        {
          action: "organization.closed",
          actorUserId: null,
          organizationId: null,
          targetType: "organization",
          targetId: organization.id,
          payload: { reason: "impayé" },
        },
      ],
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

    const left = await prisma.event.findMany({
      where: {
        OR: [
          { targetId: organization.id },
          { targetId: `inv_${organization.id}` },
        ],
      },
    })

    expect(left.map((event) => [event.action, event.payload])).toEqual([
      ["organization.purged", null],
    ])
  })

  it("skips the account that is sole owner of an organization still carrying a machine, without journaling it again every day", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })

    await createServer({ organizationId: organization.id })
    await prisma.user.update({
      where: { id: members[0].user.id },
      data: { deletionAt: new Date(Date.now() - DAY_MS) },
    })

    expect(await runPurgeDeletions(recordSteps().step)).toMatchObject({
      organizations: [],
      users: [],
    })
    expect(await runPurgeDeletions(recordSteps().step)).toMatchObject({
      users: [],
    })
    expect(await prisma.user.count({ where: { id: members[0].user.id } })).toBe(
      1
    )

    const skipped = await prisma.event.findMany({
      where: {
        action: "user.purge_skipped",
        targetId: members[0].user.id,
      },
    })

    expect(skipped).toHaveLength(1)
    expect(skipped[0]?.payload).toMatchObject({
      reason: "sole_owner",
      organization_id: organization.id,
    })
  })

  it("does not let held accounts block the others' queue", async () => {
    const { prisma } = await bootApiTestServer()
    const due = new Date(Date.now() - DAY_MS)

    for (let index = 0; index < PURGE_BATCH_SIZE; index += 1) {
      const held = await dueUser(
        `usr_held_${String(index).padStart(2, "0")}`,
        due
      )
      const organization = await prisma.organization.create({
        data: {
          id: `org_held_${index}`,
          name: `held-${index}`,
          slug: `held-${index}`,
          createdAt: due,
          members: {
            create: {
              id: `mem_held_${index}`,
              userId: held.id,
              role: "owner",
              createdAt: due,
            },
          },
        },
      })

      await createServer({ organizationId: organization.id })
    }

    const free = await dueUser("usr_zz_free", due)
    const report = await runPurgeDeletions(recordSteps().step)

    expect(report.users).toEqual([free.id])
    expect(
      await prisma.user.count({ where: { id: { startsWith: "usr_held_" } } })
    ).toBe(PURGE_BATCH_SIZE)
  })

  it("sweeps a silent server's measures and the expired sessions, verifications and device codes", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const { server } = await createServer({ organizationId: organization.id })
    const now = Date.now()

    await prisma.serverMetric.createMany({
      data: [
        { serverId: server.id, at: new Date(now - 8 * DAY_MS), sample: {} },
        {
          serverId: server.id,
          at: new Date(now - 7 * DAY_MS - 1000),
          sample: {},
        },
        { serverId: server.id, at: new Date(now - DAY_MS), sample: {} },
      ],
    })
    await prisma.session.create({
      data: {
        id: "ses_expired",
        token: "expired-token",
        userId: members[0].user.id,
        expiresAt: new Date(now - 1000),
      },
    })
    await prisma.verification.createMany({
      data: [
        {
          id: "ver_expired",
          identifier: "magic-link-expired",
          value: "{}",
          expiresAt: new Date(now - 1000),
        },
        {
          id: "ver_live",
          identifier: "magic-link-live",
          value: "{}",
          expiresAt: new Date(now + DAY_MS),
        },
      ],
    })
    await prisma.deviceCode.createMany({
      data: [
        {
          id: "dc_expired",
          deviceCode: "expired",
          userCode: "EXPIRED1",
          userId: members[0].user.id,
          expiresAt: new Date(now - 1000),
          status: "pending",
        },
        {
          id: "dc_live",
          deviceCode: "live",
          userCode: "LIVE0001",
          expiresAt: new Date(now + DAY_MS),
          status: "pending",
        },
      ],
    })

    const report = await runPurgeDeletions(recordSteps().step)

    expect(report.swept).toEqual({
      metrics: 2,
      sessions: 1,
      verifications: 1,
      device_codes: 1,
    })
    expect(await prisma.serverMetric.count()).toBe(1)
    expect(
      await prisma.session.count({ where: { userId: members[0].user.id } })
    ).toBe(1)
    expect((await prisma.verification.findMany()).map((row) => row.id)).toEqual(
      ["ver_live"]
    )
    expect((await prisma.deviceCode.findMany()).map((row) => row.id)).toEqual([
      "dc_live",
    ])
  })
})
