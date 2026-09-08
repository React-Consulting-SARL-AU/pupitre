import { type APIRequestContext, expect, type Page } from "@playwright/test"
import { HARNESS_ORIGIN, HARNESS_PORT, HARNESS_PREFIX } from "./ports"

const EXTERNAL_URL_RE = /^https?:\/\/(?!localhost|127\.0\.0\.1)/
const HMR_SOCKET_RE = new RegExp(`^ws://localhost:${HARNESS_PORT}/`)
const MAGIC_LINK_TIMEOUT_MS = 20_000
const START_URL_RE = /\/dashboard\/start$/

export function harnessUrl(path: string): string {
  return `${HARNESS_ORIGIN}${HARNESS_PREFIX}${path}`
}

export async function stayLocal(page: Page): Promise<void> {
  // Nothing leaves the machine. A subresource is refused outright; a document
  // is answered with an empty page instead, because aborting a navigation
  // leaves the tab on chrome-error and that error interrupts the next goto —
  // which is what the checkout of the fake billing sends the page into.
  await page.route(EXTERNAL_URL_RE, (route) =>
    route.request().isNavigationRequest()
      ? route.fulfill({ body: "", contentType: "text/html", status: 200 })
      : route.abort()
  )

  // The harness proxies HTTP only: left unanswered, the Vite HMR socket makes
  // the client reload the page in the middle of a step.
  await page.routeWebSocket(HMR_SOCKET_RE, () => {
    // no upstream, no reload
  })
}

/** The authentication screens are server-rendered: a click before hydration hits dead markup. */
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

/** The magic link both creates the account and opens the console on its first step. */
export async function signIn(
  page: Page,
  request: APIRequestContext,
  email: string
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
  await expect(page).toHaveURL(START_URL_RE)
}

export async function openTrial(
  request: APIRequestContext,
  email: string
): Promise<void> {
  const opened = await request.post(harnessUrl("/trial"), { data: { email } })

  expect(((await opened.json()) as { handled: boolean }).handled).toBe(true)
}

export async function seedServer(
  request: APIRequestContext,
  data: { email: string; name: string; status?: string }
): Promise<void> {
  const seeded = await request.post(harnessUrl("/servers"), { data })

  expect(seeded.ok()).toBe(true)
}
