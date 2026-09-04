import {
  createPersonalOrganization,
  firstOrganizationIdOf,
} from "../personal-organization"
import type { AuthPrisma } from "../prisma"

const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000
const TOKEN_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const TOKEN_LENGTH = 32

let userCounter = 0

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH))

  return Array.from(
    bytes,
    (byte) => TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]
  ).join("")
}

export interface TestUserInput {
  email?: string
  name?: string
  role?: string
}

export async function createTestUser(
  prisma: AuthPrisma,
  input: TestUserInput = {}
) {
  userCounter += 1

  const email = input.email ?? `user-${userCounter}@test.local`
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email,
      name: input.name ?? email.split("@")[0],
      emailVerified: true,
      role: input.role ?? "user",
    },
  })
  const organization = await createPersonalOrganization(prisma, user)

  return { user, organization }
}

export interface TestSessionInput {
  userId: string
  activeOrganizationId?: string | null
}

export async function createTestSession(
  prisma: AuthPrisma,
  input: TestSessionInput
) {
  const activeOrganizationId =
    input.activeOrganizationId === undefined
      ? await firstOrganizationIdOf(prisma, input.userId)
      : input.activeOrganizationId
  const session = await prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      token: randomToken(),
      userId: input.userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      activeOrganizationId,
    },
  })

  return { token: session.token, session }
}

export function setTestSession(
  headers: Headers,
  session: { token: string }
): Headers {
  headers.set("authorization", `Bearer ${session.token}`)

  return headers
}
