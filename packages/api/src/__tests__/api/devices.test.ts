import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { ApiErrorBodySchema } from "@pupitre/shared/api/errors"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  ECDSA_KEY,
  ED25519_FINGERPRINT,
  ED25519_KEY,
  MISLABELLED_RSA_KEY,
  NOT_BASE64_ED25519_KEY,
  RSA_KEY,
  SECOND_ED25519_FINGERPRINT,
  SECOND_ED25519_KEY,
  TRUNCATED_ED25519_KEY,
} from "../../testing/keys"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface DeviceBody {
  id: string
  name: string
  public_key: string
  fingerprint: string
  last_used_at: string | null
  created_at: string
}

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

type Session = { token: string }

function addDevice(session: Session, name: string, publicKey: string) {
  return apiRequest<{ data: DeviceBody } & ErrorBody>("/me/devices", {
    body: { name, public_key: publicKey },
    session,
  })
}

function listDevices(session: Session) {
  return apiRequest<{ data: DeviceBody[] }>("/me/devices", { session })
}

describe("devices", () => {
  let session: Session
  let userId: string

  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    const { user } = await createUser({ email: "jordan@test.local" })

    userId = user.id
    session = await createSession({ userId: user.id })
  })

  describe("GET /me/devices", () => {
    it("refuses without a session", async () => {
      const response = await apiRequest("/me/devices")

      expect(response.status).toBe(401)
    })

    it("answers an empty list before anything is registered", async () => {
      const response = await listDevices(session)

      expect(response.status).toBe(200)
      expect(response.json.data).toEqual([])
    })

    it("shows the devices of the caller and nobody else's", async () => {
      const { user: other } = await createUser({ email: "other@test.local" })
      const otherSession = await createSession({ userId: other.id })

      await addDevice(session, "MacBook", ED25519_KEY)
      await addDevice(otherSession, "Thinkpad", SECOND_ED25519_KEY)

      const mine = await listDevices(session)

      expect(mine.json.data).toHaveLength(1)
      expect(mine.json.data[0]).toMatchObject({
        name: "MacBook",
        public_key: ED25519_KEY,
        fingerprint: ED25519_FINGERPRINT,
        last_used_at: null,
      })
      expect(Object.keys(mine.json.data[0]).sort()).toEqual([
        "created_at",
        "fingerprint",
        "id",
        "last_used_at",
        "name",
        "public_key",
      ])
    })
  })

  describe("POST /me/devices", () => {
    it("refuses without a session", async () => {
      const response = await apiRequest("/me/devices", {
        body: { name: "MacBook", public_key: ED25519_KEY },
      })

      expect(response.status).toBe(401)
    })

    it("registers an ed25519 key and computes the OpenSSH fingerprint", async () => {
      const response = await addDevice(session, "MacBook", ED25519_KEY)

      expect(response.status).toBe(201)
      expect(response.json.data.fingerprint).toBe(ED25519_FINGERPRINT)
      expect(response.json.data.public_key).toBe(ED25519_KEY)
      expect(response.json.data.name).toBe("MacBook")

      const second = await addDevice(session, "Fixe", SECOND_ED25519_KEY)

      expect(second.json.data.fingerprint).toBe(SECOND_ED25519_FINGERPRINT)
    })

    it("refuses an RSA key and tells how to generate an ed25519 one", async () => {
      const response = await addDevice(session, "Vieux PC", RSA_KEY)

      expect(response.status).toBe(422)
      expect(ApiErrorBodySchema.safeParse(response.json).success).toBe(true)
      expect(response.json.error.code).toBe("key_not_ed25519")
      expect(response.json.error.fix).toBe(
        "générez une clé ed25519 : ssh-keygen -t ed25519"
      )
      expect((await listDevices(session)).json.data).toEqual([])
    })

    it("answers the same refusal in English", async () => {
      const response = await apiRequest<ErrorBody>("/me/devices", {
        body: { name: "Vieux PC", public_key: RSA_KEY },
        session,
        locale: "en",
      })

      expect(response.status).toBe(422)
      expect(response.json.error.code).toBe("key_not_ed25519")
      expect(response.json.error.fix).toContain("ssh-keygen -t ed25519")
    })

    it("refuses an ecdsa key", async () => {
      const response = await addDevice(session, "Vieux PC", ECDSA_KEY)

      expect(response.status).toBe(422)
      expect(response.json.error.code).toBe("key_not_ed25519")
    })

    it("refuses a key whose blob declares another type", async () => {
      const response = await addDevice(session, "Menteur", MISLABELLED_RSA_KEY)

      expect(response.status).toBe(422)
      expect(response.json.error.code).toBe("key_not_ed25519")
    })

    it("refuses a malformed ed25519 key", async () => {
      const truncated = await addDevice(
        session,
        "Tronquée",
        TRUNCATED_ED25519_KEY
      )
      const garbled = await addDevice(
        session,
        "Illisible",
        NOT_BASE64_ED25519_KEY
      )
      const alone = await addDevice(session, "Sans blob", "ssh-ed25519")

      for (const response of [truncated, garbled, alone]) {
        expect(response.status).toBe(422)
        expect(response.json.error.code).toBe("validation")
        expect(response.json.error.fix).toBeTruthy()
      }

      expect((await listDevices(session)).json.data).toEqual([])
    })

    it("refuses a fingerprint already registered", async () => {
      await addDevice(session, "MacBook", ED25519_KEY)

      const again = await addDevice(session, "MacBook bis", ED25519_KEY)

      expect(again.status).toBe(409)
      expect(again.json.error.code).toBe("device_exists")
      expect(again.json.error.fix).toBeTruthy()
      expect((await listDevices(session)).json.data).toHaveLength(1)
    })

    it("bounds the name", async () => {
      const empty = await addDevice(session, "", ED25519_KEY)
      const huge = await addDevice(session, "n".repeat(200), ED25519_KEY)

      expect(empty.status).toBe(422)
      expect(empty.json.error.code).toBe("validation")
      expect(huge.status).toBe(422)
      expect(huge.json.error.code).toBe("validation")
    })
  })

  describe("DELETE /me/devices/:id", () => {
    it("refuses without a session", async () => {
      const response = await apiRequest("/me/devices/whatever", {
        method: "DELETE",
      })

      expect(response.status).toBe(401)
    })

    it("revokes a device of the caller", async () => {
      const created = await addDevice(session, "MacBook", ED25519_KEY)
      const response = await apiRequest(`/me/devices/${created.json.data.id}`, {
        method: "DELETE",
        session,
      })

      expect(response.status).toBe(204)
      expect((await listDevices(session)).json.data).toEqual([])
    })

    it("answers 404 for an unknown device", async () => {
      const response = await apiRequest<ErrorBody>("/me/devices/nope", {
        method: "DELETE",
        session,
      })

      expect(response.status).toBe(404)
      expect(response.json.error.code).toBe("not_found")
    })

    it("answers 404 for someone else's device and keeps it", async () => {
      const { user: other } = await createUser({ email: "other@test.local" })
      const otherSession = await createSession({ userId: other.id })
      const created = await addDevice(otherSession, "Thinkpad", ED25519_KEY)
      const response = await apiRequest<ErrorBody>(
        `/me/devices/${created.json.data.id}`,
        { method: "DELETE", session }
      )

      expect(response.status).toBe(404)
      expect(response.json.error.code).toBe("not_found")
      expect((await listDevices(otherSession)).json.data).toHaveLength(1)
    })
  })

  describe("audit", () => {
    it("journals device.added and device.revoked with the actor and the target", async () => {
      const { prisma } = await bootApiTestServer()
      const created = await addDevice(session, "MacBook", ED25519_KEY)

      await apiRequest(`/me/devices/${created.json.data.id}`, {
        method: "DELETE",
        session,
      })

      const events = await prisma.event.findMany({
        where: { targetType: "device" },
        orderBy: { createdAt: "asc" },
      })

      expect(events.map((event) => event.action).sort()).toEqual([
        "device.added",
        "device.revoked",
      ])

      for (const event of events) {
        expect(event.actorUserId).toBe(userId)
        expect(event.targetId).toBe(created.json.data.id)
        expect(event.payload).toMatchObject({
          fingerprint: ED25519_FINGERPRINT,
        })
      }
    })
  })
})
