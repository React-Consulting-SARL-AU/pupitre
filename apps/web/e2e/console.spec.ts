import { expect, test } from "@playwright/test"
import { DESKTOP_CLIENT_ID } from "@pupitre/auth/client/desktop"
import {
  harnessUrl,
  magicLinkFor,
  openHydrated,
  stayLocal,
} from "./harness/session"

const EMAIL = "ada@e2e.local"
const SERVER_NAME = "vps-e2e"
const SECOND_SERVER_NAME = "vps-e2e-bis"
const THIRD_SERVER_NAME = "vps-e2e-ter"
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code"
const SERVERS_URL_RE = /\/dashboard\/servers$/
const SERVER_URL_RE = /\/dashboard\/servers\/[^/]+$/
const SERVERS_TITLE_RE = /Serveurs · Pupitre/
const REVOKED_RE = /^Révoqué$/
const START_URL_RE = /\/dashboard\/start$/
const CHECKOUT_URL_RE = /^https:\/\/checkout\.stripe\.test\//
const START_RETURN_URL_RE = /\/dashboard\/start\?checkout=done$/
const BILLING_URL_RE = /\/dashboard\/billing$/
const SETTINGS_URL_RE = /\/dashboard\/settings$/
const DOWNLOAD_URL_RE = /\/dashboard\/download$/
const CHECKLIST_STEP_RE =
  /Installer l'app et la lier à votre compte|Louer un serveur et l'ajouter/
const APP_STEP = "Installer l'app et la lier à votre compte"
const START_LINK_RE = /^Démarrer · \d\/4$/
const SERVER_STEP = "Louer un serveur et l'ajouter"

interface DeviceCodes {
  device_code: string
  user_code: string
}

/** The app registers the public half of its key; the console counts it as linked. */
function openSshEd25519Key(): string {
  const type = new TextEncoder().encode("ssh-ed25519")
  const key = crypto.getRandomValues(new Uint8Array(32))
  const blob = new Uint8Array(type.length + key.length + 8)
  const view = new DataView(blob.buffer)

  view.setUint32(0, type.length)
  blob.set(type, 4)
  view.setUint32(type.length + 4, key.length)
  blob.set(key, type.length + 8)

  return `ssh-ed25519 ${btoa(String.fromCharCode(...blob))}`
}

interface RecordedCheckout {
  organizationId: string
  quantity: number
  interval: string
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
      await expect(page.getByText("Pas encore de compte ?")).toBeVisible()
    })

    await test.step("le lien magique crée le compte et ouvre la console", async () => {
      await page.getByLabel("Adresse email").fill(EMAIL)
      await page
        .getByRole("button", { name: "Recevoir un lien de connexion" })
        .click()

      await expect(
        page.getByText(`Un lien de connexion part vers ${EMAIL}`)
      ).toBeVisible()

      const url = await magicLinkFor(request, EMAIL)

      if (!url) {
        throw new Error(`no magic link sent to ${EMAIL}`)
      }

      await page.goto(url)

      await expect(page).toHaveURL(START_URL_RE)
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Quatre pas, et votre serveur travaille pour vous.",
        })
      ).toBeVisible()
      await expect(
        page.getByRole("heading", { name: "Quatorze jours, sans carte" })
      ).toBeVisible()
    })

    await test.step("la barre latérale compte les pas, et ne liste rien qui redirige", async () => {
      await expect(
        page.getByRole("link", { name: "Démarrer · 1/4" })
      ).toBeVisible()
      await expect(
        page.getByRole("link", { name: "Serveurs", exact: true })
      ).toHaveCount(0)
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

      // The click sends the page to the payment provider. Waiting for it to
      // land is what keeps the next step from racing it — the harness answers
      // that domain with an empty page, so it does land.
      await page.waitForURL(CHECKOUT_URL_RE)
    })

    await test.step("au retour du paiement, la console attend le webhook", async () => {
      await page.goto("/dashboard/billing?checkout=done")

      await expect(page).toHaveURL(START_RETURN_URL_RE)
      await expect(page.getByText("Attente de la confirmation")).toBeVisible()

      const opened = await request.post(harnessUrl("/trial"), {
        data: { email: EMAIL },
      })

      expect(((await opened.json()) as { handled: boolean }).handled).toBe(true)

      await expect(page.getByText("L'essai est ouvert.")).toBeVisible()
      await expect(
        page.getByRole("link", { name: "Démarrer · 2/4" })
      ).toBeVisible()
      await expect(
        page.getByRole("link", { name: "Serveurs", exact: true })
      ).toBeVisible()
    })

    await test.step("le téléchargement s'ouvre sans recharger la console", async () => {
      await page
        .getByRole("main")
        .getByRole("link", { name: "Toutes les plateformes" })
        .click()

      await expect(page).toHaveURL(DOWNLOAD_URL_RE)
    })

    await test.step("l'essai vaut droit d'usage, et la console s'ouvre", async () => {
      const me = await page.request.get("/api/v1/me")
      const identity = (await me.json()) as { entitlement: string }

      expect(me.ok()).toBe(true)
      expect(identity.entitlement).toBe("valid")

      await page.goto("/dashboard/servers")

      await expect(page).toHaveURL(SERVERS_URL_RE)
      await expect(page).toHaveTitle(SERVERS_TITLE_RE)
      await expect(
        page
          .getByRole("main")
          .getByRole("listitem")
          .filter({ hasText: APP_STEP })
      ).toHaveAttribute("aria-current", "step")
      await expect(
        page
          .getByRole("main")
          .getByRole("link", { name: "Toutes les plateformes" })
      ).toBeVisible()
    })

    await test.step("la facturation nomme l'essai et sa fin sans carte", async () => {
      await page.goto("/dashboard/billing")

      await expect(page.getByText("Essai en cours")).toBeVisible()
      await expect(
        page.getByText("sans carte enregistrée, l'abonnement est résilié")
      ).toBeVisible()
    })

    await test.step("l'essai monte à deux serveurs sans quitter la console", async () => {
      await page.goto("/dashboard/billing")

      await page.getByLabel("Changer le nombre de serveurs").fill("2")
      await page.getByRole("button", { name: "Mettre à jour" }).click()

      await expect(
        page.getByTestId("toasts").getByText("couvre maintenant 2 serveurs")
      ).toBeVisible()
      await expect(page.getByText("2 serveurs", { exact: true })).toBeVisible()
      await expect(page.getByText("0 / 2")).toBeVisible()
    })

    await test.step("le téléchargement s'ouvre dans la console et dit l'ordre", async () => {
      await page.goto("/download")

      await expect(page).toHaveURL(DOWNLOAD_URL_RE)

      const remaining = page.getByRole("listitem").filter({
        hasText: CHECKLIST_STEP_RE,
      })

      await expect(remaining).toHaveCount(2)
      await expect(remaining.nth(0)).toContainText(APP_STEP)
      await expect(remaining.nth(1)).toContainText(SERVER_STEP)

      await expect(page.getByText("Créer votre compte")).toHaveCount(0)

      await expect(
        page.getByText("Rien à télécharger pour l'instant")
      ).toBeVisible()
      await expect(page.getByText("Pas encore publié")).toHaveCount(3)
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
        page.getByRole("heading", { level: 1, name: "Confirmer un appareil" })
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

      const registered = await request.post("/api/v1/me/devices", {
        headers: { authorization: `Bearer ${access_token}` },
        data: { name: "Le laptop d'Ada", public_key: openSshEd25519Key() },
      })

      expect(registered.status()).toBe(201)
    })

    await test.step("l'app liée fait le troisième pas", async () => {
      await page.goto("/dashboard/servers")

      await expect(
        page.getByRole("link", { name: "Démarrer · 3/4" })
      ).toBeVisible()
      await expect(
        page
          .getByRole("main")
          .getByRole("listitem")
          .filter({ hasText: SERVER_STEP })
      ).toHaveAttribute("aria-current", "step")
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

    await test.step("le serveur s'ouvre, et le fil d'Ariane ramène à la liste", async () => {
      await page.getByTestId("server-list").getByText(SERVER_NAME).click()

      await expect(page).toHaveURL(SERVER_URL_RE)
      await expect(page).toHaveTitle(new RegExp(`^${SERVER_NAME} · Pupitre$`))
      await expect(
        page.getByRole("heading", { name: SERVER_NAME })
      ).toBeVisible()

      await page
        .getByRole("navigation", { name: "Fil d'Ariane" })
        .getByRole("link", { name: "Serveurs" })
        .click()

      await expect(page).toHaveURL(SERVERS_URL_RE)
    })

    await test.step("révoquer un serveur se lit sur la fiche, sans la quitter", async () => {
      await page.getByTestId("server-list").getByText(SERVER_NAME).click()
      await page.getByRole("button", { name: "Supprimer le serveur" }).click()
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Supprimer", exact: true })
        .click()

      await expect(page).toHaveURL(SERVER_URL_RE)
      await expect(
        page.getByRole("main").locator("span").filter({ hasText: REVOKED_RE })
      ).toBeVisible()
      await expect(
        page.getByTestId("toasts").getByText(`« ${SERVER_NAME} » est révoqué`)
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Supprimer définitivement" })
      ).toBeVisible()
    })

    await test.step("l'effacement quitte la fiche sur-le-champ, et la liste ne porte plus la ligne", async () => {
      await page
        .getByRole("button", { name: "Supprimer définitivement" })
        .click()
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Supprimer définitivement" })
        .click()

      await expect(page).toHaveURL(SERVERS_URL_RE)
      await expect(
        page.getByTestId("toasts").getByText(`« ${SERVER_NAME} » est supprimé`)
      ).toBeVisible()
      await expect(page.getByRole("main").getByText(SERVER_STEP)).toBeVisible()
    })

    await test.step("une ligne révoquée porte elle-même son effacement", async () => {
      const seeded = await request.post(harnessUrl("/servers"), {
        data: { email: EMAIL, name: SECOND_SERVER_NAME },
      })

      expect(seeded.ok()).toBe(true)

      await page.goto("/dashboard/servers")
      await page
        .getByTestId("server-list")
        .getByText(SECOND_SERVER_NAME)
        .click()
      await page.getByRole("button", { name: "Supprimer le serveur" }).click()
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Supprimer", exact: true })
        .click()
      await page
        .getByRole("navigation", { name: "Fil d'Ariane" })
        .getByRole("link", { name: "Serveurs" })
        .click()

      const row = page.getByTestId("server-list").getByRole("link")

      await expect(row).toContainText(SECOND_SERVER_NAME)
      await expect(row).toContainText("Révoqué")

      await page
        .getByTestId("server-list")
        .getByRole("button", { name: "Supprimer définitivement" })
        .click()
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Supprimer définitivement" })
        .click()

      await expect(page.getByRole("main").getByText(SERVER_STEP)).toBeVisible()
    })

    await test.step("un identifiant inconnu ne dit rien d'autre qu'introuvable", async () => {
      await page.goto("/dashboard/servers/unknown-id")

      await expect(page.getByText("Rien à cette adresse")).toBeVisible()
      await expect(
        page.getByRole("link", { name: "Retour à la console" })
      ).toBeVisible()
    })

    await test.step("un serveur en ligne efface la liste des pas", async () => {
      const seeded = await request.post(harnessUrl("/servers"), {
        data: { email: EMAIL, name: THIRD_SERVER_NAME, status: "active" },
      })

      expect(seeded.ok()).toBe(true)

      await page.goto("/dashboard/servers")

      await expect(
        page.getByTestId("server-list").getByText(THIRD_SERVER_NAME)
      ).toBeVisible()
      await expect(page.getByRole("link", { name: START_LINK_RE })).toHaveCount(
        0
      )

      await page.goto("/dashboard/start")

      await expect(page).toHaveURL(SERVERS_URL_RE)
    })
  })
})
