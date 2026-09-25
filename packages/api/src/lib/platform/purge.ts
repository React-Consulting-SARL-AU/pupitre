import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { purgeOrganization } from "./organization-lifecycle"
import { purgeUser, soleOwnerOrganizationOf } from "./user-lifecycle"

export const PURGE_BATCH_SIZE = 25

// Organizations first, so an account erased in the same pass no longer owns anything.
export async function purgeDeletedOrganizations(
  now: Date = new Date()
): Promise<string[]> {
  const due = await getPrisma().organization.findMany({
    where: { deletionAt: { lte: now } },
    orderBy: { deletionAt: "asc" },
    take: PURGE_BATCH_SIZE,
    select: { id: true },
  })

  for (const organization of due) {
    await purgeOrganization(organization.id, null)
  }

  return due.map((organization) => organization.id)
}

export interface UserPurgeBatch {
  purged: string[]
  next: string | null
}

const SKIP_STATE_ACTIONS = [
  "user.purge_skipped",
  "user.deleted",
  "user.reactivated",
]

// A skip is written again only once the deletion or the holding organization changed.
async function recordSkipOnce(
  userId: string,
  organizationId: string
): Promise<void> {
  const last = await getPrisma().event.findFirst({
    where: {
      targetType: "user",
      targetId: userId,
      action: { in: SKIP_STATE_ACTIONS },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { action: true, payload: true },
  })
  const heldBy = (last?.payload as { organization_id?: unknown } | null)
    ?.organization_id

  if (last?.action === "user.purge_skipped" && heldBy === organizationId) {
    return
  }

  await recordEvent({
    action: "user.purge_skipped",
    actorUserId: null,
    targetType: "user",
    targetId: userId,
    payload: { reason: "sole_owner", organization_id: organizationId },
  })
}

// Walks by identifier, so an account held back never blocks the others.
export async function purgeDeletedUsers(
  after: string | null = null,
  now: Date = new Date()
): Promise<UserPurgeBatch> {
  const due = await getPrisma().user.findMany({
    where: {
      deletionAt: { lte: now },
      ...(after === null ? {} : { id: { gt: after } }),
    },
    orderBy: { id: "asc" },
    take: PURGE_BATCH_SIZE,
    select: { id: true },
  })
  const purged: string[] = []

  for (const user of due) {
    const held = await soleOwnerOrganizationOf(user.id)

    if (held) {
      await recordSkipOnce(user.id, held)
      continue
    }

    await purgeUser(user.id, null)
    purged.push(user.id)
  }

  const last = due.at(-1)

  return {
    purged,
    next: due.length === PURGE_BATCH_SIZE && last ? last.id : null,
  }
}
