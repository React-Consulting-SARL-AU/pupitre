import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  type MemberFixture,
} from "../../testing/factories"
import { ED25519_KEY, SECOND_ED25519_KEY } from "../../testing/keys"
import {
  HOST_FINGERPRINT,
  HOST_PUBLIC_KEY,
  PROBE_REPORT,
} from "../../testing/probe"
import { apiRequest } from "../../testing/request"

type Session = { token: string }

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface EnrollBody {
  server_id: string
  enrollment_token: string
}

const REINSTALLED_HOST_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJggxfUKhpYOKRen6E6lpoh//viuSJtxOQ8hVlFZb+/t root@vps"

const REINSTALLED_FINGERPRINT =
  "SHA256:SKIk1JL2e3pcuqLW9FsSElcF6LmeSGcufndJrR7va5U"

async function deviceOf(session: Session, publicKey: string) {
  const response = await apiRequest<{ data: { id: string } }>("/me/devices", {
    body: { name: "Poste", public_key: publicKey },
    session,
  })

  return response.json.data.id
}

function enroll(
  session: Session,
  deviceId: string,
  extra: Record<string, unknown> = {}
) {
  return apiRequest<EnrollBody & ErrorBody>("/servers/enroll", {
    body: {
      device_id: deviceId,
      host: "vps.test",
      probe: PROBE_REPORT,
      ...extra,
    },
    session,
  })
}

function exchange(enrollmentToken: string, hostPublicKey = HOST_PUBLIC_KEY) {
  return apiRequest<{ server_token: string } & ErrorBody>("/agent/exchange", {
    body: {
      enrollment_token: enrollmentToken,
      host_public_key: hostPublicKey,
      agent_version: "1.4.0",
      arch: "amd64",
    },
  })
}

/** A server the owner installed, then handed to the organization's member. */
async function installedFor() {
  const { prisma } = await bootApiTestServer()
  const { members } = await createOrganizationWithMembers({
    roles: ["owner", "admin", "member", "member"],
    subscription: {},
  })
  const [owner, admin, assigned, bystander] = members as [
    MemberFixture,
    MemberFixture,
    MemberFixture,
    MemberFixture,
  ]
  const enrolled = await enroll(owner, await deviceOf(owner, ED25519_KEY))

  await exchange(enrolled.json.enrollment_token)
  await prisma.server.update({
    where: { id: enrolled.json.server_id },
    data: { assignedUserId: assigned.user.id },
  })

  return {
    owner,
    admin,
    assigned,
    bystander,
    serverId: enrolled.json.server_id,
  }
}

describe("repairing an installed server", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses a member the server is not assigned to, and leaves the row as it was", async () => {
    const { prisma } = await bootApiTestServer()
    const { bystander, serverId } = await installedFor()
    const before = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    })
    const response = await enroll(
      bystander,
      await deviceOf(bystander, SECOND_ED25519_KEY)
    )

    expect(response.status).toBe(403)
    expect(response.json.error.code).toBe("server_repair_forbidden")
    expect(response.json.error.fix).toBeString()

    const after = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    })

    expect(after.enrollmentTokenHash).toBe(before.enrollmentTokenHash)
    expect(after.deviceId).toBe(before.deviceId)
  })

  it("lets the assigned member repair it without moving the SSH account or the host pin", async () => {
    const { prisma } = await bootApiTestServer()
    const { assigned, serverId } = await installedFor()
    const response = await enroll(
      assigned,
      await deviceOf(assigned, SECOND_ED25519_KEY),
      { ssh_user: "ops", fingerprint: REINSTALLED_FINGERPRINT }
    )

    expect(response.status).toBe(201)
    expect(response.json.server_id).toBe(serverId)

    const server = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    })

    expect(server.sshUser).toBe("dev")
    expect(server.hostFingerprint).toBe(HOST_FINGERPRINT)
  })

  it("lets an admin of the organization repair a member's server", async () => {
    const { admin, serverId } = await installedFor()
    const response = await enroll(
      admin,
      await deviceOf(admin, SECOND_ED25519_KEY)
    )

    expect(response.status).toBe(201)
    expect(response.json.server_id).toBe(serverId)
  })
})

describe("the exchange against the host pin", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses another machine's host key without burning the token", async () => {
    const { prisma } = await bootApiTestServer()
    const { owner, serverId } = await installedFor()
    const again = await enroll(owner, await deviceOf(owner, SECOND_ED25519_KEY))
    const refused = await exchange(
      again.json.enrollment_token,
      REINSTALLED_HOST_KEY
    )

    expect(refused.status).toBe(409)
    expect(refused.json.error.code).toBe("host_key_mismatch")
    expect(refused.json.error.fix).toBeString()

    const pinned = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    })

    expect(pinned.hostFingerprint).toBe(HOST_FINGERPRINT)
    expect(pinned.enrollmentExpiresAt).not.toBeNull()

    const accepted = await exchange(again.json.enrollment_token)

    expect(accepted.status).toBe(200)
  })

  it("holds a new server to the pin its app sent at enrolment", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members as [MemberFixture]
    const enrolled = await enroll(owner, await deviceOf(owner, ED25519_KEY), {
      fingerprint: HOST_FINGERPRINT,
    })
    const refused = await exchange(
      enrolled.json.enrollment_token,
      REINSTALLED_HOST_KEY
    )
    const accepted = await exchange(enrolled.json.enrollment_token)

    expect(refused.status).toBe(409)
    expect(accepted.status).toBe(200)
  })
})
