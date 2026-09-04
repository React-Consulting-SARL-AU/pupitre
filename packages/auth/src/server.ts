import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@pupitre/db/cloudflare/client"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"

export interface CreateAuthOptions {
  baseURL?: string
  secret?: string
}

export function createAuth(
  prisma: PrismaClient,
  options: CreateAuthOptions = {}
) {
  return betterAuth({
    baseURL: options.baseURL ?? process.env.BETTER_AUTH_URL,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret: options.secret ?? process.env.BETTER_AUTH_SECRET,
  })
}

export type Auth = ReturnType<typeof createAuth>

let instance: Auth | null = null

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error("DATABASE_URL is not set")
  }

  return url
}

export function getAuth(): Auth {
  if (instance) {
    return instance
  }

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: requireDatabaseUrl() }),
  })

  instance = createAuth(prisma)

  return instance
}

export const auth = {
  handler: (request: Request): Promise<Response> => getAuth().handler(request),
}
