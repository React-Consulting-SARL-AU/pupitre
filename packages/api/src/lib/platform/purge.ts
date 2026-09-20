import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { purgeOrganization } from "./organization-lifecycle"
import { purgeUser, soleOwnerOrganizationOf } from "./user-lifecycle"

export const PURGE_BATCH_SIZE = 25

/** Organizations go first, so an account the same pass erases is no longer the last owner of anything. */
export async function purgeDeletedOrganizations(
  now: Date = new Date()
): Promise<string[]> {
  const due = await getPrisma().organization.findMany({
    where: { deletionAt: { lte: now } },
    orderBy: { deletionAt: "asc" },
    take: PURGE_BATCH_SIZE,
    select: { id: true, name: true, slug: true },
  })

  for (const organization of due) {
    await purgeOrganization(organization, null)
  }

  return due.map((organization) => organization.id)
}

export async function purgeDeletedUsers(
  now: Date = new Date()
): Promise<string[]> {
  const due = await getPrisma().user.findMany({
    where: { deletionAt: { lte: now } },
    orderBy: { deletionAt: "asc" },
    take: PURGE_BATCH_SIZE,
    select: { id: true, email: true },
  })
  const purged: string[] = []

  for (const user of due) {
    const held = await soleOwnerOrganizationOf(user.id)

    if (held) {
      await recordEvent({
        action: "user.purge_skipped",
        actorUserId: null,
        targetType: "user",
        targetId: user.id,
        payload: { reason: "sole_owner", organization_id: held },
      })

      continue
    }

    await purgeUser(user, null)
    purged.push(user.id)
  }

  return purged
}
