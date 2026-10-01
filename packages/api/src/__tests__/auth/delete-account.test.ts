import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { GRANTED_PRODUCT } from "@pupitre/shared/plans"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
  subscribeOrganization,
} from "../../testing/factories"
import { authRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface RefusalBody {
  code: string
  message: string
  fix: string
}

let harness: ApiTestServer

function deleteAccount(headers: Headers) {
  return authRequest<RefusalBody>("POST", "/delete-user", {}, headers)
}

async function soloAccount() {
  const { user, organization } = await createUser()
  const { headers } = await createSession({ userId: user.id })

  return { user, organization, headers }
}

describe("deleting one's own account from the console", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("erases the account at once, with the organizations it was alone in, its device codes and what the journal said about it", async () => {
    const { prisma } = harness
    const { user, organization: personal, headers } = await soloAccount()
    const shared = await createOrganizationWithMembers({ roles: ["owner"] })
    const device = await prisma.device.create({
      data: {
        userId: user.id,
        name: "MacBook de Jordan",
        publicKey: "ssh-ed25519 AAAA",
        fingerprint: `SHA256:${crypto.randomUUID()}`,
      },
    })

    await prisma.member.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: shared.organization.id,
        userId: user.id,
        role: "member",
        createdAt: new Date(),
      },
    })

    const { server } = await createServer({
      organizationId: shared.organization.id,
      assignedUserId: user.id,
    })

    await prisma.deviceCode.create({
      data: {
        id: "dc_pending",
        deviceCode: "pending",
        userCode: "PENDING1",
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        status: "pending",
      },
    })
    await prisma.event.createMany({
      data: [
        {
          action: "device.added",
          actorUserId: user.id,
          targetType: "device",
          targetId: device.id,
          payload: { name: device.name },
        },
        {
          action: "device.revoked",
          actorUserId: user.id,
          targetType: "device",
          targetId: "dev_gone",
          payload: { name: "Vieux PC" },
        },
        {
          action: "device.added",
          actorUserId: user.id,
          targetType: "device",
          targetId: "dev_gone",
          payload: { name: "Vieux PC" },
        },
        {
          action: "user.banned",
          actorUserId: null,
          targetType: "user",
          targetId: user.id,
          payload: { reason: "spam" },
        },
        {
          action: "server.updated",
          actorUserId: user.id,
          organizationId: personal.id,
          targetType: "server",
          targetId: "srv_personal",
          payload: { host: "perso.example.com" },
        },
        {
          action: "server.updated",
          actorUserId: user.id,
          organizationId: shared.organization.id,
          targetType: "server",
          targetId: server.id,
          payload: { name: "vps" },
        },
      ],
    })

    const response = await deleteAccount(headers)

    expect(response.status).toBe(200)
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull()
    expect(
      await prisma.organization.findUnique({ where: { id: personal.id } })
    ).toBeNull()
    expect(
      await prisma.organization.findUnique({
        where: { id: shared.organization.id },
      })
    ).not.toBeNull()
    expect(await prisma.deviceCode.count({ where: { userId: user.id } })).toBe(
      0
    )
    expect(
      (await prisma.server.findUniqueOrThrow({ where: { id: server.id } }))
        .assignedUserId
    ).toBeNull()
    expect(
      await prisma.event.count({
        where: {
          OR: [
            { targetType: "device" },
            { targetType: "user", NOT: { action: "user.purged" } },
            { organizationId: personal.id },
          ],
        },
      })
    ).toBe(0)

    const purged = await prisma.event.findFirstOrThrow({
      where: { action: "user.purged", targetId: user.id },
    })

    expect(purged.payload).toBeNull()
    expect(purged.actorUserId).toBeNull()

    const kept = await prisma.event.findFirstOrThrow({
      where: { action: "server.updated", targetId: server.id },
    })

    expect(kept.actorUserId).toBeNull()
    expect(kept.organizationId).toBe(shared.organization.id)
  })

  it("lets an organization the account is alone in go with its granted licence", async () => {
    const { user, organization, headers } = await soloAccount()

    await harness.prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: `granted_${organization.id}`,
        product: GRANTED_PRODUCT,
        quantity: 1,
        status: "active",
      },
    })

    const response = await deleteAccount(headers)

    expect(response.status).toBe(200)
    expect(
      await harness.prisma.user.findUnique({ where: { id: user.id } })
    ).toBeNull()
    expect(
      await harness.prisma.subscription.count({
        where: { organizationId: organization.id },
      })
    ).toBe(0)
  })

  it("refuses while an organization the account is alone in still holds a server, and says what to do", async () => {
    const { user, organization, headers } = await soloAccount()

    await createServer({ organizationId: organization.id })
    headers.set("accept-language", "fr")

    const response = await deleteAccount(headers)

    expect(response.status).toBe(409)
    expect(response.json.code).toBe("SOLE_OWNER")
    expect(response.json.message).toContain("serveur")
    expect(response.json.fix).toContain("propriétaire")
    expect(
      await harness.prisma.user.findUnique({ where: { id: user.id } })
    ).not.toBeNull()
    expect(
      await harness.prisma.organization.findUnique({
        where: { id: organization.id },
      })
    ).not.toBeNull()
  })

  it("refuses while a Stripe subscription would keep running, in the caller's language", async () => {
    const { user, organization } = await soloAccount()
    const { headers } = await createSession({ userId: user.id })

    headers.set("accept-language", "en")
    await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
    })

    const response = await deleteAccount(headers)

    expect(response.status).toBe(409)
    expect(response.json.code).toBe("SOLE_OWNER")
    expect(response.json.fix).toContain("cancel its licence")
  })

  it("refuses the sole owner of a shared organization that holds a subscription", async () => {
    const { members, organization } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: { status: "active" },
    })
    const response = await deleteAccount(members[0].headers)

    expect(response.status).toBe(409)
    expect(
      await harness.prisma.organization.findUnique({
        where: { id: organization.id },
      })
    ).not.toBeNull()
    expect(
      await harness.prisma.user.count({ where: { id: members[0].user.id } })
    ).toBe(1)
  })

  it("leaves a shared organization to its other members", async () => {
    const { members, organization } = await createOrganizationWithMembers({
      roles: ["owner", "owner", "member"],
    })
    const response = await deleteAccount(members[0].headers)

    expect(response.status).toBe(200)
    expect(
      await harness.prisma.member.count({
        where: { organizationId: organization.id },
      })
    ).toBe(2)
  })
})
