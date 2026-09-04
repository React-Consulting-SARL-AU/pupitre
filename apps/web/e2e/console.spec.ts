import { expect, type Page, test } from "@playwright/test"
import { DESKTOP_CLIENT_ID } from "@pupitre/auth/client/desktop"
import { HARNESS_ORIGIN, HARNESS_PORT, HARNESS_PREFIX } from "./harness/ports"

const EMAIL = "ada@e2e.local"
const SERVER_NAME = "vps-e2e"
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code"
const EXTERNAL_URL_RE = /^https?:\/\/(?!localhost|127\.0\.0\.1)/
const HMR_SOCKET_RE = new RegExp(`^ws://localhost:${HARNESS_PORT}/`)
const SERVERS_URL_RE = /\/dashboard\/servers$/

interface DeviceCodes {
  device_code: string
  user_code: string
}

async function openHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path)
  // The console is a client-rendered app served by Vite: until its modules have
  // settled, a click still hits the server-rendered markup.
  await page.waitForLoadState("networkidle")
}

function harnessUrl(path: string): string {
  return `${HARNESS_ORIGIN}${HARNESS_PREFIX}${path}`
}

async function stayLocal(page: Page): Promise<void> {
  await page.route(EXTERNAL_URL_RE, (route) => route.abort())

  // The harness proxies HTTP only: left unanswered, the Vite HMR socket makes
  // the client reload the page in the middle of a step.
  await page.routeWebSocket(HMR_SOCKET_RE, () => {
    // no upstream, no reload
  })
}

test.describe("console", () => {
  test.beforeAll(async ({ request }) => {
    await request.post(harnessUrl("/reset"))
  })

  test("connexion par lien magique, serveurs, puis device flow", async ({
    page,
    request,
  }) => {
    await stayLocal(page)

    await test.step("le lien magique ouvre la console", async () => {
      await openHydrated(page, "/auth/sign-in")
      await page.getByLabel("Adresse email").fill(EMAIL)
      await page
        .getByRole("button", { name: "Recevoir un lien de connexion" })
        .click()

      await expect(
        page.getByText(`Un lien de connexion part vers ${EMAIL}`)
      ).toBeVisible()

      const sent = await request.get(
        harnessUrl(`/magic-link?email=${encodeURIComponent(EMAIL)}`)
      )
      const { url } = (await sent.json()) as { url: string | null }

      if (!url) {
        throw new Error(`no magic link sent to ${EMAIL}`)
      }

      await openHydrated(page, url)

      await expect(page).toHaveURL(SERVERS_URL_RE)
      await expect(
        page.getByRole("heading", { level: 1, name: "Serveurs" })
      ).toBeVisible()
    })

    await test.step("la liste montre le serveur enrôlé", async () => {
      await expect(page.getByText("Aucun serveur pour l'instant")).toBeVisible()

      const seeded = await request.post(harnessUrl("/servers"), {
        data: { email: EMAIL, name: SERVER_NAME },
      })

      expect(seeded.ok()).toBe(true)

      await expect(
        page.getByTestId("server-list").getByText(SERVER_NAME)
      ).toBeVisible()
    })

    await test.step("le device flow ouvre une session à l'appareil", async () => {
      const started = await request.post("/api/auth/device/code", {
        data: { client_id: DESKTOP_CLIENT_ID },
      })

      expect(started.ok()).toBe(true)

      const codes = (await started.json()) as DeviceCodes

      await openHydrated(
        page,
        `/auth/device?user_code=${encodeURIComponent(codes.user_code)}`
      )
      await page.getByRole("button", { name: "Vérifier le code" }).click()
      await page.getByRole("button", { name: "Confirmer cet appareil" }).click()

      await expect(page.getByTestId("device-approved")).toBeVisible()

      const granted = await request.post("/api/auth/device/token", {
        data: {
          grant_type: DEVICE_GRANT_TYPE,
          device_code: codes.device_code,
          client_id: DESKTOP_CLIENT_ID,
        },
      })

      expect(granted.ok()).toBe(true)

      const { access_token } = (await granted.json()) as {
        access_token: string
      }
      const me = await request.get("/api/v1/me", {
        headers: { authorization: `Bearer ${access_token}` },
      })

      const identity = (await me.json()) as { user: { email: string } }

      expect(me.ok()).toBe(true)
      expect(identity.user.email).toBe(EMAIL)
    })
  })
})
