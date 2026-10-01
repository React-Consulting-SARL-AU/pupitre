import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import type { EmailMessage } from "@pupitre/auth/server"
import {
  graceOrganizationServers,
  suspendExpiredGrace,
} from "../../lib/billing/grace"
import { bootApiTestServer, resetDb, TEST_BASE_URL } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { apiRequest, authRequest } from "../../testing/request"

const DAY_MS = 86_400_000
const URL_RE = /https?:\/\/\S+/

async function lastEmail(): Promise<EmailMessage> {
  const { sentEmails } = await bootApiTestServer()
  const last = sentEmails.at(-1)

  if (!last) {
    throw new Error("no email was sent")
  }

  return last
}

async function setLocale(userId: string, locale: string): Promise<void> {
  const { prisma } = await bootApiTestServer()

  await prisma.user.update({ where: { id: userId }, data: { locale } })
}

async function suspendOwnerServers(locale?: string) {
  const { organization, members } = await createOrganizationWithMembers({
    roles: ["owner"],
  })
  const [owner] = members

  if (locale) {
    await setLocale(owner.user.id, locale)
  }

  await createServer({ organizationId: organization.id })
  await graceOrganizationServers(organization.id, new Date(Date.now() - DAY_MS))

  const suspended = await suspendExpiredGrace()

  expect(suspended).toHaveLength(1)

  return { owner, email: await lastEmail() }
}

async function signUpByMagicLink(email: string, acceptLanguage: string) {
  const { sentEmails } = await bootApiTestServer()
  const sendCount = sentEmails.length

  const requested = await authRequest(
    "POST",
    "/sign-in/magic-link",
    { email, callbackURL: "/dashboard" },
    { "accept-language": acceptLanguage }
  )

  expect(requested.status).toBe(200)

  const link = sentEmails[sendCount].text.match(URL_RE)?.[0]

  if (!link) {
    throw new Error("no magic link in the email body")
  }

  const token = new URL(link).searchParams.get("token")
  const verified = await authRequest(
    "GET",
    `/magic-link/verify?token=${token}&callbackURL=/dashboard`,
    undefined,
    { "accept-language": acceptLanguage }
  )

  expect(verified.raw.headers.get("location")).toBe(
    `${TEST_BASE_URL}/dashboard`
  )
}

describe("the user's language", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("starts from the Accept-Language header at sign-up", async () => {
    const { prisma } = await bootApiTestServer()

    await signUpByMagicLink("grace@test.local", "fr-FR,fr;q=0.9,en;q=0.8")

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "grace@test.local" },
    })

    expect(user.locale).toBe("fr")
  })

  it("falls back to English when the header says nothing known", async () => {
    const { prisma } = await bootApiTestServer()

    await signUpByMagicLink("kurt@test.local", "de-DE,de;q=0.9")

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "kurt@test.local" },
    })

    expect(user.locale).toBe("en")
  })

  it("suspends in English an owner whose language is en, outside a request", async () => {
    const { owner, email } = await suspendOwnerServers("en")

    expect(email.to).toBe(owner.user.email)
    expect(email.subject).toBe("Your Pupitre servers are suspended")
    expect(email.text).toContain("grace period")
  })

  it("suspends in French an owner with no known language", async () => {
    const { owner, email } = await suspendOwnerServers()

    expect(email.to).toBe(owner.user.email)
    expect(email.subject).toBe("Vos serveurs Pupitre sont suspendus")
    expect(email.text).toContain("tolérance")
  })

  it("writes to each owner in their own language", async () => {
    const { sentEmails } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "owner"],
    })
    const [french, english] = members

    await setLocale(english.user.id, "en")
    await createServer({ organizationId: organization.id })
    await graceOrganizationServers(
      organization.id,
      new Date(Date.now() - DAY_MS)
    )

    const before = sentEmails.length

    await suspendExpiredGrace()

    const sent = sentEmails.slice(before)
    const subjectFor = (email: string) =>
      sent.find((message) => message.to === email)?.subject

    expect(sent).toHaveLength(2)
    expect(subjectFor(french.user.email)).toBe(
      "Vos serveurs Pupitre sont suspendus"
    )
    expect(subjectFor(english.user.email)).toBe(
      "Your Pupitre servers are suspended"
    )
  })

  it("is changed from the console and read back on /me", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members

    const before = await apiRequest<{ user: { locale: string } }>("/me", {
      session: owner,
    })

    expect(before.json.user.locale).toBe("fr")

    const changed = await apiRequest<{ user: { locale: string } }>("/me", {
      method: "PATCH",
      body: { locale: "en" },
      session: owner,
    })

    expect(changed.status).toBe(200)
    expect(changed.json.user.locale).toBe("en")

    const after = await apiRequest<{ user: { locale: string } }>("/me", {
      session: owner,
    })

    expect(after.json.user.locale).toBe("en")
  })

  it("refuses a language the platform does not speak", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members

    const refused = await apiRequest<{ error: { code: string } }>("/me", {
      method: "PATCH",
      body: { locale: "de" },
      session: owner,
    })

    expect(refused.status).toBe(422)
    expect(refused.json.error.code).toBe("validation")
  })

  it("refuses to change the language without a session", async () => {
    const refused = await apiRequest("/me", {
      method: "PATCH",
      body: { locale: "en" },
    })

    expect(refused.status).toBe(401)
  })
})
