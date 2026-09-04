import type { AuthPrisma } from "./prisma"

const DIACRITICS_RE = /[\u0300-\u036f]/g
const NON_SLUG_RE = /[^a-z0-9]+/g
const EDGE_DASHES_RE = /^-+|-+$/g
const MAX_SLUG_ATTEMPTS = 20
const FALLBACK_SLUG = "personal"

export function personalOrganizationName(email: string): string {
  const [localPart] = email.split("@")

  return localPart || email
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(NON_SLUG_RE, "-")
    .replace(EDGE_DASHES_RE, "")
}

async function uniqueSlug(prisma: AuthPrisma, base: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`
    const taken = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })

    if (!taken) {
      return candidate
    }
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

export async function createPersonalOrganization(
  prisma: AuthPrisma,
  user: { id: string; email: string }
) {
  const name = personalOrganizationName(user.email)
  const slug = await uniqueSlug(prisma, slugify(name) || FALLBACK_SLUG)
  const now = new Date()

  return await prisma.organization.create({
    data: {
      id: crypto.randomUUID(),
      name,
      slug,
      createdAt: now,
      metadata: JSON.stringify({ personal: true }),
      members: {
        create: {
          id: crypto.randomUUID(),
          userId: user.id,
          role: "owner",
          createdAt: now,
        },
      },
    },
  })
}

export async function ensurePersonalOrganization(
  prisma: AuthPrisma,
  user: { id: string; email: string }
): Promise<string> {
  const existing = await firstOrganizationIdOf(prisma, user.id)

  if (existing) {
    return existing
  }

  const organization = await createPersonalOrganization(prisma, user)

  return organization.id
}

export async function firstOrganizationIdOf(
  prisma: AuthPrisma,
  userId: string
): Promise<string | null> {
  const member = await prisma.member.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  })

  return member?.organizationId ?? null
}
