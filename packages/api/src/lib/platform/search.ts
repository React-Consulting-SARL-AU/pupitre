import type { AccountState } from "@pupitre/shared/platform"
import { PLATFORM_SEARCH_RESULTS } from "@pupitre/shared/platform"
import { getPrisma } from "../api/prisma"
import { accountStateOf } from "./lifecycle"

export interface SearchUser {
  id: string
  email: string
  name: string
  state: AccountState
}

export interface SearchOrganization {
  id: string
  name: string
  slug: string
}

export interface SearchServer {
  id: string
  name: string
  host: string | null
  organization: { id: string; name: string }
}

export interface SearchThread {
  id: string
  subject: string
  address: string
}

export interface PlatformSearchResults {
  users: SearchUser[]
  organizations: SearchOrganization[]
  servers: SearchServer[]
  threads: SearchThread[]
}

// SQLite's `LIKE` (D1 and the harness) already ignores ASCII case.
export async function searchPlatform(
  query: string
): Promise<PlatformSearchResults> {
  const prisma = getPrisma()
  const q = query.trim()
  const take = PLATFORM_SEARCH_RESULTS
  const [users, organizations, servers, threads] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ email: { contains: q } }, { name: { contains: q } }] },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        email: true,
        name: true,
        banned: true,
        banExpires: true,
        deactivatedAt: true,
        deletionAt: true,
      },
    }),
    prisma.organization.findMany({
      where: { OR: [{ name: { contains: q } }, { slug: { contains: q } }] },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, name: true, slug: true },
    }),
    prisma.server.findMany({
      where: { OR: [{ name: { contains: q } }, { host: { contains: q } }] },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        name: true,
        host: true,
        organization: { select: { id: true, name: true } },
      },
    }),
    prisma.mailThread.findMany({
      where: {
        OR: [
          { subject: { contains: q } },
          {
            messages: {
              some: {
                OR: [
                  { fromEmail: { contains: q } },
                  { fromName: { contains: q } },
                ],
              },
            },
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take,
      select: { id: true, subject: true, address: true },
    }),
  ])

  return {
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      state: accountStateOf(user),
    })),
    organizations,
    servers,
    threads,
  }
}
