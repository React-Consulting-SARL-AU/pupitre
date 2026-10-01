import { DATA_CONSENT_VERSION } from "@pupitre/shared/legal"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { purgeUser } from "../platform/user-lifecycle"

export const DATA_CONSENT_PATH = "/auth/consent"

export const ACCOUNT_SETTINGS_PATH = "/dashboard/settings"

export interface StoredDataConsent {
  dataConsentVersion?: string | null
  dataConsentAt?: Date | string | null
}

export interface DataConsentView {
  version: string
  accepted_at: Date
}

export class DataConsentVersionError extends Error {
  constructor(version: string) {
    super(
      `consent to version ${version} refused: the current text is ${DATA_CONSENT_VERSION}`
    )
    this.name = "DataConsentVersionError"
  }
}

export function hasCurrentDataConsent(stored: StoredDataConsent): boolean {
  return (
    stored.dataConsentVersion === DATA_CONSENT_VERSION &&
    Boolean(stored.dataConsentAt)
  )
}

export function dataConsentOf(
  stored: StoredDataConsent
): DataConsentView | null {
  if (!(hasCurrentDataConsent(stored) && stored.dataConsentAt)) {
    return null
  }

  return {
    version: DATA_CONSENT_VERSION,
    accepted_at: new Date(stored.dataConsentAt),
  }
}

export class AccountHoldsDataError extends Error {
  constructor(userId: string) {
    super(
      `user ${userId} agreed once or holds more than its sign-up: only the account deletion erases it`
    )
    this.name = "AccountHoldsDataError"
  }
}

async function organizationIsBare(
  userId: string,
  organizationId: string
): Promise<boolean> {
  if (organizationId === PLATFORM_ORGANIZATION_ID) {
    return false
  }

  const prisma = getPrisma()
  const [others, servers, subscriptions] = await Promise.all([
    prisma.member.count({ where: { organizationId, NOT: { userId } } }),
    prisma.server.count({ where: { organizationId } }),
    prisma.subscription.count({ where: { organizationId } }),
  ])

  return others === 0 && servers === 0 && subscriptions === 0
}

// What the sign-in itself created — the account, its sessions and its personal organization — is all there is.
async function holdsOnlyItsSignUp(userId: string): Promise<boolean> {
  const prisma = getPrisma()
  const [devices, memberships] = await Promise.all([
    prisma.device.count({ where: { userId } }),
    prisma.member.findMany({
      where: { userId },
      select: { organizationId: true },
    }),
  ])

  if (devices > 0) {
    return false
  }

  for (const { organizationId } of memberships) {
    if (!(await organizationIsBare(userId, organizationId))) {
      return false
    }
  }

  return true
}

export async function declineDataConsent(userId: string): Promise<void> {
  const stored = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { dataConsentVersion: true, dataConsentAt: true },
  })

  if (!stored) {
    return
  }

  const neverAgreed = !(stored.dataConsentVersion || stored.dataConsentAt)

  if (!(neverAgreed && (await holdsOnlyItsSignUp(userId)))) {
    throw new AccountHoldsDataError(userId)
  }

  await purgeUser(userId, null)
}

export async function recordDataConsent(
  userId: string,
  version: string
): Promise<DataConsentView> {
  if (version !== DATA_CONSENT_VERSION) {
    throw new DataConsentVersionError(version)
  }

  const acceptedAt = new Date()

  await getPrisma().user.update({
    where: { id: userId },
    data: { dataConsentVersion: version, dataConsentAt: acceptedAt },
  })

  await recordEvent({
    action: "user.data_consented",
    actorUserId: userId,
    targetType: "user",
    targetId: userId,
    payload: { version },
  })

  return { version, accepted_at: acceptedAt }
}
