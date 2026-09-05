import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import {
  postStripeWebhook,
  stripeEvent,
  stripeSubscriptionObject,
  useFakeBilling,
} from "@pupitre/api/testing/billing"
import { createServer } from "@pupitre/api/testing/factories"
import { serve } from "bun"
import { HARNESS_PORT, HARNESS_PREFIX, VITE_PORT } from "./ports"

// One origin for the browser: the API and Better Auth answer here from PGlite,
// everything else is the Vite dev server. The Worker never reaches a database.
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`
const API_PREFIXES = ["/api/v1", "/api/auth"]
const MAGIC_LINK_RE = /https?:\/\/\S+/
const BODYLESS_METHODS = new Set(["GET", "HEAD"])

const TRIAL_DAYS_MS = 14 * 86_400_000

// The console never opens a subscription: Checkout is faked and Stripe's
// webhook is played back, exactly as in production.
// biome-ignore lint/correctness/useHookAtTopLevel: the test harness reads as a hook by name only
const billing = useFakeBilling()

interface SeedServerBody {
  email: string
  name: string
}

interface TrialBody {
  email: string
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status })
}

async function organizationOf(email: string): Promise<string> {
  const { prisma } = await bootApiTestServer()
  const user = await prisma.user.findUnique({
    where: { email },
    include: { members: true },
  })
  const organizationId = user?.members[0]?.organizationId

  if (!organizationId) {
    throw new Error(`no organization for ${email}`)
  }

  return organizationId
}

async function lastMagicLink(email: string): Promise<string | null> {
  const { sentEmails } = await bootApiTestServer()
  const sent = [...sentEmails].reverse().find((message) => message.to === email)

  return sent?.text.match(MAGIC_LINK_RE)?.[0] ?? null
}

async function seedServer(body: SeedServerBody): Promise<Response> {
  const { server } = await createServer({
    organizationId: await organizationOf(body.email),
    name: body.name,
  })

  return json({ id: server.id, name: server.name })
}

/** Stripe alone opens a subscription: the harness plays its webhook, nothing else. */
async function openTrial(body: TrialBody): Promise<Response> {
  const organizationId = await organizationOf(body.email)
  const received = await postStripeWebhook<{ handled: boolean }>(
    stripeEvent(
      "customer.subscription.created",
      stripeSubscriptionObject({
        id: `sub_e2e_${organizationId}`,
        customerId: `cus_e2e_${organizationId}`,
        organizationId,
        status: "trialing",
        quantity: 1,
        currentPeriodEnd: new Date(Date.now() + TRIAL_DAYS_MS),
      })
    )
  )

  return json({ handled: received.json.handled })
}

async function handleHarness(
  request: Request,
  path: string
): Promise<Response> {
  if (path === "/health") {
    return json({ ok: true })
  }

  if (path === "/reset") {
    await resetDb()
    billing.reset()

    return json({ ok: true })
  }

  if (path === "/trial") {
    return await openTrial((await request.json()) as TrialBody)
  }

  if (path === "/checkouts") {
    return json({ checkouts: billing.checkouts })
  }

  if (path === "/magic-link") {
    const email = new URL(request.url).searchParams.get("email") ?? ""

    return json({ url: await lastMagicLink(email) })
  }

  if (path === "/servers") {
    return await seedServer((await request.json()) as SeedServerBody)
  }

  return json({ error: `unknown harness route ${path}` }, 404)
}

async function handleApi(request: Request): Promise<Response> {
  const { fetch: apiFetch } = await bootApiTestServer()

  return await apiFetch(request)
}

async function handleConsole(request: Request): Promise<Response> {
  const { pathname, search } = new URL(request.url)
  const headers = new Headers(request.headers)

  headers.set("accept-encoding", "identity")

  const upstream = await fetch(`${VITE_ORIGIN}${pathname}${search}`, {
    method: request.method,
    headers,
    body: BODYLESS_METHODS.has(request.method)
      ? undefined
      : await request.arrayBuffer(),
    redirect: "manual",
  })
  const responseHeaders = new Headers(upstream.headers)

  responseHeaders.delete("content-encoding")
  responseHeaders.delete("content-length")

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

function route(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url)

  if (pathname.startsWith(HARNESS_PREFIX)) {
    return handleHarness(request, pathname.slice(HARNESS_PREFIX.length))
  }

  if (API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return handleApi(request)
  }

  return handleConsole(request)
}

await bootApiTestServer()

serve({
  port: HARNESS_PORT,
  idleTimeout: 60,
  fetch: (request) =>
    route(request).catch((error: unknown) => {
      console.error("[e2e] request failed", error)

      return json({ error: String(error) }, 500)
    }),
})

console.log(`[e2e] harness on http://localhost:${HARNESS_PORT}`)
