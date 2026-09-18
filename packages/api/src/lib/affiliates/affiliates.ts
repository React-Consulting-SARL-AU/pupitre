import type { AffiliateLink } from "@pupitre/db/cloudflare/client"
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import { AFFILIATE_CODE_LENGTH, AFFILIATE_CODE_RE } from "@pupitre/shared/plans"
import { getPrisma, isUniqueViolation } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { liveAmong } from "../billing/subscription"

export interface AffiliateLinkView {
  id: string
  code: string
  name: string
  free_months: number
  seats: number
  disabled: boolean
  created_at: Date
  referrals: number
  url: string
}

export interface AffiliateLinkInput {
  name: string
  code?: string
  free_months: number
  seats?: number
}

export interface AffiliateActor {
  userId: string
}

export interface ReferralActor {
  organizationId: string
  userId: string
}

export class AffiliateCodeTakenError extends Error {
  readonly code: string

  constructor(code: string) {
    super(`the affiliate code "${code}" is already taken`)
    this.name = "AffiliateCodeTakenError"
    this.code = code
  }
}

const CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

const WITH_REFERRAL_COUNT = { _count: { select: { referrals: true } } }

type LinkRow = AffiliateLink & { _count: { referrals: number } }

export function generateAffiliateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(AFFILIATE_CODE_LENGTH))

  return Array.from(
    bytes,
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]
  ).join("")
}

export function affiliateUrl(code: string): string {
  return `${PUPITRE_ORIGINS.site}/?ref=${encodeURIComponent(code)}`
}

function toView(link: LinkRow): AffiliateLinkView {
  return {
    id: link.id,
    code: link.code,
    name: link.name,
    free_months: link.freeMonths,
    seats: link.seats,
    disabled: link.disabledAt !== null,
    created_at: link.createdAt,
    referrals: link._count.referrals,
    url: affiliateUrl(link.code),
  }
}

export async function listAffiliateLinks(): Promise<AffiliateLinkView[]> {
  const links = await getPrisma().affiliateLink.findMany({
    orderBy: { createdAt: "desc" },
    include: WITH_REFERRAL_COUNT,
  })

  return links.map(toView)
}

export interface AffiliateReferredOrganization {
  id: string
  name: string
  slug: string
  created_at: Date
  subscription_status: string | null
  referred_at: Date
}

export interface AffiliateLinkDetail extends AffiliateLinkView {
  organizations: AffiliateReferredOrganization[]
}

export async function readAffiliateLink(
  linkId: string
): Promise<AffiliateLinkDetail | null> {
  const prisma = getPrisma()
  const link = await prisma.affiliateLink.findUnique({
    where: { id: linkId },
    include: {
      ...WITH_REFERRAL_COUNT,
      referrals: {
        orderBy: { createdAt: "desc" },
        include: {
          organization: {
            select: { id: true, name: true, slug: true, createdAt: true },
          },
        },
      },
    },
  })

  if (!link) {
    return null
  }

  const subscriptions = await prisma.subscription.findMany({
    where: {
      organizationId: {
        in: link.referrals.map((referral) => referral.organizationId),
      },
    },
    orderBy: { updatedAt: "desc" },
    select: { organizationId: true, status: true },
  })
  const byOrganization = new Map<string, { status: string }[]>()

  for (const subscription of subscriptions) {
    const kept = byOrganization.get(subscription.organizationId) ?? []

    kept.push(subscription)
    byOrganization.set(subscription.organizationId, kept)
  }

  return {
    ...toView(link),
    organizations: link.referrals.map((referral) => ({
      id: referral.organization.id,
      name: referral.organization.name,
      slug: referral.organization.slug,
      created_at: referral.organization.createdAt,
      subscription_status:
        liveAmong(byOrganization.get(referral.organizationId) ?? [])?.status ??
        null,
      referred_at: referral.createdAt,
    })),
  }
}

async function codeIsTaken(code: string): Promise<boolean> {
  const existing = await getPrisma().affiliateLink.findUnique({
    where: { code },
    select: { id: true },
  })

  return existing !== null
}

async function freeCode(): Promise<string> {
  let code = generateAffiliateCode()

  while (await codeIsTaken(code)) {
    code = generateAffiliateCode()
  }

  return code
}

export async function createAffiliateLink(
  actor: AffiliateActor,
  input: AffiliateLinkInput
): Promise<AffiliateLinkView> {
  if (input.code && (await codeIsTaken(input.code))) {
    throw new AffiliateCodeTakenError(input.code)
  }

  const code = input.code ?? (await freeCode())
  let link: LinkRow

  try {
    link = await getPrisma().affiliateLink.create({
      data: {
        code,
        name: input.name,
        freeMonths: input.free_months,
        seats: input.seats ?? 1,
        createdById: actor.userId,
      },
      include: WITH_REFERRAL_COUNT,
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AffiliateCodeTakenError(code)
    }

    throw error
  }

  await recordEvent({
    action: "affiliate_link.created",
    actorUserId: actor.userId,
    targetType: "affiliate_link",
    targetId: link.id,
    payload: {
      code: link.code,
      name: link.name,
      free_months: link.freeMonths,
      seats: link.seats,
    },
  })

  return toView(link)
}

export async function setAffiliateLinkDisabled(
  actor: AffiliateActor,
  linkId: string,
  disabled: boolean
): Promise<AffiliateLinkView | null> {
  const prisma = getPrisma()
  const existing = await prisma.affiliateLink.findUnique({
    where: { id: linkId },
    select: { id: true },
  })

  if (!existing) {
    return null
  }

  const link = await prisma.affiliateLink.update({
    where: { id: linkId },
    data: { disabledAt: disabled ? new Date() : null },
    include: WITH_REFERRAL_COUNT,
  })

  await recordEvent({
    action: "affiliate_link.updated",
    actorUserId: actor.userId,
    targetType: "affiliate_link",
    targetId: link.id,
    payload: { code: link.code, disabled },
  })

  return toView(link)
}

export async function referralLinkOf(
  organizationId: string
): Promise<AffiliateLink | null> {
  const referral = await getPrisma().referral.findUnique({
    where: { organizationId },
    include: { link: true },
  })

  return referral?.link ?? null
}

/**
 * Where a sign-up came from, written once: an unknown, disabled or malformed
 * code is not a refusal, the checkout goes on without it. Two checkouts
 * submitted at once collide on the primary key, and only the one that wrote
 * the row writes the journal line.
 */
export async function recordReferral(
  actor: ReferralActor,
  code: string
): Promise<boolean> {
  if (!AFFILIATE_CODE_RE.test(code)) {
    return false
  }

  const prisma = getPrisma()
  const [link, existing] = await Promise.all([
    prisma.affiliateLink.findUnique({
      where: { code },
      select: { id: true, disabledAt: true },
    }),
    prisma.referral.findUnique({
      where: { organizationId: actor.organizationId },
      select: { organizationId: true },
    }),
  ])

  if (!link || link.disabledAt || existing) {
    return false
  }

  try {
    await prisma.referral.create({
      data: { organizationId: actor.organizationId, linkId: link.id },
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return false
    }

    throw error
  }

  await recordEvent({
    action: "referral.recorded",
    actorUserId: actor.userId,
    organizationId: actor.organizationId,
    targetType: "affiliate_link",
    targetId: link.id,
    payload: { code },
  })

  return true
}
