import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { issuedAtOf, publicKeyFingerprint } from "@pupitre/shared/keys"
import fixtures from "../../../../shared/src/keys/fixtures.json"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
  type MemberFixture,
} from "../../testing/factories"
import { ED25519_KEY, SECOND_ED25519_KEY } from "../../testing/keys"
import { apiRequest } from "../../testing/request"

type Session = { token: string }

type Holder = "owner" | "admin" | "assigned" | "member" | "nobody"

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface PendingBody {
  server: { id: string; name: string }
  device: { id: string; name: string; fingerprint: string; public_key: string }
  user: { id: string; name: string; email: string }
  signers: string[]
  reported_at: string
}

interface StateKeyBody {
  public_key: string
  user_id: string
  device_id: string
  approvals: Record<string, string>[]
}

const SIGNER_KEY = fixtures.signers.ed25519

const APPROVAL = fixtures.approvals.ed25519

const PENDING_KEY = APPROVAL.public_key

const SIGNER_FINGERPRINT = APPROVAL.signer

const DAY_MS = 86_400_000

const HEARTBEAT = {
  disk: 41,
  ram: 55,
  load: 1.2,
  sessions: ["dev"],
  stack_version: "1.0.0",
  modules: ["core.system"],
}

const ARMOR_BEGIN = "-----BEGIN SSH SIGNATURE-----"

const ARMOR_END = "-----END SSH SIGNATURE-----"

const ARMOR_LINE = 70

async function fingerprint(key: string): Promise<string> {
  const computed = await publicKeyFingerprint(key)

  if (!computed) {
    throw new Error(`unreadable key ${key}`)
  }

  return computed
}

function addDevice(session: Session, name: string, publicKey: string) {
  return apiRequest<{ data: { id: string } }>("/me/devices", {
    body: { name, public_key: publicKey },
    session,
  })
}

function beat(token: string, keys?: unknown) {
  return apiRequest<ErrorBody>("/agent/heartbeat", {
    body: keys === undefined ? HEARTBEAT : { ...HEARTBEAT, keys },
    bearer: token,
  })
}

function pendingFor(session: Session) {
  return apiRequest<{ data: PendingBody[] }>("/me/key-approvals", { session })
}

function submit(session: Session, body: Record<string, unknown>) {
  return apiRequest<{ data: Record<string, string> } & ErrorBody>(
    "/me/key-approvals",
    { body, session }
  )
}

/** The fixture's envelope with its hash name swapped for another of the same length. */
function withHash(signature: string, hash: string): string {
  const body = signature
    .trim()
    .slice(ARMOR_BEGIN.length, -ARMOR_END.length)
    .replaceAll(/\s/g, "")
  const encoded = btoa(atob(body).replace("sha512", hash))
  const lines = encoded.match(new RegExp(`.{1,${ARMOR_LINE}}`, "g")) ?? []

  return `${ARMOR_BEGIN}\n${lines.join("\n")}\n${ARMOR_END}\n`
}

async function scene(holder: Holder = "assigned") {
  const { organization, members } = await createOrganizationWithMembers({
    roles: ["owner", "admin", "member", "member"],
    subscription: {},
  })
  const [owner, admin, assigned, member] = members as [
    MemberFixture,
    MemberFixture,
    MemberFixture,
    MemberFixture,
  ]
  const holders = { owner, admin, assigned, member }

  await addDevice(assigned, "MacBook", ED25519_KEY)

  const pending = await addDevice(assigned, "Nouveau portable", PENDING_KEY)

  if (holder !== "nobody") {
    await addDevice(holders[holder], "Signataire", SIGNER_KEY)
  }

  const { server, token } = await createServer({
    organizationId: organization.id,
    name: "prod",
    assignedUserId: assigned.user.id,
  })
  const pendingFingerprint = await fingerprint(PENDING_KEY)

  await beat(token, {
    signers: [SIGNER_FINGERPRINT],
    pending: [pendingFingerprint],
  })

  return {
    organization,
    owner,
    admin,
    assigned,
    member,
    server,
    token,
    pendingDeviceId: pending.json.data.id,
    pendingFingerprint,
  }
}

type Scene = Awaited<ReturnType<typeof scene>>

function submission(
  current: Scene,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    server_id: current.server.id,
    device_id: current.pendingDeviceId,
    public_key: PENDING_KEY,
    user_id: current.assigned.user.id,
    issued_at: issuedAtOf(new Date()),
    signer: SIGNER_FINGERPRINT,
    signature: APPROVAL.signature,
    ...overrides,
  }
}

describe("key approvals", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  describe("POST /agent/heartbeat keys", () => {
    it("stores what the agent says of its keys, with the moment it said it", async () => {
      const { prisma } = await bootApiTestServer()
      const current = await scene()
      const stored = await prisma.server.findUniqueOrThrow({
        where: { id: current.server.id },
      })
      const report = stored.keyReport as Record<string, unknown>

      expect(report.signers).toEqual([SIGNER_FINGERPRINT])
      expect(report.pending).toEqual([current.pendingFingerprint])
      expect(typeof report.reported_at).toBe("string")
      expect(Number.isNaN(Date.parse(String(report.reported_at)))).toBe(false)
    })

    it("keeps the last report through a heartbeat that carries none", async () => {
      const { prisma } = await bootApiTestServer()
      const current = await scene()
      const before = await prisma.server.findUniqueOrThrow({
        where: { id: current.server.id },
      })
      const response = await beat(current.token)

      expect(response.status).toBe(204)

      const after = await prisma.server.findUniqueOrThrow({
        where: { id: current.server.id },
      })

      expect(after.keyReport).toEqual(before.keyReport)
    })

    it("refuses a fingerprint that is not OpenSSH's, and more than a hundred", async () => {
      const current = await scene()
      const malformed = await beat(current.token, {
        signers: ["MD5:aa:bb"],
        pending: [],
      })
      const crowded = await beat(current.token, {
        signers: Array.from({ length: 101 }, () => SIGNER_FINGERPRINT),
        pending: [],
      })

      expect(malformed.status).toBe(422)
      expect(malformed.json.error.code).toBe("validation")
      expect(crowded.status).toBe(422)
    })
  })

  describe("GET /me/key-approvals", () => {
    it("refuses without a session", async () => {
      const response = await apiRequest("/me/key-approvals")

      expect(response.status).toBe(401)
    })

    it("shows the assigned member their own new device, signed by the one the server trusts", async () => {
      const current = await scene("assigned")
      const response = await pendingFor(current.assigned)

      expect(response.status).toBe(200)
      expect(response.json.data).toHaveLength(1)
      expect(response.json.data[0]).toMatchObject({
        server: { id: current.server.id, name: "prod" },
        device: {
          id: current.pendingDeviceId,
          name: "Nouveau portable",
          fingerprint: current.pendingFingerprint,
          public_key: PENDING_KEY,
        },
        user: {
          id: current.assigned.user.id,
          email: current.assigned.user.email,
        },
        signers: [SIGNER_FINGERPRINT],
      })
      expect(response.json.data[0]?.reported_at).toBeString()
    })

    it("shows an owner and an admin the member's device when they hold a signer", async () => {
      const byOwner = await scene("owner")
      const ownerView = await pendingFor(byOwner.owner)

      expect(ownerView.json.data.map((item) => item.device.id)).toEqual([
        byOwner.pendingDeviceId,
      ])

      await resetDb()

      const byAdmin = await scene("admin")
      const adminView = await pendingFor(byAdmin.admin)

      expect(adminView.json.data.map((item) => item.device.id)).toEqual([
        byAdmin.pendingDeviceId,
      ])
    })

    it("shows nothing to a plain member, even one holding a signer", async () => {
      const current = await scene("member")
      const response = await pendingFor(current.member)

      expect(response.status).toBe(200)
      expect(response.json.data).toEqual([])
    })

    it("shows nothing to someone outside the organization", async () => {
      await scene("nobody")

      const { members } = await createOrganizationWithMembers({
        roles: ["owner"],
      })
      const [outsider] = members as [MemberFixture]

      await addDevice(outsider, "Signataire", SIGNER_KEY)

      const response = await pendingFor(outsider)

      expect(response.json.data).toEqual([])
    })

    it("shows nothing when none of the caller's devices is a signer of that server", async () => {
      const current = await scene("nobody")
      const assigned = await pendingFor(current.assigned)
      const owner = await pendingFor(current.owner)

      expect(assigned.json.data).toEqual([])
      expect(owner.json.data).toEqual([])
    })

    it("leaves out a pending key the server should no longer hold", async () => {
      const { prisma } = await bootApiTestServer()
      const current = await scene("assigned")

      await prisma.serverRevokedDevice.create({
        data: {
          serverId: current.server.id,
          deviceId: current.pendingDeviceId,
        },
      })

      const response = await pendingFor(current.assigned)

      expect(response.json.data).toEqual([])
    })
  })

  describe("POST /me/key-approvals", () => {
    it("refuses without a session", async () => {
      const response = await apiRequest("/me/key-approvals", {
        body: { ...APPROVAL, device_id: "device" },
      })

      expect(response.status).toBe(401)
    })

    it("relays a signed approval to the agent, and keeps the keys it already reads", async () => {
      const { prisma } = await bootApiTestServer()
      const current = await scene("assigned")
      const body = submission(current)
      const response = await submit(current.assigned, body)

      expect(response.status).toBe(201)
      expect(response.json.data).toEqual({
        server_id: current.server.id,
        device_id: current.pendingDeviceId,
        signer: SIGNER_FINGERPRINT,
        issued_at: String(body.issued_at),
      })

      const state = await apiRequest<{
        authorized_keys: string[]
        keys: StateKeyBody[]
      }>("/agent/state", { bearer: current.token })

      expect(state.status).toBe(200)
      expect(state.json.authorized_keys).toEqual([
        ED25519_KEY,
        PENDING_KEY,
        SIGNER_KEY,
      ])
      expect(state.json.keys.map((key) => key.public_key)).toEqual([
        ED25519_KEY.split(" ").slice(0, 2).join(" "),
        PENDING_KEY,
        SIGNER_KEY,
      ])

      const admitted = state.json.keys.find(
        (key) => key.device_id === current.pendingDeviceId
      )

      expect(admitted?.user_id).toBe(current.assigned.user.id)
      expect(admitted?.approvals).toEqual([
        {
          server_id: current.server.id,
          public_key: PENDING_KEY,
          user_id: current.assigned.user.id,
          issued_at: String(body.issued_at),
          signer: SIGNER_FINGERPRINT,
          signature: APPROVAL.signature,
        },
      ])

      const events = await prisma.event.findMany({
        where: { action: "key.approved" },
      })

      expect(events).toHaveLength(1)
      expect(events[0]?.actorUserId).toBe(current.assigned.user.id)
      expect(events[0]?.organizationId).toBe(current.organization.id)
      expect(events[0]?.payload).toEqual({
        device_id: current.pendingDeviceId,
        device_fingerprint: current.pendingFingerprint,
        signer: SIGNER_FINGERPRINT,
      })
    })

    it("replaces the approval the same signer gave before", async () => {
      const { prisma } = await bootApiTestServer()
      const current = await scene("assigned")
      const earlier = issuedAtOf(new Date(Date.now() - DAY_MS))

      await submit(
        current.assigned,
        submission(current, { issued_at: earlier })
      )

      const again = await submit(current.assigned, submission(current))

      expect(again.status).toBe(201)

      const rows = await prisma.keyApproval.findMany({
        where: { serverId: current.server.id },
      })

      expect(rows).toHaveLength(1)
      expect(rows[0]?.issuedAt).not.toBe(earlier)
      expect(rows[0]?.approvedByUserId).toBe(current.assigned.user.id)
    })

    it("accepts the one from an owner or an admin of the organization", async () => {
      const byOwner = await scene("owner")
      const owner = await submit(byOwner.owner, submission(byOwner))

      expect(owner.status).toBe(201)

      await resetDb()

      const byAdmin = await scene("admin")
      const admin = await submit(byAdmin.admin, submission(byAdmin))

      expect(admin.status).toBe(201)
    })

    it("refuses a plain member approving someone else's device", async () => {
      const current = await scene("member")
      const response = await submit(current.member, submission(current))

      expect(response.status).toBe(403)
      expect(response.json.error.code).toBe("forbidden")
      expect(response.json.error.fix).toBeString()
    })

    it("answers not_found outside the organization, and for an unknown device", async () => {
      const current = await scene("nobody")
      const { members } = await createOrganizationWithMembers({
        roles: ["owner"],
      })
      const [outsider] = members as [MemberFixture]

      await addDevice(outsider, "Signataire", SIGNER_KEY)

      const foreign = await submit(outsider, submission(current))
      const unknown = await submit(
        current.owner,
        submission(current, { device_id: "missing" })
      )

      expect(foreign.status).toBe(404)
      expect(foreign.json.error.code).toBe("not_found")
      expect(unknown.status).toBe(404)
    })

    it("refuses a key or a user that are not the device's", async () => {
      const current = await scene("assigned")
      const key = await submit(
        current.assigned,
        submission(current, {
          public_key: SECOND_ED25519_KEY.split(" ").slice(0, 2).join(" "),
        })
      )
      const user = await submit(
        current.assigned,
        submission(current, { user_id: current.owner.user.id })
      )

      expect(key.status).toBe(422)
      expect(key.json.error.code).toBe("key_approval_invalid")
      expect(key.json.error.fix).toBeString()
      expect(user.status).toBe(422)
      expect(user.json.error.code).toBe("key_approval_invalid")
    })

    it("refuses a device the server should not hold", async () => {
      const { prisma } = await bootApiTestServer()
      const current = await scene("assigned")

      await prisma.serverRevokedDevice.create({
        data: {
          serverId: current.server.id,
          deviceId: current.pendingDeviceId,
        },
      })

      const response = await submit(current.assigned, submission(current))

      expect(response.status).toBe(422)
      expect(response.json.error.code).toBe("key_approval_invalid")
    })

    it("refuses a signer that is not one of the caller's devices", async () => {
      const current = await scene("owner")
      const response = await submit(current.assigned, submission(current))

      expect(response.status).toBe(422)
      expect(response.json.error.code).toBe("key_approval_invalid")
    })

    it("refuses an approval dated outside the window", async () => {
      const current = await scene("assigned")
      const stale = await submit(
        current.assigned,
        submission(current, {
          issued_at: issuedAtOf(new Date(Date.now() - 8 * DAY_MS)),
        })
      )
      const ahead = await submit(
        current.assigned,
        submission(current, {
          issued_at: issuedAtOf(new Date(Date.now() + 3_600_000)),
        })
      )

      expect(stale.status).toBe(422)
      expect(stale.json.error.code).toBe("key_approval_invalid")
      expect(ahead.status).toBe(422)
      expect(ahead.json.error.code).toBe("key_approval_invalid")
    })

    it("refuses a signature that is not an approval by the signer", async () => {
      const current = await scene("assigned")
      const cases = [
        "-----BEGIN SSH SIGNATURE-----\nQUJDRA==\n-----END SSH SIGNATURE-----\n",
        fixtures.approvals.wrong_namespace.signature,
        withHash(APPROVAL.signature, "sha384"),
        fixtures.approvals.ecdsa.signature,
      ]

      for (const signature of cases) {
        const response = await submit(
          current.assigned,
          submission(current, { signature })
        )

        expect(response.status).toBe(422)
        expect(response.json.error.code).toBe("key_approval_invalid")
      }
    })

    it("accepts the same envelope read back from its sha256 twin", async () => {
      const current = await scene("assigned")
      const response = await submit(
        current.assigned,
        submission(current, {
          signature: fixtures.approvals.ed25519_sha256.signature,
        })
      )

      expect(response.status).toBe(201)
    })

    it("refuses a body that breaks the contract before looking any further", async () => {
      const current = await scene("assigned")
      const response = await submit(
        current.assigned,
        submission(current, { server_id: "../etc" })
      )

      expect(response.status).toBe(422)
      expect(response.json.error.code).toBe("validation")
    })
  })

  describe("GET /agent/state keys", () => {
    it("lists every held key without its comment, with no approval yet", async () => {
      const current = await scene("nobody")
      const state = await apiRequest<{
        authorized_keys: string[]
        keys: StateKeyBody[]
      }>("/agent/state", { bearer: current.token })

      expect(state.json.authorized_keys).toEqual([ED25519_KEY, PENDING_KEY])
      expect(state.json.keys).toEqual([
        expect.objectContaining({
          public_key: ED25519_KEY.split(" ").slice(0, 2).join(" "),
          user_id: current.assigned.user.id,
          approvals: [],
        }),
        expect.objectContaining({
          public_key: PENDING_KEY,
          device_id: current.pendingDeviceId,
          approvals: [],
        }),
      ])
    })

    it("hands a server with no assigned member no key at all", async () => {
      const { organization } = await createOrganizationWithMembers({
        roles: ["owner"],
      })
      const { token } = await createServer({ organizationId: organization.id })
      const state = await apiRequest<{
        authorized_keys: string[]
        keys: StateKeyBody[]
      }>("/agent/state", { bearer: token })

      expect(state.json.authorized_keys).toEqual([])
      expect(state.json.keys).toEqual([])
    })
  })
})
