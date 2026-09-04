import {
  type Auth,
  type AuthEnv,
  CLIENT_IP_HEADER,
  createAuth,
  type EmailMessage,
} from "@pupitre/auth/server"
import type { PrismaClient } from "@pupitre/db/client"
import { app } from "../server"
import { bootTestDatabase } from "./database"

export const TEST_BASE_URL = "http://localhost:3000"

export const TEST_AUTH_ENV: AuthEnv = {
  BETTER_AUTH_SECRET: "pupitre-test-secret-pupitre-test-secret",
  BETTER_AUTH_URL: TEST_BASE_URL,
  VITE_APP_URL: TEST_BASE_URL,
}

export type TestFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export interface ApiTestServer {
  auth: Auth
  prisma: PrismaClient
  fetch: TestFetch
  sentEmails: EmailMessage[]
  reset: () => Promise<void>
  stop: () => Promise<void>
}

let booted: ApiTestServer | null = null
let booting: Promise<ApiTestServer> | null = null
let requestCounter = 0

function uniqueClientIp(): string {
  requestCounter += 1

  const high = Math.floor(requestCounter / 256) % 256
  const low = requestCounter % 256

  return `10.0.${high}.${low}`
}

function createTestFetch(auth: Auth): TestFetch {
  return (input, init) => {
    const request = new Request(input, init)
    const { pathname } = new URL(request.url)

    if (!request.headers.has(CLIENT_IP_HEADER)) {
      request.headers.set(CLIENT_IP_HEADER, uniqueClientIp())
    }

    if (pathname.startsWith("/api/auth")) {
      return auth.handler(request)
    }

    if (pathname.startsWith("/api/v1")) {
      return Promise.resolve(app.handle(request))
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }))
  }
}

async function boot(): Promise<ApiTestServer> {
  const database = await bootTestDatabase()
  const sentEmails: EmailMessage[] = []
  const auth = createAuth({
    prisma: database.prisma,
    env: TEST_AUTH_ENV,
    sendEmail: (message) => {
      sentEmails.push(message)

      return Promise.resolve()
    },
  })

  return {
    auth,
    prisma: database.prisma,
    fetch: createTestFetch(auth),
    sentEmails,
    reset: async () => {
      await database.reset()
      sentEmails.length = 0
    },
    stop: async () => {
      await database.stop()
      booted = null
      booting = null
    },
  }
}

export async function bootApiTestServer(): Promise<ApiTestServer> {
  if (booted) {
    return booted
  }

  booting ??= boot().then((server) => {
    booted = server

    return server
  })

  return await booting
}

export async function resetDb(): Promise<void> {
  const server = await bootApiTestServer()

  await server.reset()
}
