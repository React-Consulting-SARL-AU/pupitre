import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import type { EmailMessage } from "@pupitre/auth/server"
import {
  graceOrganizationServers,
  suspendExpiredGrace,
} from "../../lib/billing/grace"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { ED25519_KEY } from "../../testing/keys"
import { HOST_PUBLIC_KEY, PROBE_REPORT } from "../../testing/probe"
import { apiRequest, authRequest } from "../../testing/request"

type Session = { token: string }

const DAY_MS = 86_400_000

async function sent(): Promise<EmailMessage[]> {
  const { sentEmails } = await bootApiTestServer()

  return sentEmails
}

async function lastEmail(): Promise<EmailMessage> {
  const emails = await sent()
  const last = emails.at(-1)

  if (!last) {
    throw new Error("no email was sent")
  }

  return last
}

function addDevice(session: Session, name: string, locale: "fr" | "en") {
  return apiRequest<{ data: { id: string } }>("/me/devices", {
    body: { name, public_key: ED25519_KEY },
    session,
    locale,
  })
}

describe("les huit moments envoient leur email", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("le lien magique part en HTML et en texte", async () => {
    const response = await authRequest("POST", "/sign-in/magic-link", {
      email: "ada@test.local",
      callbackURL: "/dashboard",
    })

    expect(response.status).toBe(200)

    const email = await lastEmail()

    expect(email.to).toBe("ada@test.local")
    expect(email.html).toContain("<html")
    expect(email.text).toContain("http")
  })

  it("l'invitation part vers l'adresse invitée", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members

    const response = await apiRequest(`/orgs/${organization.id}/invitations`, {
      body: { email: "guest@test.local", role: "member" },
      session: owner,
    })

    expect(response.status).toBe(201)

    const email = await lastEmail()

    expect(email.to).toBe("guest@test.local")
    expect(email.html).toContain(organization.name)
  })

  it("l'appareil ajouté prévient son propriétaire, dans sa langue", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members

    const added = await addDevice(owner, "MacBook", "en")

    expect(added.status).toBe(201)

    const email = await lastEmail()

    expect(email.to).toBe(owner.user.email)
    expect(email.subject).toContain("device")
    expect(email.html).toContain("MacBook")
  })

  it("le serveur enrôlé prévient quand l'agent répond", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", "fr")
    const enrolled = await apiRequest<{
      server_id: string
      enrollment_token: string
    }>("/servers/enroll", {
      body: {
        device_id: device.json.data.id,
        host: "vps.test",
        probe: PROBE_REPORT,
      },
      session: owner,
    })

    expect(enrolled.status).toBe(201)

    const before = (await sent()).length
    const exchanged = await apiRequest("/agent/exchange", {
      body: {
        enrollment_token: enrolled.json.enrollment_token,
        host_public_key: HOST_PUBLIC_KEY,
        agent_version: "1.4.0",
        arch: "amd64",
      },
    })

    expect(exchanged.status).toBe(200)
    expect((await sent()).length).toBe(before + 1)

    const email = await lastEmail()

    expect(email.to).toBe(owner.user.email)
    expect(email.html).toContain("vps.test")
    expect(email.html).toContain("1.4.0")
  })

  it("l'attribution prévient la personne attribuée", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const [owner, member] = members
    const { server } = await createServer({
      organizationId: organization.id,
      name: "vps-attribue",
    })

    const assigned = await apiRequest(`/servers/${server.id}/assign`, {
      body: { user_id: member.user.id },
      session: owner,
    })

    expect(assigned.status).toBe(200)

    const email = await lastEmail()

    expect(email.to).toBe(member.user.email)
    expect(email.subject).toContain("vps-attribue")
  })

  it("la tolérance prévient les propriétaires de l'organisation", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const [owner] = members

    await createServer({ organizationId: organization.id })

    const before = (await sent()).length

    await graceOrganizationServers(
      organization.id,
      new Date(Date.now() + 3 * DAY_MS)
    )

    const emails = await sent()

    expect(emails.length).toBe(before + 1)
    expect(emails.at(-1)?.to).toBe(owner.user.email)
  })

  it("la suspension prévient les propriétaires une fois la tolérance écoulée", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members

    await createServer({ organizationId: organization.id })
    await graceOrganizationServers(
      organization.id,
      new Date(Date.now() - DAY_MS)
    )

    const before = (await sent()).length
    const suspended = await suspendExpiredGrace()

    expect(suspended).toHaveLength(1)

    const emails = await sent()

    expect(emails.length).toBe(before + 1)
    expect(emails.at(-1)?.to).toBe(owner.user.email)
  })

  it("la suppression annonce la décommission dans sept jours", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members
    const { server } = await createServer({
      organizationId: organization.id,
      name: "vps-retire",
      assignedUserId: owner.user.id,
    })

    const removed = await apiRequest(`/servers/${server.id}`, {
      method: "DELETE",
      session: owner,
    })

    expect(removed.status).toBe(204)

    const email = await lastEmail()

    expect(email.to).toBe(owner.user.email)
    expect(email.subject).toContain("vps-retire")
  })
})
