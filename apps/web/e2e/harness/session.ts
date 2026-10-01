import { type APIRequestContext, expect, type Page } from "@playwright/test"
import { HARNESS_ORIGIN, HARNESS_PORT, HARNESS_PREFIX } from "./ports"

const EXTERNAL_URL_RE = /^https?:\/\/(?!localhost|127\.0\.0\.1)/
const HMR_SOCKET_RE = new RegExp(`^ws://localhost:${HARNESS_PORT}/`)
// Only has to outlast a contended runner: a broken sign-in fails on its own.
const MAGIC_LINK_TIMEOUT_MS = 60_000
const LANDING_URL_RE = {
  start: /\/dashboard\/start$/,
  servers: /\/dashboard\/servers$/,
} as const

const CONSENT_PATH_RE = /^\/auth\/consent$/
const CONSENT_URL_RE = /\/auth\/consent\?/
const CONSENT_BOX_RE = /^J’accepte que mes données/

export type Landing = keyof typeof LANDING_URL_RE

export function harnessUrl(path: string): string {
  return `${HARNESS_ORIGIN}${HARNESS_PREFIX}${path}`
}

export async function stayLocal(page: Page): Promise<void> {
  // An aborted navigation leaves chrome-error, which breaks the next goto: documents get an empty page.
  await page.route(EXTERNAL_URL_RE, (route) =>
    route.request().isNavigationRequest()
      ? route.fulfill({ body: "", contentType: "text/html", status: 200 })
      : route.abort()
  )

  // The harness proxies HTTP only: an unanswered HMR socket reloads the page mid-step.
  await page.routeWebSocket(HMR_SOCKET_RE, () => {
    // no upstream, no reload
  })
}

// Auth screens are server-rendered: a click before hydration hits dead markup.
export async function openHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState("networkidle")
}

export async function magicLinkFor(
  request: APIRequestContext,
  email: string
): Promise<string | null> {
  const sent = await request.get(
    harnessUrl(`/magic-link?email=${encodeURIComponent(email)}`)
  )

  return ((await sent.json()) as { url: string | null }).url
}

export async function signIn(
  page: Page,
  request: APIRequestContext,
  email: string,
  landing: Landing = "start"
): Promise<void> {
  await openHydrated(page, "/auth/sign-in")
  await page.getByLabel("Adresse email").fill(email)
  await page
    .getByRole("button", { name: "Recevoir un lien de connexion" })
    .click()

  await expect
    .poll(() => magicLinkFor(request, email), {
      timeout: MAGIC_LINK_TIMEOUT_MS,
    })
    .not.toBeNull()

  const url = await magicLinkFor(request, email)

  await page.goto(url ?? "/")
  await page.waitForURL(
    (address) =>
      CONSENT_PATH_RE.test(address.pathname) ||
      LANDING_URL_RE[landing].test(address.pathname)
  )

  if (CONSENT_PATH_RE.test(new URL(page.url()).pathname)) {
    await agreeToDataStorage(page)
  }

  await expect(page).toHaveURL(LANDING_URL_RE[landing])
}

// The first entry into the console asks for the consent; later sign-ins of the same account skip it.
export async function agreeToDataStorage(page: Page): Promise<void> {
  await expect(page).toHaveURL(CONSENT_URL_RE)
  await page.getByRole("checkbox", { name: CONSENT_BOX_RE }).click()
  await page.getByRole("button", { name: "Accepter et continuer" }).click()
  await expect(page).not.toHaveURL(CONSENT_URL_RE)
}

export async function grantLicense(
  request: APIRequestContext,
  email: string,
  seats: number
): Promise<void> {
  const granted = await request.post(harnessUrl("/license"), {
    data: { email, seats },
  })

  expect(granted.ok()).toBe(true)
}

export async function promotePlatformMember(
  request: APIRequestContext,
  email: string,
  role: "owner" | "admin" | "member" = "owner"
): Promise<void> {
  const promoted = await request.post(harnessUrl("/platform-member"), {
    data: { email, role },
  })

  expect(promoted.ok()).toBe(true)
}

export async function receiveEmail(
  request: APIRequestContext,
  data: { from: string; subject: string; text: string }
): Promise<void> {
  const received = await request.post(harnessUrl("/inbound-emails"), { data })

  expect(received.ok()).toBe(true)
}

export async function seedReferral(
  request: APIRequestContext,
  data: { email: string; code: string }
): Promise<void> {
  const seeded = await request.post(harnessUrl("/referrals"), { data })

  expect(seeded.ok()).toBe(true)
}

export async function seedAlert(
  request: APIRequestContext,
  data: { email: string; server: string; kind: string }
): Promise<void> {
  const seeded = await request.post(harnessUrl("/alerts"), { data })

  expect(seeded.ok()).toBe(true)
}

export async function seedServer(
  request: APIRequestContext,
  data: { email: string; name: string; status?: string }
): Promise<void> {
  const seeded = await request.post(harnessUrl("/servers"), { data })

  expect(seeded.ok()).toBe(true)
}

// The console only adds a member by invitation.
export async function seedMember(
  request: APIRequestContext,
  data: {
    organization_email: string
    email: string
    role?: "owner" | "admin" | "member"
  }
): Promise<void> {
  const seeded = await request.post(harnessUrl("/members"), { data })

  expect(seeded.ok()).toBe(true)
}
