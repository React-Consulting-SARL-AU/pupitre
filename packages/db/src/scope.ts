import { AsyncLocalStorage } from "node:async_hooks"
import type { PrismaClient } from "./generated/prisma-cloudflare/client"

/**
 * The client of the request: a Worker opens one on its D1 binding for every
 * request or workflow run and everything below reads it from here, so the
 * packages never see a binding, and a test hands them its own client instead.
 */

export type WorkerPrismaClient = PrismaClient

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

/** A client resolved on each call: what a module built once, before any request, holds on to. */
export function scopedPrismaClient(): WorkerPrismaClient {
  return new Proxy({} as WorkerPrismaClient, {
    get(_target, property) {
      const client = currentPrismaClient()
      const value = Reflect.get(client, property) as unknown

      return typeof value === "function" ? value.bind(client) : value
    },
  })
}
