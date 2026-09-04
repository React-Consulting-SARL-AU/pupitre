import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb, TEST_BASE_URL } from "../../testing"
import {
  apiRequest,
  authRequest,
  CookieJar,
  sessionTokenFrom,
} from "../../testing/request"
import { createSession, createUser } from "../../testing/session"
import { totpCode, totpSecretFrom } from "../../testing/totp"
import { VirtualAuthenticator } from "../../testing/webauthn"

const URL_RE = /https?:\/\/\S+/
const CALLBACK_URL = "/dashboard/servers"
const RP_ID = "localhost"

interface EnabledTwoFactor {
  userId: string
  token: string
  secret: string
  backupCodes: string[]
}

async function enableTwoFactor(email: string): Promise<EnabledTwoFactor> {
  const { user } = await createUser({ email })
  const { token } = await createSession({ userId: user.id })

  const enabled = await authRequest<{
    totpURI: string
    backupCodes: string[]
  }>("POST", "/two-factor/enable", {}, { authorization: `Bearer ${token}` })

  expect(enabled.status).toBe(200)

  const secret = totpSecretFrom(enabled.json.totpURI)
  const confirmed = await authRequest(
    "POST",
    "/two-factor/verify-totp",
    { code: await totpCode(secret) },
    { authorization: `Bearer ${token}` }
  )

  expect(confirmed.status).toBe(200)

  const rotated = sessionTokenFrom(confirmed.raw)

  if (!rotated) {
    throw new Error("no session token after enabling the second factor")
  }

  return {
    userId: user.id,
    token: rotated,
    secret,
    backupCodes: enabled.json.backupCodes,
  }
}

async function challengeByMagicLink(email: string): Promise<CookieJar> {
  const { sentEmails } = await bootApiTestServer()
  const sent = sentEmails.length

  const requested = await authRequest("POST", "/sign-in/magic-link", {
    email,
    callbackURL: CALLBACK_URL,
  })

  expect(requested.status).toBe(200)

  const url = new URL(sentEmails[sent].text.match(URL_RE)?.[0] ?? "")
  const verified = await authRequest(
    "GET",
    `/magic-link/verify?token=${url.searchParams.get("token")}&callbackURL=${CALLBACK_URL}`
  )

  expect(verified.status).toBe(302)

  const location = new URL(verified.raw.headers.get("location") ?? "")

  expect(location.pathname).toBe("/auth/two-factor")
  expect(location.searchParams.get("callbackURL")).toBe(
    `${TEST_BASE_URL}${CALLBACK_URL}`
  )
  expect(sessionTokenFrom(verified.raw)).toBeNull()

  const jar = new CookieJar().absorb(verified.raw)

  expect(jar.names.some((name) => name.includes("two_factor"))).toBe(true)

  return jar
}

async function meWith(token: string) {
  return await apiRequest<{ user: { id: string } }>("/me", { bearer: token })
}

describe("second facteur", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("s'active depuis une session, avec un QR code et des codes de récupération", async () => {
    const { prisma } = await bootApiTestServer()
    const { userId, backupCodes } = await enableTwoFactor("ada@test.local")

    expect(backupCodes).toHaveLength(10)
    expect(new Set(backupCodes).size).toBe(10)

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

    expect(user.twoFactorEnabled).toBe(true)

    const stored = await prisma.twoFactor.findFirstOrThrow({
      where: { userId },
    })

    expect(stored.verified).toBe(true)
    expect(stored.secret).not.toContain(backupCodes[0])
  })

  it("est exigé après un lien magique, et la session n'arrive qu'avec le code", async () => {
    const { userId, secret } = await enableTwoFactor("grace@test.local")
    const jar = await challengeByMagicLink("grace@test.local")

    const verified = await authRequest<{ token: string }>(
      "POST",
      "/two-factor/verify-totp",
      { code: await totpCode(secret) },
      { cookie: jar.header }
    )

    expect(verified.status).toBe(200)

    const me = await meWith(verified.json.token)

    expect(me.status).toBe(200)
    expect(me.json.user.id).toBe(userId)
  })

  it("refuse un code invalide", async () => {
    const { secret } = await enableTwoFactor("hopper@test.local")
    const jar = await challengeByMagicLink("hopper@test.local")

    const refused = await authRequest<{ token?: string }>(
      "POST",
      "/two-factor/verify-totp",
      { code: "000000" },
      { cookie: jar.header }
    )

    expect(refused.status).toBe(401)
    expect(refused.json.token).toBeUndefined()

    const accepted = await authRequest<{ token: string }>(
      "POST",
      "/two-factor/verify-totp",
      { code: await totpCode(secret) },
      { cookie: jar.header }
    )

    expect(accepted.status).toBe(200)
  })

  it("n'accepte un code de récupération qu'une fois", async () => {
    const { backupCodes } = await enableTwoFactor("turing@test.local")
    const [code] = backupCodes

    const first = await authRequest<{ token: string }>(
      "POST",
      "/two-factor/verify-backup-code",
      { code },
      { cookie: (await challengeByMagicLink("turing@test.local")).header }
    )

    expect(first.status).toBe(200)
    expect((await meWith(first.json.token)).status).toBe(200)

    const replayed = await authRequest(
      "POST",
      "/two-factor/verify-backup-code",
      { code },
      { cookie: (await challengeByMagicLink("turing@test.local")).header }
    )

    expect(replayed.status).toBe(401)

    const another = await authRequest<{ token: string }>(
      "POST",
      "/two-factor/verify-backup-code",
      { code: backupCodes[1] },
      { cookie: (await challengeByMagicLink("turing@test.local")).header }
    )

    expect(another.status).toBe(200)
  })

  it("n'est pas exigé après une passkey, qui est déjà un second facteur", async () => {
    const { userId, token } = await enableTwoFactor("lovelace@test.local")
    const authenticator = new VirtualAuthenticator({
      rpId: RP_ID,
      origin: TEST_BASE_URL,
    })
    const registerJar = new CookieJar()
    const bearer = { authorization: `Bearer ${token}` }

    const options = await authRequest<{ challenge: string }>(
      "GET",
      "/passkey/generate-register-options",
      undefined,
      bearer
    )

    registerJar.absorb(options.raw)

    const registered = await authRequest(
      "POST",
      "/passkey/verify-registration",
      { response: await authenticator.register(options.json) },
      { ...bearer, cookie: registerJar.header }
    )

    expect(registered.status).toBe(200)

    const signInJar = new CookieJar()
    const assertionOptions = await authRequest<{ challenge: string }>(
      "GET",
      "/passkey/generate-authenticate-options"
    )

    signInJar.absorb(assertionOptions.raw)

    const signedIn = await authRequest<{ session: { token: string } }>(
      "POST",
      "/passkey/verify-authentication",
      { response: await authenticator.authenticate(assertionOptions.json) },
      { cookie: signInJar.header }
    )

    expect(signedIn.status).toBe(200)

    const me = await meWith(signedIn.json.session.token)

    expect(me.status).toBe(200)
    expect(me.json.user.id).toBe(userId)
  })

  it("se désactive depuis une session et rend le lien magique suffisant", async () => {
    const { prisma } = await bootApiTestServer()
    const { userId, token } = await enableTwoFactor("ada@test.local")

    const disabled = await authRequest(
      "POST",
      "/two-factor/disable",
      {},
      { authorization: `Bearer ${token}` }
    )

    expect(disabled.status).toBe(200)

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

    expect(user.twoFactorEnabled).toBe(false)
    expect(await prisma.twoFactor.count({ where: { userId } })).toBe(0)

    const { sentEmails } = await bootApiTestServer()
    const sent = sentEmails.length

    await authRequest("POST", "/sign-in/magic-link", {
      email: "ada@test.local",
      callbackURL: CALLBACK_URL,
    })

    const url = new URL(sentEmails[sent].text.match(URL_RE)?.[0] ?? "")
    const verified = await authRequest(
      "GET",
      `/magic-link/verify?token=${url.searchParams.get("token")}&callbackURL=${CALLBACK_URL}`
    )

    expect(verified.raw.headers.get("location")).toBe(
      `${TEST_BASE_URL}${CALLBACK_URL}`
    )

    const sessionToken = sessionTokenFrom(verified.raw)

    expect(sessionToken).toBeTruthy()
    expect((await meWith(sessionToken ?? "")).status).toBe(200)
  })
})
