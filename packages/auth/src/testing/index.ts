import { DATA_CONSENT_VERSION } from "@pupitre/shared/legal"
import { PLATFORM_ADMIN_ROLE } from "@pupitre/shared/permissions"
import {
  PLATFORM_ORGANIZATION_ID,
  PLATFORM_ORGANIZATION_NAME,
  PLATFORM_ORGANIZATION_SLUG,
} from "@pupitre/shared/platform"
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
  /** Defaults to the current text, since almost every test exercises an account that already agreed. */
  dataConsent?: boolean
}

export async function createTestUser(
  prisma: AuthPrisma,
  input: TestUserInput = {}
) {
  userCounter += 1

  const email = input.email ?? `user-${userCounter}@test.local`
  const consented = input.dataConsent ?? true
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email,
      name: input.name ?? email.split("@")[0],
      emailVerified: true,
      role: input.role ?? "user",
      dataConsentVersion: consented ? DATA_CONSENT_VERSION : null,
      dataConsentAt: consented ? new Date() : null,
    },
  })
  const organization = await createPersonalOrganization(prisma, user)

  if (input.role === PLATFORM_ADMIN_ROLE) {
    await joinPlatformOrganization(prisma, user.id, "owner")
  }

  return { user, organization }
}

/** Membership in the platform organization is what opens the platform pages. */
export async function joinPlatformOrganization(
  prisma: AuthPrisma,
  userId: string,
  role: "owner" | "admin" | "member"
) {
  const now = new Date()

  await prisma.organization.upsert({
    where: { id: PLATFORM_ORGANIZATION_ID },
    create: {
      id: PLATFORM_ORGANIZATION_ID,
      name: PLATFORM_ORGANIZATION_NAME,
      slug: PLATFORM_ORGANIZATION_SLUG,
      createdAt: now,
    },
    update: {},
  })

  const updated = await prisma.member.updateMany({
    where: { organizationId: PLATFORM_ORGANIZATION_ID, userId },
    data: { role },
  })

  if (updated.count > 0) {
    return
  }

  await prisma.member.create({
    data: {
      id: crypto.randomUUID(),
      organizationId: PLATFORM_ORGANIZATION_ID,
      userId,
      role,
      createdAt: now,
    },
  })
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
