import { AsyncLocalStorage } from "node:async_hooks"
import type { PrismaClient } from "./generated/prisma-cloudflare/client"

export type WorkerPrismaClient = PrismaClient

// One client per request or workflow run, so packages never see the D1 binding and tests can inject their own.
const scopes = new AsyncLocalStorage<WorkerPrismaClient>()

export function withPrismaClient<T>(
  client: WorkerPrismaClient,
  run: () => T | Promise<T>
): Promise<T> {
  return scopes.run(client, async () => await run())
}

export function currentPrismaClient(): WorkerPrismaClient {
  const client = scopes.getStore()

  if (!client) {
    throw new Error(
      "no Prisma client in scope: run inside withPrismaClient, or configure one."
    )
  }

  return client
}

/** Resolved on each call, so a module built before any request can hold on to it. */
export function scopedPrismaClient(): WorkerPrismaClient {
  return new Proxy({} as WorkerPrismaClient, {
    get(_target, property) {
      const client = currentPrismaClient()
      const value = Reflect.get(client, property) as unknown

      return typeof value === "function" ? value.bind(client) : value
    },
  })
}
