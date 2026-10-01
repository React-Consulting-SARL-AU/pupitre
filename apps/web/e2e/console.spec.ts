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
const DOWNLOAD_URL_RE = /\/dashboard\/download$/
const SIGN_IN_WITH_CALLBACK_RE = /\/auth\/sign-in\?callbackURL=.*auth.*device/
const DEVICE_URL_RE = /\/auth\/device\?user_code=/
const CHECKLIST_STEP_RE =
  /Installer l'app et la lier à votre compte|Louer un serveur et l'ajouter/
const APP_STEP = "Installer l'app et la lier à votre compte"
const START_LINK_RE = /^Démarrer · \d\/3$/
const SERVER_STEP = "Louer un serveur et l'ajouter"

interface DeviceCodes {
  device_code: string
  user_code: string
}

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

test.describe("console", () => {
  test.beforeAll(async ({ request }) => {
    await request.post(harnessUrl("/reset"))
  })

  test("inscription, licence gratuite, téléchargement, liaison, serveurs", async ({
    browser,
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
          name: "Trois pas, et votre serveur travaille pour vous.",
        })
      ).toBeVisible()
      await expect(page.getByText("essai")).toHaveCount(0)
    })

    await test.step("la barre latérale compte les pas, et tout s'ouvre sans licence", async () => {
      await expect(
        page.getByRole("link", { name: "Démarrer · 1/3" })
      ).toBeVisible()
      await expect(
        page.getByRole("link", { name: "Serveurs", exact: true })
      ).toBeVisible()
      await expect(page.getByText("Licence requise")).toHaveCount(0)
    })

    await test.step("le téléchargement s'ouvre sans recharger la console", async () => {
      await page
        .getByRole("main")
        .getByRole("link", { name: "Toutes les plateformes" })
        .click()

      await expect(page).toHaveURL(DOWNLOAD_URL_RE)
    })

    await test.step("la gratuité vaut droit d'usage, et la console s'ouvre", async () => {
      const me = await page.request.get("/api/v1/me")
      const identity = (await me.json()) as {
        license: string
        servers: { used: number; limit: number }
      }

      expect(me.ok()).toBe(true)
      expect(identity.license).toBe("valid")
      expect(identity.servers).toEqual({ used: 0, limit: 3 })

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

    await test.step("la licence compte les serveurs contre les trois gratuits, sans rien vendre", async () => {
      await page.goto("/dashboard/billing")

      await expect(
        page.getByRole("heading", { level: 1, name: "Licence" })
      ).toBeVisible()
      await expect(page.getByText("0 / 3")).toBeVisible()
      await expect(
        page.getByText("Gratuit jusqu'à 3 serveurs par organisation")
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Gérer l'abonnement" })
      ).toHaveCount(0)
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

    await test.step("le device flow passe par la connexion, puis lie l'app au compte", async () => {
      const started = await request.post("/api/auth/device/code", {
        data: { client_id: DESKTOP_CLIENT_ID },
      })

      expect(started.ok()).toBe(true)

      const codes = (await started.json()) as DeviceCodes
      const devicePath = `/auth/device?user_code=${encodeURIComponent(codes.user_code)}`

      // The app opens the system browser, which knows nothing of the console's session.
      const fresh = await browser.newContext()
      const tab = await fresh.newPage()

      await stayLocal(tab)
      await openHydrated(tab, devicePath)

      await expect(tab).toHaveURL(SIGN_IN_WITH_CALLBACK_RE)
      await expect(
        tab.getByRole("heading", { name: "Connexion ou inscription" })
      ).toBeVisible()

      const previousLink = await magicLinkFor(request, EMAIL)

      await tab.getByLabel("Adresse email").fill(EMAIL)
      await tab
        .getByRole("button", { name: "Recevoir un lien de connexion" })
        .click()

      await expect(
        tab.getByText(`Un lien de connexion part vers ${EMAIL}`)
      ).toBeVisible()
      await expect
        .poll(() => magicLinkFor(request, EMAIL))
        .not.toBe(previousLink)

      await tab.goto((await magicLinkFor(request, EMAIL)) ?? "/")

      await expect(tab).toHaveURL(DEVICE_URL_RE)
      await expect(
        tab.getByRole("heading", { level: 1, name: "Confirmer un appareil" })
      ).toBeVisible()
      await expect(tab.getByLabel("Code affiché par l'appareil")).toHaveValue(
        ""
      )
      await tab
        .getByLabel("Code affiché par l'appareil")
        .fill(`${codes.user_code.slice(0, 4)}-${codes.user_code.slice(4)}`)

      await tab.getByRole("button", { name: "Vérifier le code" }).click()
      await tab.getByRole("button", { name: "Confirmer cet appareil" }).click()

      await expect(tab.getByTestId("device-approved")).toBeVisible()

      await fresh.close()

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
        page.getByRole("link", { name: "Démarrer · 2/3" })
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
      await expect(page.getByRole("main").getByText(REVOKED_RE)).toBeVisible()
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
