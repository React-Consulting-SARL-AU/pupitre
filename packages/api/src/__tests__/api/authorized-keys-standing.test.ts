import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { ED25519_KEY } from "../../testing/keys"
import { apiRequest } from "../../testing/request"

interface StateBody {
  authorized_keys: string[]
}

const DAY_MS = 86_400_000

let harness: ApiTestServer

async function assignedServer() {
  const { organization, members } = await createOrganizationWithMembers({
    roles: ["owner", "member"],
    subscription: {},
  })
  const member = members[1]

  await harness.prisma.device.create({
    data: {
      userId: member.user.id,
      name: "MacBook",
      publicKey: ED25519_KEY,
      fingerprint: `SHA256:${crypto.randomUUID()}`,
    },
  })

  const { token } = await createServer({
    organizationId: organization.id,
    assignedUserId: member.user.id,
  })

  return { token, userId: member.user.id }
}

async function keysFor(token: string): Promise<string[]> {
  const response = await apiRequest<StateBody>("/agent/state", {
    bearer: token,
  })

  expect(response.status).toBe(200)

  return response.json.authorized_keys
}

describe("the keys a server receives follow the account's standing", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("hands over the key of an account in good standing", async () => {
    const { token } = await assignedServer()

    expect(await keysFor(token)).toEqual([ED25519_KEY])
  })

  it("withdraws the key of a banned account, for good or until the ban ends", async () => {
    const { token, userId } = await assignedServer()

    await harness.prisma.user.update({
      where: { id: userId },
      data: { banned: true, banExpires: null },
    })

    expect(await keysFor(token)).toEqual([])

    await harness.prisma.user.update({
      where: { id: userId },
      data: { banExpires: new Date(Date.now() + DAY_MS) },
    })

    expect(await keysFor(token)).toEqual([])
  })

  it("hands the key back once the ban has run out", async () => {
    const { token, userId } = await assignedServer()

    await harness.prisma.user.update({
      where: { id: userId },
      data: { banned: true, banExpires: new Date(Date.now() - 1000) },
    })

    expect(await keysFor(token)).toEqual([ED25519_KEY])
  })

  it("withdraws the key of a deactivated account and of one scheduled for deletion", async () => {
    const deactivated = await assignedServer()

    await harness.prisma.user.update({
      where: { id: deactivated.userId },
      data: { deactivatedAt: new Date() },
    })

    expect(await keysFor(deactivated.token)).toEqual([])

    const deleting = await assignedServer()

    await harness.prisma.user.update({
      where: { id: deleting.userId },
      data: { deletionAt: new Date(Date.now() + 7 * DAY_MS) },
    })

    expect(await keysFor(deleting.token)).toEqual([])
  })
})
