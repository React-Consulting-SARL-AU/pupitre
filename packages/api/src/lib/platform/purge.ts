import { getPrisma } from "../api/prisma"
import { purgeOrganization } from "./organization-lifecycle"
import { purgeUser } from "./user-lifecycle"

export const PURGE_BATCH_SIZE = 25

/**
 * The grace is over: the rows leave for good. Organizations go first, so an
 * account the same pass erases is no longer the last owner of anything, and
 * the journal keeps what each of them was.
 */
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

  for (const user of due) {
    await purgeUser(user, null)
  }

  return due.map((user) => user.id)
}
