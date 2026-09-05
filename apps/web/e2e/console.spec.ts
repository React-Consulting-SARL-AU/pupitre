import { expect, type Page, test } from "@playwright/test"
import { DESKTOP_CLIENT_ID } from "@pupitre/auth/client/desktop"
import { HARNESS_ORIGIN, HARNESS_PORT, HARNESS_PREFIX } from "./harness/ports"

const EMAIL = "ada@e2e.local"
const SERVER_NAME = "vps-e2e"
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code"
const EXTERNAL_URL_RE = /^https?:\/\/(?!localhost|127\.0\.0\.1)/
const HMR_SOCKET_RE = new RegExp(`^ws://localhost:${HARNESS_PORT}/`)
const SERVERS_URL_RE = /\/dashboard\/servers$/
const START_URL_RE = /\/dashboard\/start$/
const START_RETURN_URL_RE = /\/dashboard\/start\?checkout=done$/
const BILLING_URL_RE = /\/dashboard\/billing$/
const SETTINGS_URL_RE = /\/dashboard\/settings$/
const JOURNEY_STEP_RE =
  /Télécharger l'app|La lier à votre compte|Enrôler votre serveur/

interface DeviceCodes {
  device_code: string
  user_code: string
}

interface RecordedCheckout {
  organizationId: string
  quantity: number
  interval: string
}

/** The authentication screens are server-rendered: a click before hydration hits dead markup. */
async function openHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path)
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

  test("inscription, essai, téléchargement, liaison, serveurs", async ({
    page,
    request,
  }) => {
    await stayLocal(page)

    await test.step("la page d'entrée accueille aussi une première venue", async () => {
      await openHydrated(page, "/auth/sign-in")

      await expect(
        page.getByRole("heading", { name: "Connexion ou inscription" })
      ).toBeVisible()
      await expect(
        page.getByText("si vous n'avez pas encore de compte")
      ).toBeVisible()
    })

    await test.step("le lien magique crée le compte et ouvre la console", async () => {
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

      await page.goto(url)

      await expect(page).toHaveURL(START_URL_RE)
      await expect(
        page.getByRole("heading", { level: 1, name: "Démarrer" })
      ).toBeVisible()
      await expect(page.getByText("Quatorze jours, sans carte")).toBeVisible()
    })

    await test.step("sans essai, seuls la facturation et le profil s'ouvrent", async () => {
      for (const closed of [
        "/dashboard/servers",
        "/dashboard/members",
        "/dashboard/devices",
      ]) {
        await page.goto(closed)
        await expect(page, closed).toHaveURL(START_URL_RE)
      }

      await page.goto("/dashboard/billing")
      await expect(page).toHaveURL(BILLING_URL_RE)

      await page.goto("/dashboard/settings")
      await expect(page).toHaveURL(SETTINGS_URL_RE)
    })

    await test.step("une seule action ouvre un checkout d'un siège", async () => {
      await page.goto("/dashboard/start")
      await page.getByRole("button", { name: "Démarrer l'essai" }).click()

      await expect
        .poll(async () => {
          const recorded = await request.get(harnessUrl("/checkouts"))
          const { checkouts } = (await recorded.json()) as {
            checkouts: RecordedCheckout[]
          }

          return checkouts
        })
        .toEqual([expect.objectContaining({ quantity: 1, interval: "month" })])
    })

    await test.step("au retour de Stripe, la console attend le webhook", async () => {
      await page.goto("/dashboard/billing?checkout=done")

      await expect(page).toHaveURL(START_RETURN_URL_RE)
      await expect(
        page.getByText("Attente de la confirmation de Stripe")
      ).toBeVisible()

      const opened = await request.post(harnessUrl("/trial"), {
        data: { email: EMAIL },
      })

      expect(((await opened.json()) as { handled: boolean }).handled).toBe(true)

      await expect(page.getByText("L'essai est ouvert.")).toBeVisible()
    })

    await test.step("l'essai vaut droit d'usage, et la console s'ouvre", async () => {
      const me = await page.request.get("/api/v1/me")
      const identity = (await me.json()) as { entitlement: string }

      expect(me.ok()).toBe(true)
      expect(identity.entitlement).toBe("valid")

      await page.goto("/dashboard/servers")

      await expect(page).toHaveURL(SERVERS_URL_RE)
      await expect(page.getByText("Aucun serveur pour l'instant")).toBeVisible()
      await expect(
        page.getByRole("main").getByRole("link", { name: "Télécharger l'app" })
      ).toBeVisible()
    })

    await test.step("la facturation nomme l'essai et sa fin sans carte", async () => {
      await page.goto("/dashboard/billing")

      await expect(page.getByText("Essai en cours")).toBeVisible()
      await expect(
        page.getByText("sans carte enregistrée, Stripe résilie l'abonnement")
      ).toBeVisible()
    })

    await test.step("le téléchargement dit l'ordre, puis comment lier l'app", async () => {
      await page.goto("/download")

      const journey = page.getByRole("listitem").filter({
        hasText: JOURNEY_STEP_RE,
      })

      await expect(journey.nth(0)).toContainText("Télécharger l'app")
      await expect(journey.nth(1)).toContainText("La lier à votre compte")
      await expect(journey.nth(2)).toContainText("Enrôler votre serveur")

      await expect(
        page.getByText("Rien à télécharger pour l'instant")
      ).toBeVisible()
      await expect(page.getByText("Pas encore publié")).toHaveCount(3)

      await expect(page.getByText("Lier l'app à votre compte")).toBeVisible()
      await expect(
        page.getByRole("link", { name: "Aller à la page d'appareil" })
      ).toHaveAttribute("href", "/auth/device")
    })

    await test.step("la liste montre le serveur enrôlé", async () => {
      const seeded = await request.post(harnessUrl("/servers"), {
        data: { email: EMAIL, name: SERVER_NAME },
      })

      expect(seeded.ok()).toBe(true)

      await page.goto("/dashboard/servers")

      await expect(
        page.getByTestId("server-list").getByText(SERVER_NAME)
      ).toBeVisible()
    })

    await test.step("le device flow lie l'app au compte", async () => {
      const started = await request.post("/api/auth/device/code", {
        data: { client_id: DESKTOP_CLIENT_ID },
      })

      expect(started.ok()).toBe(true)

      const codes = (await started.json()) as DeviceCodes

      await openHydrated(
        page,
        `/auth/device?user_code=${encodeURIComponent(codes.user_code)}`
      )

      await expect(
        page.getByText("C'est ici que l'app Pupitre se lie à votre compte")
      ).toBeVisible()

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
