import {
  type Auth,
  type AuthEnv,
  CLIENT_IP_HEADER,
  createAuth,
  type EmailMessage,
} from "@pupitre/auth/server"
import { type ApiPrisma, configureApi, handleApiRequest } from "../server"
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
  prisma: ApiPrisma
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
      return handleApiRequest(request)
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }))
  }
}

/**
 * What the platform reads from the ambient environment, dropped before the
 * first request: a workstation's `.env.local` carries the real bucket and the
 * real publication token, and a test that saw them would assert on the
 * machine it runs on. A test that needs one of these sets it itself.
 */
const AMBIENT_VARIABLES = [
  "PUPITRE_DOWNLOADS_URL",
  "PUPITRE_PUBLISH_TOKEN",
  "PUPITRE_PUBLISH_TOKEN_PREVIOUS",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
]

async function boot(): Promise<ApiTestServer> {
  for (const name of AMBIENT_VARIABLES) {
    delete process.env[name]
  }

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
  // The Bun and Cloudflare generated clients only differ by the `$transaction` overloads.
  const prisma = database.prisma as unknown as ApiPrisma

  configureApi({ prisma, auth })

  return {
    auth,
    prisma,
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
