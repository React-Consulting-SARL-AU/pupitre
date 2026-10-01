import type {
  AffiliateLink,
  Prisma,
  ServerStatus,
} from "@pupitre/db/cloudflare/client"
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import {
  AFFILIATE_CODE_LENGTH,
  AFFILIATE_CODE_RE,
  AFFILIATE_COOKIE,
} from "@pupitre/shared/plans"
import { inBatches } from "../api/batches"
import { getPrisma, isUniqueViolation } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { type AffiliateClicks, clicksInWindow, clicksOf } from "./clicks"

export interface AffiliateLinkView {
  id: string
  code: string
  name: string
  disabled: boolean
  created_at: Date
  referrals: number
  servers: number
  partner_name: string | null
  clicks_30_days: number
  url: string
}

export interface AffiliateLinkInput {
  name: string
  code?: string
  partner_name?: string | null
  partner_email?: string | null
  notes?: string | null
}

export interface AffiliateLinkUpdate {
  disabled?: boolean
  name?: string
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

// Servers that went through the exchange and still hold their place.
const ENROLLED_STATUSES: ServerStatus[] = ["active", "grace", "suspended"]

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

export function affiliateCodeFromCookie(cookie: string | null): string | null {
  for (const part of cookie?.split(";") ?? []) {
    const separator = part.indexOf("=")

    if (
      separator === -1 ||
      part.slice(0, separator).trim() !== AFFILIATE_COOKIE
    ) {
      continue
    }

    const value = part.slice(separator + 1).trim()

    return AFFILIATE_CODE_RE.test(value) ? value : null
  }

  return null
}

function toView(
  link: LinkRow,
  clicks30Days: number,
  servers: number
): AffiliateLinkView {
  return {
    id: link.id,
    code: link.code,
    name: link.name,
    disabled: link.disabledAt !== null,
    created_at: link.createdAt,
    referrals: link._count.referrals,
    servers,
    partner_name: link.partnerName,
    clicks_30_days: clicks30Days,
    url: affiliateUrl(link.code),
  }
}

async function enrolledServersOf(
  organizationIds: string[]
): Promise<Map<string, number>> {
  const enrolled = new Map<string, number>()

  for (const batch of inBatches(organizationIds)) {
    const rows = await getPrisma().server.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: batch },
        status: { in: ENROLLED_STATUSES },
      },
      _count: { _all: true },
    })

    for (const row of rows) {
      enrolled.set(row.organizationId, row._count._all)
    }
  }

  return enrolled
}

async function serversByLink(
  where: Prisma.ReferralWhereInput = {}
): Promise<Map<string, number>> {
  const referrals = await getPrisma().referral.findMany({
    where,
    select: { organizationId: true, linkId: true },
  })
  const enrolled = await enrolledServersOf(
    referrals.map((referral) => referral.organizationId)
  )
  const byLink = new Map<string, number>()

  for (const { organizationId, linkId } of referrals) {
    byLink.set(
      linkId,
      (byLink.get(linkId) ?? 0) + (enrolled.get(organizationId) ?? 0)
    )
  }

  return byLink
}

export async function listAffiliateLinks(): Promise<AffiliateLinkView[]> {
  const links = await getPrisma().affiliateLink.findMany({
    orderBy: { createdAt: "desc" },
    include: WITH_REFERRAL_COUNT,
  })
  const [clicks, servers] = await Promise.all([
    clicksInWindow(links.map((link) => link.id)),
    serversByLink(),
  ])

  return links.map((link) =>
    toView(link, clicks.get(link.id) ?? 0, servers.get(link.id) ?? 0)
  )
}

export interface AffiliateReferredOrganization {
  id: string
  name: string
  slug: string
  created_at: Date
  servers: number
  referred_at: Date
}

export interface AffiliatePartner {
  name: string | null
  email: string | null
}

export interface AffiliateConversion {
  referred: number
  servers: number
}

export interface AffiliateLinkDetail extends AffiliateLinkView {
  partner: AffiliatePartner | null
  notes: string | null
  clicks: AffiliateClicks
  conversion: AffiliateConversion
  organizations: AffiliateReferredOrganization[]
}

function partnerOf(link: AffiliateLink): AffiliatePartner | null {
  if (link.partnerName === null && link.partnerEmail === null) {
    return null
  }

  return { name: link.partnerName, email: link.partnerEmail }
}

async function serversOfLink(linkId: string): Promise<number> {
  const servers = await serversByLink({ linkId })

  return servers.get(linkId) ?? 0
}

export async function readAffiliateLink(
  linkId: string
): Promise<AffiliateLinkDetail | null> {
  const link = await getPrisma().affiliateLink.findUnique({
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

  const [enrolled, clicks] = await Promise.all([
    enrolledServersOf(
      link.referrals.map((referral) => referral.organizationId)
    ),
    clicksOf(link.id),
  ])
  const organizations = link.referrals.map((referral) => ({
    id: referral.organization.id,
    name: referral.organization.name,
    slug: referral.organization.slug,
    created_at: referral.organization.createdAt,
    servers: enrolled.get(referral.organizationId) ?? 0,
    referred_at: referral.createdAt,
  }))
  const servers = organizations.reduce(
    (total, organization) => total + organization.servers,
    0
  )

  return {
    ...toView(link, clicks.last_30_days, servers),
    partner: partnerOf(link),
    notes: link.notes,
    clicks,
    conversion: { referred: organizations.length, servers },
    organizations,
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
    payload: { code: link.code, name: link.name },
  })

  return toView(link, 0, 0)
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
  const [clicks, servers] = await Promise.all([
    clicksOf(link.id),
    serversOfLink(link.id),
  ])

  if (changed) {
    await recordEvent({
      action: "affiliate_link.updated",
      actorUserId: actor.userId,
      targetType: "affiliate_link",
      targetId: link.id,
      payload: { code: link.code, ...payload },
    })
  }

  return toView(link, clicks.last_30_days, servers)
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

/** A bad code never blocks the caller; of two concurrent writes, only the winner logs. */
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

export interface SignUpReferral extends ReferralActor {
  cookie: string | null
}

// The site leaves the code in a cookie on the shared domain; the sign-up request carries it here.
export async function recordSignUpReferral({
  cookie,
  ...actor
}: SignUpReferral): Promise<void> {
  const code = affiliateCodeFromCookie(cookie)

  if (code) {
    await recordReferral(actor, code)
  }
}
