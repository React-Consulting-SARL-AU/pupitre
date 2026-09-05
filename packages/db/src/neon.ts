import { AsyncLocalStorage } from "node:async_hooks"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "./generated/prisma-cloudflare/client"

export type NeonPrismaClient = PrismaClient

interface DatabaseScope {
  client: NeonPrismaClient | null
}

const scopes = new AsyncLocalStorage<DatabaseScope>()

function connectionString(): string {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error("DATABASE_URL is not set")
  }

  return url
}

export function createNeonPrismaClient(): NeonPrismaClient {
  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString: connectionString() }),
  })
}

/**
 * Le socket Neon appartient au contexte d'entrée-sortie qui l'a ouvert et un
 * Worker interdit d'en changer : un client ne vit donc pas plus longtemps que
 * la requête qui l'ouvre.
 */
export async function withNeonPrismaClient<T>(
  run: () => T | Promise<T>
): Promise<T> {
  const scope: DatabaseScope = { client: null }

  try {
    return await scopes.run(scope, run)
  } finally {
    await scope.client?.$disconnect()
  }
}

export function neonPrismaClient(): NeonPrismaClient {
  const scope = scopes.getStore()

  if (!scope) {
    return createNeonPrismaClient()
  }

  scope.client ??= createNeonPrismaClient()

  return scope.client
}

export function scopedNeonPrismaClient(): NeonPrismaClient {
  return new Proxy({} as NeonPrismaClient, {
    get(_target, property) {
      const client = neonPrismaClient()
      const value = Reflect.get(client, property) as unknown

      return typeof value === "function" ? value.bind(client) : value
    },
  })
}
