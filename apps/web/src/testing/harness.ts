import { createApiClient } from "@pupitre/api/client"
import {
  type ApiTestServer,
  bootApiTestServer,
  TEST_BASE_URL,
} from "@pupitre/api/testing"
import {
  createTestSession,
  createTestUser,
  setTestSession,
  type TestUserInput,
} from "@pupitre/auth/testing"
import { setApiClient } from "@/lib/api/client"

export type ConsoleFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export function withHeaders(
  server: ApiTestServer,
  extra: HeadersInit
): ConsoleFetch {
  return (input, init) => {
    const headers = new Headers(init?.headers)

    for (const [key, value] of new Headers(extra)) {
      headers.set(key, value)
    }

    return server.fetch(input, { ...init, headers })
  }
}

export async function createConsoleUser(input: TestUserInput = {}) {
  const server = await bootApiTestServer()
  const { user, organization } = await createTestUser(server.prisma, input)
  const { token } = await createTestSession(server.prisma, { userId: user.id })

  return {
    user,
    organization,
    token,
    headers: setTestSession(new Headers(), { token }),
  }
}

/** The subscription the platform grants itself during the launch, as `packages/api/src/lib/billing/launch.ts` writes it. */
export async function grantLaunch(organizationId: string, endsAt: Date) {
  const { prisma } = await bootApiTestServer()

  return await prisma.subscription.create({
    data: {
      organizationId,
      stripeSubscriptionId: `launch_${organizationId}`,
      product: "launch",
      quantity: 1,
      status: "trialing",
      currentPeriodEnd: endsAt,
    },
  })
}

export interface SessionApiClientOptions {
  /** A request the network never carries: the client throws instead of answering. */
  cut?: (url: string, init?: RequestInit) => boolean
}

export async function useSessionApiClient(
  token: string,
  { cut }: SessionApiClientOptions = {}
): Promise<void> {
  const server = await bootApiTestServer()

  setApiClient(
    createApiClient(TEST_BASE_URL, {
      fetch: (input, init) =>
        cut?.(String(input), init)
          ? Promise.reject(new Error("the network went away"))
          : server.fetch(input, init),
      headers: { authorization: `Bearer ${token}` },
    })
  )
}

/** A client whose writes never reach the API: what a gesture sees when the network drops. */
export async function useSeveredApiClient(
  token: string,
  severed: (url: string, method: string) => boolean
): Promise<void> {
  const server = await bootApiTestServer()

  setApiClient(
    createApiClient(TEST_BASE_URL, {
      fetch: (input, init) => {
        const request = new Request(input, init)

        return severed(request.url, request.method)
          ? Promise.reject(new TypeError("Failed to fetch"))
          : server.fetch(input, init)
      },
      headers: { authorization: `Bearer ${token}` },
    })
  )
}

export async function apiJson<T>(
  path: string,
  init: RequestInit & { bearer?: string } = {}
): Promise<{ status: number; json: T }> {
  const server = await bootApiTestServer()
  const headers = new Headers(init.headers)

  if (init.bearer) {
    headers.set("authorization", `Bearer ${init.bearer}`)
  }

  const response = await server.fetch(`${TEST_BASE_URL}/api/v1${path}`, {
    ...init,
    headers,
  })
  const text = await response.text()

  return {
    status: response.status,
    json: (text.length > 0 ? JSON.parse(text) : null) as T,
  }
}

export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 15_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error("condition not met before the deadline")
}
