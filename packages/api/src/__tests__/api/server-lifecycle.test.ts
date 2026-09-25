import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import {
  DECOMMISSION_BATCH_SIZE,
  DECOMMISSION_DELAY_MS,
  decommissionDueServers,
  ENROLLMENT_EXPIRY_BATCH_SIZE,
  expireEnrollments,
  METRIC_DELETE_CHUNK,
} from "../../lib/servers/expire"
import { bootApiTestServer, resetDb } from "../../testing"
import { createOrganizationWithMembers } from "../../testing/factories"
import { ED25519_KEY } from "../../testing/keys"
import { HOST_PUBLIC_KEY, PROBE_REPORT } from "../../testing/probe"
import { apiRequest } from "../../testing/request"

type Session = { token: string }

const HOUR_MS = 3_600_000

function enroll(session: Session, deviceId: string, host: string) {
  return apiRequest<{ server_id: string; enrollment_token: string }>(
    "/servers/enroll",
    {
      body: { device_id: deviceId, host, probe: PROBE_REPORT },
      session,
    }
  )
}

async function ownerWithDevice() {
  const { members } = await createOrganizationWithMembers({
    roles: ["owner"],
    subscription: {},
  })
  const [owner] = members
  const device = await apiRequest<{ data: { id: string } }>("/me/devices", {
    body: { name: "MacBook", public_key: ED25519_KEY },
    session: owner,
  })

  return { owner, deviceId: device.json.data.id }
}

describe("expireEnrollments", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("leaves a token that is still within its hour", async () => {
    const { owner, deviceId } = await ownerWithDevice()
    const enrolled = await enroll(owner, deviceId, "vps.test")

    expect(await expireEnrollments()).toEqual([])

    const exchanged = await apiRequest("/agent/exchange", {
      body: {
        enrollment_token: enrolled.json.enrollment_token,
        host_public_key: HOST_PUBLIC_KEY,
        agent_version: "1.4.0",
        arch: "amd64",
      },
    })

    expect(exchanged.status).toBe(200)
  })

  it("revokes a server whose token was never exchanged", async () => {
    const { prisma } = await bootApiTestServer()
    const { owner, deviceId } = await ownerWithDevice()
    const enrolled = await enroll(owner, deviceId, "vps.test")

    await prisma.server.update({
      where: { id: enrolled.json.server_id },
      data: { enrollmentExpiresAt: new Date(Date.now() - HOUR_MS) },
    })

    expect(await expireEnrollments()).toEqual([enrolled.json.server_id])

    const server = await prisma.server.findUniqueOrThrow({
      where: { id: enrolled.json.server_id },
    })

    expect(server.status).toBe("revoked")
    expect(server.enrollmentTokenHash).toBeNull()
    expect(server.assignedUserId).toBeNull()
    expect(server.pendingAssignmentEmail).toBeNull()

    const mine = await apiRequest<{ data: { id: string }[] }>("/me/servers", {
      session: owner,
    })

    expect(mine.json.data).toEqual([])

    const refused = await apiRequest<{ error: { code: string } }>(
      "/agent/exchange",
      {
        body: {
          enrollment_token: enrolled.json.enrollment_token,
          host_public_key: HOST_PUBLIC_KEY,
          agent_version: "1.4.0",
          arch: "amd64",
        },
      }
    )

    expect(refused.status).toBe(404)
  })

  it("never touches a server that was already exchanged", async () => {
    const { prisma } = await bootApiTestServer()
    const { owner, deviceId } = await ownerWithDevice()
    const enrolled = await enroll(owner, deviceId, "vps.test")

    await apiRequest("/agent/exchange", {
      body: {
        enrollment_token: enrolled.json.enrollment_token,
        host_public_key: HOST_PUBLIC_KEY,
        agent_version: "1.4.0",
        arch: "amd64",
      },
    })
    await prisma.server.update({
      where: { id: enrolled.json.server_id },
      data: { enrollmentExpiresAt: new Date(Date.now() - HOUR_MS) },
    })

    expect(await expireEnrollments()).toEqual([])

    const server = await prisma.server.findUniqueOrThrow({
      where: { id: enrolled.json.server_id },
    })

    expect(server.status).toBe("active")
  })
})

describe("decommissionDueServers", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("waits seven days after the deletion", async () => {
    const { prisma } = await bootApiTestServer()
    const { owner, deviceId } = await ownerWithDevice()
    const enrolled = await enroll(owner, deviceId, "vps.test")

    await apiRequest(`/servers/${enrolled.json.server_id}`, {
      method: "DELETE",
      session: owner,
    })

    expect(await decommissionDueServers()).toEqual([])

    const later = new Date(Date.now() + DECOMMISSION_DELAY_MS + 1000)

    expect(await decommissionDueServers(later)).toEqual([
      enrolled.json.server_id,
    ])

    const server = await prisma.server.findUnique({
      where: { id: enrolled.json.server_id },
    })

    expect(server).toBeNull()
  })

  it("empties a week of samples in chunks before removing servers, past one batch", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const due = new Date(Date.now() - HOUR_MS)
    const ids: string[] = []

    for (let index = 0; index < DECOMMISSION_BATCH_SIZE + 1; index += 1) {
      const server = await prisma.server.create({
        data: {
          organizationId: organization.id,
          name: `vps-${index}`,
          arch: "amd64",
          status: "revoked",
          decommissionAt: due,
        },
      })

      ids.push(server.id)
    }

    await prisma.serverMetric.createMany({
      data: Array.from({ length: METRIC_DELETE_CHUNK + 3 }, (_, index) => ({
        serverId: ids[0] ?? "",
        at: new Date(due.getTime() - index * 60_000),
        sample: {},
      })),
    })

    expect((await decommissionDueServers()).sort()).toEqual(ids.sort())
    expect(await prisma.server.count()).toBe(0)
    expect(await prisma.serverMetric.count()).toBe(0)
  })
})

describe("expireEnrollments past one batch", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("revokes every expired enrolment, batch after batch", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const total = ENROLLMENT_EXPIRY_BATCH_SIZE + 2

    for (let index = 0; index < total; index += 1) {
      await prisma.server.create({
        data: {
          organizationId: organization.id,
          name: `vps-${index}`,
          arch: "amd64",
          status: "enrolling",
          enrollmentTokenHash: `hash-${index}`,
          enrollmentExpiresAt: new Date(Date.now() - HOUR_MS),
        },
      })
    }

    expect(await expireEnrollments()).toHaveLength(total)
    expect(await prisma.server.count({ where: { status: "revoked" } })).toBe(
      total
    )
  })
})
