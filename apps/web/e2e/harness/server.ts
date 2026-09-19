import { ingestInboundEmail } from "@pupitre/api/mail/ingest"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import {
  postStripeWebhook,
  remoteSubscription,
  stripeEvent,
  stripeSubscriptionObject,
  useFakeBilling,
  useLaunchBilling,
} from "@pupitre/api/testing/billing"
import { createServer } from "@pupitre/api/testing/factories"
import { seedPlatformMailboxes, useFakeMail } from "@pupitre/api/testing/mail"
import { joinPlatformOrganization } from "@pupitre/auth/testing"
import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import { serve } from "bun"
import { HARNESS_PORT, HARNESS_PREFIX, VITE_PORT } from "./ports"

// One origin for the browser: the API and Better Auth answer here from SQLite,
// everything else is the Vite dev server. The Worker never reaches a database.
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`
const API_PREFIXES = ["/api/v1", "/api/auth"]
const MAGIC_LINK_RE = /https?:\/\/\S+/
const BODYLESS_METHODS = new Set(["GET", "HEAD"])

const TRIAL_DAYS_MS = 14 * 86_400_000

const SUPPORT_ADDRESS = LEGAL_CONTACTS.support

// The console never opens a subscription: Checkout is faked and Stripe's
// webhook is played back, exactly as in production.
// biome-ignore lint/correctness/useHookAtTopLevel: the test harness reads as a hook by name only
const billing = useFakeBilling()

// The bucket and the sending binding only exist inside the Worker.
// biome-ignore lint/correctness/useHookAtTopLevel: the test harness reads as a hook by name only
useFakeMail()

type SeededStatus = "enrolling" | "active" | "grace" | "suspended" | "revoked"

interface SeedServerBody {
  email: string
  name: string
  status?: SeededStatus
}

interface TrialBody {
  email: string
}

interface PlatformMemberBody {
  email: string
  role?: "owner" | "admin" | "member"
}

interface BillingModeBody {
  mode: "stripe" | "launch"
  ends_at?: string
}

interface InboundEmailBody {
  from: string
  subject: string
  text: string
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
    status: body.status,
  })

  return json({ id: server.id, name: server.name })
}

/** Stripe alone opens a subscription: the harness plays its webhook, nothing else. */
async function openTrial(body: TrialBody): Promise<Response> {
  const organizationId = await organizationOf(body.email)

  billing.put(
    remoteSubscription({
      id: `sub_e2e_${organizationId}`,
      customerId: `cus_e2e_${organizationId}`,
      organizationId,
      status: "trialing",
      quantity: 1,
      currentPeriodEnd: new Date(Date.now() + TRIAL_DAYS_MS),
    })
  )

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

/** What the seed writes for the owner: a seat in Pupitre's own organization, which is what opens the platform pages. */
async function promotePlatformMember(
  body: PlatformMemberBody
): Promise<Response> {
  const { prisma } = await bootApiTestServer()
  const user = await prisma.user.findUnique({ where: { email: body.email } })

  if (!user) {
    return json({ error: `no account for ${body.email}` }, 404)
  }

  await joinPlatformOrganization(prisma, user.id, body.role ?? "owner")

  return json({ id: user.id })
}

/** An email reaching a support address, handed over the way the Worker hands it over. */
async function receiveEmail(body: InboundEmailBody): Promise<Response> {
  const raw = [
    `From: ${body.from}`,
    `To: ${SUPPORT_ADDRESS}`,
    `Subject: ${body.subject}`,
    `Message-ID: <${crypto.randomUUID()}@e2e.local>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body.text,
    "",
  ].join("\r\n")
  const { threadId } = await ingestInboundEmail({
    envelopeFrom: body.from,
    envelopeTo: SUPPORT_ADDRESS,
    raw: new TextEncoder().encode(raw).buffer as ArrayBuffer,
  })

  return json({ id: threadId, address: SUPPORT_ADDRESS })
}

/** The launch has no Stripe at all; every reset puts the payment provider back. */
function chooseBillingMode(body: BillingModeBody): Response {
  if (body.mode === "launch") {
    // biome-ignore lint/correctness/useHookAtTopLevel: the test harness reads as a hook by name only
    useLaunchBilling(body.ends_at ? { endsAt: new Date(body.ends_at) } : {})
  } else {
    // biome-ignore lint/correctness/useHookAtTopLevel: the test harness reads as a hook by name only
    useFakeBilling()
  }

  return json({ mode: body.mode })
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
    await seedPlatformMailboxes()
    billing.reset()
    chooseBillingMode({ mode: "stripe" })

    return json({ ok: true })
  }

  if (path === "/trial") {
    return await openTrial((await request.json()) as TrialBody)
  }

  if (path === "/platform-member") {
    return await promotePlatformMember(
      (await request.json()) as PlatformMemberBody
    )
  }

  if (path === "/billing-mode") {
    return chooseBillingMode((await request.json()) as BillingModeBody)
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

  if (path === "/inbound-emails") {
    return await receiveEmail((await request.json()) as InboundEmailBody)
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
await seedPlatformMailboxes()

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
