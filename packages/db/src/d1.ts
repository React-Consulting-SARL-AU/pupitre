import type { D1Database } from "@cloudflare/workers-types"
import { PrismaD1 } from "@prisma/adapter-d1"
import { PrismaClient } from "./generated/prisma-cloudflare/client"

/** A client over the Worker's D1 binding: nothing to connect, nothing to close. */
export function createD1PrismaClient(database: D1Database): PrismaClient {
  return new PrismaClient({ adapter: new PrismaD1(database) })
}
