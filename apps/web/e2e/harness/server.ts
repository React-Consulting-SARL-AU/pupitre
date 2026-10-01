import { ingestInboundEmail } from "@pupitre/api/mail/ingest"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { useBillingOff } from "@pupitre/api/testing/billing"
import { createServer } from "@pupitre/api/testing/factories"
import { seedPlatformMailboxes, useFakeMail } from "@pupitre/api/testing/mail"
import { joinPlatformOrganization } from "@pupitre/auth/testing"
import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import { serve } from "bun"
import { HARNESS_PORT, HARNESS_PREFIX, VITE_PORT } from "./ports"

// One origin: the API and Better Auth answer here from SQLite, the rest is proxied to Vite.
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`
const API_PREFIXES = ["/api/v1", "/api/auth"]
const MAGIC_LINK_RE = /https?:\/\/\S+/
const BODYLESS_METHODS = new Set(["GET", "HEAD"])

const SUPPORT_ADDRESS = LEGAL_CONTACTS.support

// Billing is off, as in production: a call reaching the fake provider is a bug.
// biome-ignore lint/correctness/useHookAtTopLevel: the test harness reads as a hook by name only
const billing = useBillingOff()

// The bucket and the sending binding only exist inside the Worker.
// biome-ignore lint/correctness/useHookAtTopLevel: the test harness reads as a hook by name only
useFakeMail()

type SeededStatus = "enrolling" | "active" | "grace" | "suspended" | "revoked"

interface SeedServerBody {
  email: string
  name: string
  status?: SeededStatus
}

interface SeedAlertBody {
  email: string
  server: string
  kind: "server_unreachable" | "disk_high" | "agent_outdated"
}

interface LicenseBody {
  email: string
  seats: number
}

interface PlatformMemberBody {
  email: string
  role?: "owner" | "admin" | "member"
}

interface InboundEmailBody {
  from: string
  subject: string
  text: string
}

interface ReferralBody {
  email: string
  code: string
}

interface SeedMemberBody {
  organization_email: string
  email: string
  role?: "owner" | "admin" | "member"
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

// `EvaluateAlerts` runs on a cron the suite never waits for.
async function seedAlert(body: SeedAlertBody): Promise<Response> {
  const { prisma } = await bootApiTestServer()
  const server = await prisma.server.findFirstOrThrow({
    where: {
      organizationId: await organizationOf(body.email),
      name: body.server,
    },
  })

  await prisma.alert.create({ data: { serverId: server.id, kind: body.kind } })

  return json({ ok: true })
}

// No console route adds a member without an invitation.
async function seedMember(body: SeedMemberBody): Promise<Response> {
  const { prisma } = await bootApiTestServer()
  const organizationId = await organizationOf(body.organization_email)
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: body.email },
  })
  const member = await prisma.member.create({
    data: {
      id: crypto.randomUUID(),
      organizationId,
      userId: user.id,
      role: body.role ?? "member",
      createdAt: new Date(),
    },
  })

  return json({ id: member.id })
}

// Written straight, as the platform's grant writes it: the grant flow is the admin suite's subject.
async function grantLicense(body: LicenseBody): Promise<Response> {
  const { prisma } = await bootApiTestServer()
  const organizationId = await organizationOf(body.email)
  const license = await prisma.subscription.create({
    data: {
      organizationId,
      stripeSubscriptionId: `granted_e2e_${organizationId}`,
      product: "granted",
      quantity: body.seats,
      status: "active",
    },
  })

  return json({ id: license.id })
}

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

// Written straight: the sign-up it rides on is another suite's subject.
async function seedReferral(body: ReferralBody): Promise<Response> {
  const { prisma } = await bootApiTestServer()
  const link = await prisma.affiliateLink.findUnique({
    where: { code: body.code },
  })

  if (!link) {
    return json({ error: `no affiliate link ${body.code}` }, 404)
  }

  const referral = await prisma.referral.create({
    data: { organizationId: await organizationOf(body.email), linkId: link.id },
  })

  return json({ id: referral.organizationId })
}

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

    return json({ ok: true })
  }

  if (path === "/license") {
    return await grantLicense((await request.json()) as LicenseBody)
  }

  if (path === "/platform-member") {
    return await promotePlatformMember(
      (await request.json()) as PlatformMemberBody
    )
  }

  if (path === "/magic-link") {
    const email = new URL(request.url).searchParams.get("email") ?? ""

    return json({ url: await lastMagicLink(email) })
  }

  if (path === "/servers") {
    return await seedServer((await request.json()) as SeedServerBody)
  }

  if (path === "/alerts") {
    return await seedAlert((await request.json()) as SeedAlertBody)
  }

  if (path === "/inbound-emails") {
    return await receiveEmail((await request.json()) as InboundEmailBody)
  }

  if (path === "/referrals") {
    return await seedReferral((await request.json()) as ReferralBody)
  }

  if (path === "/members") {
    return await seedMember((await request.json()) as SeedMemberBody)
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
