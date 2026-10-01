import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { useFakeBilling } from "@pupitre/api/testing/billing"
import {
  createOrganizationWithMembers,
  createServer,
} from "@pupitre/api/testing/factories"
import { resetFakeMail, useFakeMail } from "@pupitre/api/testing/mail"
import { FREE_SERVERS, GRANTED_PRODUCT } from "@pupitre/shared/plans"
import { recordSteps } from "@/testing/workflow"
import { batchStep } from "./steps"
import {
  ANNOUNCE_SUSPENSION_STEP,
  EXPIRE_GRANTED_STEP,
  PURGE_MAIL_UPLOADS_STEP,
  runSuspendExpiredGrace,
  SUSPEND_EXPIRED_GRACE_STEP,
} from "./suspend-expired-grace"

const DAY_MS = 86_400_000

const EMPTY_BODY = new ArrayBuffer(0)

async function serverWithExpiredGrace(): Promise<string> {
  const { prisma } = await bootApiTestServer()
  const { organization } = await createOrganizationWithMembers({
    roles: ["owner"],
  })
  const server = await prisma.server.create({
    data: {
      organizationId: organization.id,
      name: "vps-en-tolerance",
      arch: "amd64",
      status: "grace",
      licenseValidUntil: new Date(Date.now() - DAY_MS),
    },
  })

  return server.id
}

async function endedGrant(organizationId: string) {
  const { prisma } = await bootApiTestServer()

  return await prisma.subscription.create({
    data: {
      organizationId,
      stripeSubscriptionId: `granted_${organizationId}`,
      product: GRANTED_PRODUCT,
      quantity: 2,
      status: "active",
      currentPeriodEnd: new Date(Date.now() - DAY_MS),
    },
  })
}

describe("the SuspendExpiredGrace workflow", () => {
  let mail: ReturnType<typeof useFakeMail>

  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    useFakeBilling()
    mail = useFakeMail()
  })

  afterAll(() => {
    useFakeBilling()
    resetFakeMail()
  })

  it("closes the due grants, suspends, then purges the deposits, each in a named step", async () => {
    const serverId = await serverWithExpiredGrace()
    const recorder = recordSteps()

    const report = await runSuspendExpiredGrace(recorder.step)

    expect(report).toEqual({
      granted: [],
      suspended: [serverId],
      purgedUploads: [],
    })
    expect(recorder.names).toEqual([
      batchStep(EXPIRE_GRANTED_STEP, 0),
      batchStep(SUSPEND_EXPIRED_GRACE_STEP, 0),
      batchStep(ANNOUNCE_SUSPENSION_STEP, 0),
      PURGE_MAIL_UPLOADS_STEP,
    ])
    expect((await bootApiTestServer()).sentEmails).toHaveLength(1)

    const { prisma } = await bootApiTestServer()

    expect(
      await prisma.server.findUniqueOrThrow({ where: { id: serverId } })
    ).toMatchObject({ status: "suspended" })
  })

  it("leaves a still-open grace period untouched", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const server = await prisma.server.create({
      data: {
        organizationId: organization.id,
        name: "vps-encore-tolere",
        arch: "amd64",
        status: "grace",
        licenseValidUntil: new Date(Date.now() + DAY_MS),
      },
    })

    expect(
      (await runSuspendExpiredGrace(recordSteps().step)).suspended
    ).toEqual([])
    expect(
      await prisma.server.findUniqueOrThrow({ where: { id: server.id } })
    ).toMatchObject({ status: "grace" })
  })

  it("closes a due grant without cutting anything while the organization fits within its free servers", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const subscription = await endedGrant(organization.id)
    const { server } = await createServer({ organizationId: organization.id })

    const report = await runSuspendExpiredGrace(recordSteps().step)

    expect(report).toEqual({
      granted: [subscription.id],
      suspended: [],
      purgedUploads: [],
    })
    expect(
      await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      })
    ).toMatchObject({ status: "canceled" })
    expect(
      await prisma.server.findUniqueOrThrow({ where: { id: server.id } })
    ).toMatchObject({ status: "active" })
  })

  it("opens the grace period for the servers of a due grant beyond the free servers", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const subscription = await endedGrant(organization.id)

    for (let index = 0; index <= FREE_SERVERS; index += 1) {
      await createServer({ organizationId: organization.id })
    }

    const report = await runSuspendExpiredGrace(recordSteps().step)

    expect(report.granted).toEqual([subscription.id])
    expect(report.suspended).toEqual([])
    expect(
      await prisma.server.count({
        where: { organizationId: organization.id, status: "grace" },
      })
    ).toBe(FREE_SERVERS + 1)
  })

  it("purges mail deposits a day old and leaves the others", async () => {
    const stale = "mail/uploads/user_1/old/rapport.pdf"
    const fresh = "mail/uploads/user_1/new/rapport.pdf"

    mail.objects.set(stale, {
      body: EMPTY_BODY,
      contentType: "application/pdf",
    })
    mail.objects.set(fresh, {
      body: EMPTY_BODY,
      contentType: "application/pdf",
    })
    mail.uploaded.set(stale, new Date(Date.now() - 2 * DAY_MS))
    mail.uploaded.set(fresh, new Date())

    const report = await runSuspendExpiredGrace(recordSteps().step)

    expect(report.purgedUploads).toEqual([stale])
    expect([...mail.objects.keys()]).toEqual([fresh])
  })
})
