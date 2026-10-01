import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb, TEST_BASE_URL } from "../../testing"
import { apiRequest, authRequest, CookieJar } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"
import {
  type AuthenticationResponse,
  VirtualAuthenticator,
} from "../../testing/webauthn"

const RP_ID = "localhost"

interface Passkey {
  id: string
  name?: string | null
  credentialID: string
}

async function signedInUser(email: string) {
  const { user } = await createUser({ email })
  const session = await createSession({ userId: user.id })

  return { user, session }
}

async function registerPasskey(
  session: { token: string },
  name = "MacBook d'Ada"
): Promise<{ authenticator: VirtualAuthenticator; passkey: Passkey }> {
  const authenticator = new VirtualAuthenticator({
    rpId: RP_ID,
    origin: TEST_BASE_URL,
  })
  const jar = new CookieJar()
  const bearer = { authorization: `Bearer ${session.token}` }

  const options = await authRequest<{
    challenge: string
    user: { id: string }
  }>("GET", "/passkey/generate-register-options", undefined, bearer)

  expect(options.status).toBe(200)

  jar.absorb(options.raw)

  const verified = await authRequest<Passkey>(
    "POST",
    "/passkey/verify-registration",
    { response: await authenticator.register(options.json), name },
    { ...bearer, cookie: jar.header }
  )

  expect(verified.status).toBe(200)

  return { authenticator, passkey: verified.json }
}

async function signInWithPasskey(
  authenticator: VirtualAuthenticator,
  tamper?: (response: AuthenticationResponse) => AuthenticationResponse
) {
  const jar = new CookieJar()
  const options = await authRequest<{ challenge: string }>(
    "GET",
    "/passkey/generate-authenticate-options"
  )

  expect(options.status).toBe(200)

  jar.absorb(options.raw)

  const assertion = await authenticator.authenticate(options.json)

  return await authRequest<{ session: { token: string } }>(
    "POST",
    "/passkey/verify-authentication",
    { response: tamper ? tamper(assertion) : assertion },
    { cookie: jar.header }
  )
}

describe("passkeys", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("registers a passkey from a session and lists it", async () => {
    const { session } = await signedInUser("ada@test.local")
    const { passkey } = await registerPasskey(session)

    expect(passkey.id).toBeTruthy()
    expect(passkey.name).toBe("MacBook d'Ada")

    const listed = await authRequest<Passkey[]>(
      "GET",
      "/passkey/list-user-passkeys",
      undefined,
      { authorization: `Bearer ${session.token}` }
    )

    expect(listed.status).toBe(200)
    expect(listed.json.map((row) => row.id)).toEqual([passkey.id])
  })

  it("signs in without a magic link once the passkey is registered", async () => {
    const { user, session } = await signedInUser("grace@test.local")
    const { authenticator } = await registerPasskey(session)
    const { sentEmails } = await bootApiTestServer()
    const sentBefore = sentEmails.length

    const signedIn = await signInWithPasskey(authenticator)

    expect(signedIn.status).toBe(200)
    expect(sentEmails).toHaveLength(sentBefore)

    const token = signedIn.json.session.token

    expect(token).not.toBe(session.token)

    const me = await apiRequest<{ user: { id: string } }>("/me", {
      bearer: token,
    })

    expect(me.status).toBe(200)
    expect(me.json.user.id).toBe(user.id)
  })

  it("refuses a forged signature", async () => {
    const { session } = await signedInUser("hopper@test.local")
    const { authenticator } = await registerPasskey(session)

    const forged = await signInWithPasskey(authenticator, (assertion) => ({
      ...assertion,
      response: {
        ...assertion.response,
        signature: `${assertion.response.signature.slice(0, -4)}AAAA`,
      },
    }))

    expect(forged.status).toBeGreaterThanOrEqual(400)
  })

  it("refuses to register a passkey without a session", async () => {
    const options = await authRequest(
      "GET",
      "/passkey/generate-register-options"
    )

    expect(options.status).toBe(401)
  })

  it("revokes a passkey, which no longer signs in", async () => {
    const { session } = await signedInUser("turing@test.local")
    const { authenticator, passkey } = await registerPasskey(session)

    const removed = await authRequest(
      "POST",
      "/passkey/delete-passkey",
      { id: passkey.id },
      { authorization: `Bearer ${session.token}` }
    )

    expect(removed.status).toBe(200)

    const listed = await authRequest<Passkey[]>(
      "GET",
      "/passkey/list-user-passkeys",
      undefined,
      { authorization: `Bearer ${session.token}` }
    )

    expect(listed.json).toEqual([])

    const signedIn = await signInWithPasskey(authenticator)

    expect(signedIn.status).toBeGreaterThanOrEqual(400)
  })

  it("does not show another person's passkey", async () => {
    const { session } = await signedInUser("ada@test.local")

    await registerPasskey(session)

    const other = await signedInUser("someone@test.local")
    const listed = await authRequest<Passkey[]>(
      "GET",
      "/passkey/list-user-passkeys",
      undefined,
      { authorization: `Bearer ${other.session.token}` }
    )

    expect(listed.json).toEqual([])
  })
})
