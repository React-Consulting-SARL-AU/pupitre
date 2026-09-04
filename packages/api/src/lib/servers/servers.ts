import type { Server } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"
import { hashServerToken, isServerToken } from "./tokens"

export async function findServerByToken(token: string): Promise<Server | null> {
  if (!isServerToken(token)) {
    return null
  }

  const serverTokenHash = await hashServerToken(token)

  return await getPrisma().server.findUnique({ where: { serverTokenHash } })
}
