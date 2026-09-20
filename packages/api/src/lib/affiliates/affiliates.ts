import type { AffiliateLink, Prisma } from "@pupitre/db/cloudflare/client"
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import { AFFILIATE_CODE_LENGTH, AFFILIATE_CODE_RE } from "@pupitre/shared/plans"
import { getPrisma, isUniqueViolation } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { LIVE_SUBSCRIPTION_STATUSES, liveAmong } from "../billing/subscription"
import { type AffiliateClicks, clicksInWindow, clicksOf } from "./clicks"

export interface AffiliateLinkView {
  id: string
  code: string
  name: string
  free_months: number
  seats: number
  disabled: boolean
  created_at: Date
  referrals: number
  partner_name: string | null
  clicks_30_days: number
  url: string
}

export interface AffiliateLinkInput {
  name: string
  code?: string
  free_months: number
  seats?: number
  partner_name?: string | null
  partner_email?: string | null
  notes?: string | null
}

export interface AffiliateLinkUpdate {
  disabled?: boolean
  name?: string
  free_months?: number
  seats?: number
  partner_name?: string | null
  partner_email?: string | null
  notes?: string | null
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

function toView(link: LinkRow, clicks30Days: number): AffiliateLinkView {
  return {
    id: link.id,
    code: link.code,
    name: link.name,
    free_months: link.freeMonths,
    seats: link.seats,
    disabled: link.disabledAt !== null,
    created_at: link.createdAt,
    referrals: link._count.referrals,
    partner_name: link.partnerName,
    clicks_30_days: clicks30Days,
    url: affiliateUrl(link.code),
  }
}

export async function listAffiliateLinks(): Promise<AffiliateLinkView[]> {
  const links = await getPrisma().affiliateLink.findMany({
    orderBy: { createdAt: "desc" },
    include: WITH_REFERRAL_COUNT,
  })
  const clicks = await clicksInWindow(links.map((link) => link.id))

  return links.map((link) => toView(link, clicks.get(link.id) ?? 0))
}

export interface AffiliateReferredOrganization {
  id: string
  name: string
  slug: string
  created_at: Date
  subscription_status: string | null
  referred_at: Date
}

export interface AffiliatePartner {
  name: string | null
  email: string | null
}

export interface AffiliateConversion {
  referred: number
  trialing: number
  active: number
  past_due: number
  canceled: number
  seats: number
}

export interface AffiliateLinkDetail extends AffiliateLinkView {
  partner: AffiliatePartner | null
  notes: string | null
  clicks: AffiliateClicks
  conversion: AffiliateConversion
  organizations: AffiliateReferredOrganization[]
}

interface CountingSubscription {
  status: string
  quantity: number
}

const COUNTED_STATUSES = ["trialing", "active", "past_due", "canceled"] as const

type CountedStatus = (typeof COUNTED_STATUSES)[number]

function isCounted(status: string): status is CountedStatus {
  return (COUNTED_STATUSES as readonly string[]).includes(status)
}

/**
 * What the link brought: one subscription per organization, the one that
 * counts, so an old row that still receives events never speaks for the new.
 */
function conversionOf(
  counting: (CountingSubscription | null)[]
): AffiliateConversion {
  const conversion: AffiliateConversion = {
    referred: counting.length,
    trialing: 0,
    active: 0,
    past_due: 0,
    canceled: 0,
    seats: 0,
  }

  for (const subscription of counting) {
    if (!subscription) {
      continue
    }

    if (isCounted(subscription.status)) {
      conversion[subscription.status] += 1
    }

    if (LIVE_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
      conversion.seats += subscription.quantity
    }
  }

  return conversion
}

function partnerOf(link: AffiliateLink): AffiliatePartner | null {
  if (link.partnerName === null && link.partnerEmail === null) {
    return null
  }

  return { name: link.partnerName, email: link.partnerEmail }
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
    select: { organizationId: true, status: true, quantity: true },
  })
  const byOrganization = new Map<string, CountingSubscription[]>()

  for (const subscription of subscriptions) {
    const kept = byOrganization.get(subscription.organizationId) ?? []

    kept.push(subscription)
    byOrganization.set(subscription.organizationId, kept)
  }

  const counting = new Map(
    link.referrals.map((referral) => [
      referral.organizationId,
      liveAmong(byOrganization.get(referral.organizationId) ?? []),
    ])
  )
  const clicks = await clicksOf(link.id)

  return {
    ...toView(link, clicks.last_30_days),
    partner: partnerOf(link),
    notes: link.notes,
    clicks,
    conversion: conversionOf([...counting.values()]),
    organizations: link.referrals.map((referral) => ({
      id: referral.organization.id,
      name: referral.organization.name,
      slug: referral.organization.slug,
      created_at: referral.organization.createdAt,
      subscription_status:
        counting.get(referral.organizationId)?.status ?? null,
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
        partnerName: trimmedOrNull(input.partner_name) ?? null,
        partnerEmail: trimmedOrNull(input.partner_email) ?? null,
        notes: trimmedOrNull(input.notes) ?? null,
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

  return toView(link, 0)
}

function trimmedOrNull(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined || value === null) {
    return value
  }

  const trimmed = value.trim()

  return trimmed === "" ? null : trimmed
}

interface PendingChanges {
  data: Prisma.AffiliateLinkUpdateInput
  payload: Record<string, string | number | boolean | null>
}

function pendingChanges(
  existing: AffiliateLink,
  input: AffiliateLinkUpdate
): PendingChanges {
  const data: Prisma.AffiliateLinkUpdateInput = {}
  const payload: Record<string, string | number | boolean | null> = {}
  const partnerName = trimmedOrNull(input.partner_name)
  const partnerEmail = trimmedOrNull(input.partner_email)
  const notes = trimmedOrNull(input.notes)

  if (input.name !== undefined && input.name !== existing.name) {
    data.name = input.name
    payload.name = input.name
  }

  if (
    input.free_months !== undefined &&
    input.free_months !== existing.freeMonths
  ) {
    data.freeMonths = input.free_months
    payload.free_months = input.free_months
  }

  if (input.seats !== undefined && input.seats !== existing.seats) {
    data.seats = input.seats
    payload.seats = input.seats
  }

  if (partnerName !== undefined && partnerName !== existing.partnerName) {
    data.partnerName = partnerName
    payload.partner_name = partnerName
  }

  if (partnerEmail !== undefined && partnerEmail !== existing.partnerEmail) {
    data.partnerEmail = partnerEmail
    payload.partner_email = partnerEmail
  }

  if (notes !== undefined && notes !== existing.notes) {
    data.notes = notes
    payload.notes = notes
  }

  if (
    input.disabled !== undefined &&
    input.disabled !== (existing.disabledAt !== null)
  ) {
    data.disabledAt = input.disabled ? new Date() : null
    payload.disabled = input.disabled
  }

  return { data, payload }
}

export async function updateAffiliateLink(
  actor: AffiliateActor,
  linkId: string,
  input: AffiliateLinkUpdate
): Promise<AffiliateLinkView | null> {
  const prisma = getPrisma()
  const existing = await prisma.affiliateLink.findUnique({
    where: { id: linkId },
  })

  if (!existing) {
    return null
  }

  const { data, payload } = pendingChanges(existing, input)
  const changed = Object.keys(payload).length > 0
  const link = changed
    ? await prisma.affiliateLink.update({
        where: { id: linkId },
        data,
        include: WITH_REFERRAL_COUNT,
      })
    : await prisma.affiliateLink.findUniqueOrThrow({
        where: { id: linkId },
        include: WITH_REFERRAL_COUNT,
      })
  const clicks = await clicksOf(link.id)

  if (changed) {
    await recordEvent({
      action: "affiliate_link.updated",
      actorUserId: actor.userId,
      targetType: "affiliate_link",
      targetId: link.id,
      payload: { code: link.code, ...payload },
    })
  }

  return toView(link, clicks.last_30_days)
}

export class AffiliateLinkReferredError extends Error {
  constructor() {
    super("the affiliate link already brought an organization")
    this.name = "AffiliateLinkReferredError"
  }
}

export async function deleteAffiliateLink(
  actor: AffiliateActor,
  linkId: string
): Promise<boolean> {
  const prisma = getPrisma()
  const link = await prisma.affiliateLink.findUnique({ where: { id: linkId } })

  if (!link) {
    return false
  }

  // A referral written between the read and the delete would be cascaded away.
  const { count } = await prisma.affiliateLink.deleteMany({
    where: { id: linkId, referrals: { none: {} } },
  })

  if (count === 0) {
    throw new AffiliateLinkReferredError()
  }

  await recordEvent({
    action: "affiliate_link.deleted",
    actorUserId: actor.userId,
    targetType: "affiliate_link",
    targetId: link.id,
    payload: { code: link.code, name: link.name },
  })

  return true
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
