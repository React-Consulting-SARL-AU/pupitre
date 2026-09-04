import type { Server, ServerStatus } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"
import { authorizedKeysForUser } from "./authorized-keys"
import { hashServerToken, isServerToken } from "./tokens"

export interface ServerForUser {
  id: string
  name: string
  host: string | null
  port: number | null
  user: string | null
  host_fingerprint: string | null
  status: ServerStatus
  key_ready: boolean
}

export async function findServerByToken(token: string): Promise<Server | null> {
  if (!isServerToken(token)) {
    return null
  }

  const serverTokenHash = await hashServerToken(token)

  return await getPrisma().server.findUnique({ where: { serverTokenHash } })
}

export async function listServersForUser(
  userId: string
): Promise<ServerForUser[]> {
  const prisma = getPrisma()
  const [servers, keys] = await Promise.all([
    prisma.server.findMany({
      where: { assignedUserId: userId },
      orderBy: { createdAt: "asc" },
    }),
    authorizedKeysForUser(prisma, userId),
  ])
  const keyReady = keys.length > 0

  return servers.map((server) => ({
    id: server.id,
    name: server.name,
    // L'hôte, le port et l'utilisateur SSH arrivent à l'enrôlement (PLT-05) ; la table Server ne les porte pas encore.
    host: null,
    port: null,
    user: null,
    host_fingerprint: server.hostFingerprint,
    status: server.status,
    key_ready: keyReady,
  }))
}
