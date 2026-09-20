import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { useFakeBilling, useLaunchBilling } from "@pupitre/api/testing/billing"
import {
  createOrganizationWithMembers,
  createServer,
} from "@pupitre/api/testing/factories"
import { resetFakeMail, useFakeMail } from "@pupitre/api/testing/mail"
import { GRANTED_PRODUCT, LAUNCH_PRODUCT } from "@pupitre/shared/plans"
import { recordSteps } from "@/testing/workflow"
import {
  EXPIRE_GRANTED_STEP,
  PURGE_MAIL_UPLOADS_STEP,
  RECONCILE_LAUNCH_STEP,
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
      entitlementValidUntil: new Date(Date.now() - DAY_MS),
    },
  })

  return server.id
}

describe("le workflow SuspendExpiredGrace", () => {
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

  it("réconcilie le lancement, ferme les octrois échus, suspend, puis purge les dépôts, chacun dans une étape nommée", async () => {
    const serverId = await serverWithExpiredGrace()
    const recorder = recordSteps()

    const report = await runSuspendExpiredGrace(recorder.step)

    expect(report).toEqual({
      launch: { aligned: [], kept: [], canceled: [] },
      granted: [],
      suspended: [serverId],
      purgedUploads: [],
    })
    expect(recorder.names).toEqual([
      RECONCILE_LAUNCH_STEP,
      EXPIRE_GRANTED_STEP,
      SUSPEND_EXPIRED_GRACE_STEP,
      PURGE_MAIL_UPLOADS_STEP,
    ])

    const { prisma } = await bootApiTestServer()

    expect(
      await prisma.server.findUniqueOrThrow({ where: { id: serverId } })
    ).toMatchObject({ status: "suspended" })
  })

  it("laisse une tolérance encore ouverte intacte", async () => {
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
        entitlementValidUntil: new Date(Date.now() + DAY_MS),
      },
    })

    expect(
      (await runSuspendExpiredGrace(recordSteps().step)).suspended
    ).toEqual([])
    expect(
      await prisma.server.findUniqueOrThrow({ where: { id: server.id } })
    ).toMatchObject({ status: "grace" })
  })

  it("garde pour de bon le siège d'un lancement dépassé dont la machine est enrôlée, et ne suspend rien", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const ended = new Date(Date.now() - DAY_MS)
    const subscription = await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: `launch_${organization.id}`,
        product: LAUNCH_PRODUCT,
        quantity: 1,
        status: "trialing",
        currentPeriodEnd: ended,
      },
    })
    const { server } = await createServer({ organizationId: organization.id })

    useLaunchBilling({ endsAt: ended })

    const report = await runSuspendExpiredGrace(recordSteps().step)

    expect(report).toEqual({
      launch: { aligned: [], kept: [subscription.id], canceled: [] },
      granted: [],
      suspended: [],
      purgedUploads: [],
    })
    expect(
      await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      })
    ).toMatchObject({ status: "active", currentPeriodEnd: null })
    expect(
      await prisma.server.findUniqueOrThrow({ where: { id: server.id } })
    ).toMatchObject({ status: "active" })
  })

  it("ferme un lancement dépassé qui n'a jamais enrôlé de machine", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const ended = new Date(Date.now() - DAY_MS)
    const subscription = await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: `launch_${organization.id}`,
        product: LAUNCH_PRODUCT,
        quantity: 1,
        status: "trialing",
        currentPeriodEnd: ended,
      },
    })

    useLaunchBilling({ endsAt: ended })

    const report = await runSuspendExpiredGrace(recordSteps().step)

    expect(report).toEqual({
      launch: { aligned: [], kept: [], canceled: [subscription.id] },
      granted: [],
      suspended: [],
      purgedUploads: [],
    })
    expect(
      await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      })
    ).toMatchObject({ status: "canceled" })
  })

  it("ferme un octroi arrivé à échéance et suspend ses serveurs dans la même passe", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const ended = new Date(Date.now() - DAY_MS)
    const subscription = await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: "granted_partenaire",
        product: GRANTED_PRODUCT,
        quantity: 2,
        status: "active",
        currentPeriodEnd: ended,
      },
    })
    const { server } = await createServer({ organizationId: organization.id })

    const report = await runSuspendExpiredGrace(recordSteps().step)

    expect(report).toEqual({
      launch: { aligned: [], kept: [], canceled: [] },
      granted: [subscription.id],
      suspended: [server.id],
      purgedUploads: [],
    })
    expect(
      await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      })
    ).toMatchObject({ status: "canceled" })
    expect(
      await prisma.server.findUniqueOrThrow({ where: { id: server.id } })
    ).toMatchObject({ status: "suspended", suspendedReason: "billing" })
  })

  it("purge les dépôts de mail vieux d'un jour et laisse les autres", async () => {
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
