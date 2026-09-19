import {
  AFFILIATE_CLICK_WINDOW_DAYS,
  AFFILIATE_CODE_RE,
} from "@pupitre/shared/plans"
import { getPrisma, isUniqueViolation } from "../api/prisma"

export interface AffiliateClicks {
  total: number
  last_30_days: number
}

const DAY_LENGTH = 10

export function clickDay(at: Date): string {
  return at.toISOString().slice(0, DAY_LENGTH)
}

export function clickWindowStart(at: Date): string {
  const start = new Date(at)

  start.setUTCDate(start.getUTCDate() - (AFFILIATE_CLICK_WINDOW_DAYS - 1))

  return clickDay(start)
}

/**
 * A visit counted for a link: one counter per link and per day, and nothing
 * else — no address, no cookie, no identifier, so there is nothing personal to
 * keep and nothing to tell apart two visitors of the same day.
 */
export async function recordAffiliateClick(
  code: string,
  at: Date = new Date()
): Promise<boolean> {
  if (!AFFILIATE_CODE_RE.test(code)) {
    return false
  }

  const prisma = getPrisma()
  const link = await prisma.affiliateLink.findUnique({
    where: { code },
    select: { id: true, disabledAt: true },
  })

  if (!link || link.disabledAt) {
    return false
  }

  const where = { linkId_day: { linkId: link.id, day: clickDay(at) } }

  try {
    await prisma.affiliateClickDay.upsert({
      where,
      create: { linkId: link.id, day: clickDay(at), count: 1 },
      update: { count: { increment: 1 } },
    })
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error
    }

    await prisma.affiliateClickDay.update({
      where,
      data: { count: { increment: 1 } },
    })
  }

  return true
}

export async function clicksInWindow(
  linkIds: string[],
  at: Date = new Date()
): Promise<Map<string, number>> {
  if (linkIds.length === 0) {
    return new Map()
  }

  const rows = await getPrisma().affiliateClickDay.groupBy({
    by: ["linkId"],
    where: { linkId: { in: linkIds }, day: { gte: clickWindowStart(at) } },
    _sum: { count: true },
  })

  return new Map(rows.map((row) => [row.linkId, row._sum.count ?? 0]))
}

export async function clicksOf(
  linkId: string,
  at: Date = new Date()
): Promise<AffiliateClicks> {
  const prisma = getPrisma()
  const [total, recent] = await Promise.all([
    prisma.affiliateClickDay.aggregate({
      where: { linkId },
      _sum: { count: true },
    }),
    prisma.affiliateClickDay.aggregate({
      where: { linkId, day: { gte: clickWindowStart(at) } },
      _sum: { count: true },
    }),
  ])

  return {
    total: total._sum.count ?? 0,
    last_30_days: recent._sum.count ?? 0,
  }
}
