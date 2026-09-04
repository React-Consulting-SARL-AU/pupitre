import { getPrisma } from "../lib/api/prisma"

const BILLING_ROLES = ["owner"]

export interface Recipient {
  email: string
}

export async function userRecipient(
  userId: string | null
): Promise<Recipient | null> {
  if (!userId) {
    return null
  }

  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  return user ? { email: user.email } : null
}

/**
 * Only an `owner` touches billing, so only an owner is told about the money
 * and about what the money suspends.
 */
export async function billingRecipients(
  organizationId: string
): Promise<Recipient[]> {
  const members = await getPrisma().member.findMany({
    where: { organizationId, role: { in: BILLING_ROLES } },
    orderBy: { createdAt: "asc" },
    select: { user: { select: { email: true } } },
  })

  return members.map((member) => ({ email: member.user.email }))
}

export async function organizationName(
  organizationId: string
): Promise<string> {
  const organization = await getPrisma().organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  })

  return organization?.name ?? "Pupitre"
}
