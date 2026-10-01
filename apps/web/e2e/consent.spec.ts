import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test"
import {
  agreeToDataStorage,
  harnessUrl,
  magicLinkFor,
  openHydrated,
  stayLocal,
} from "./harness/session"

const CONSENT_URL_RE = /\/auth\/consent\?callbackURL=/
const DEVICES_URL_RE = /\/dashboard\/devices$/
const START_URL_RE = /\/dashboard\/start$/
const SIGN_IN_URL_RE = /\/auth\/sign-in$/
const CONSENT_BOX_RE = /^J’accepte que mes données/
const DEVICE_CONSENT_URL_RE = /\/auth\/consent\?callbackURL=.*auth.*device/
const DEVICE_URL_RE = /\/auth\/device\?user_code=ABCDEFGH$/

async function followMagicLink(
  page: Page,
  request: APIRequestContext,
  email: string,
  callbackURL = "/dashboard"
): Promise<void> {
  await openHydrated(
    page,
    `/auth/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`
  )
  await page.getByLabel("Adresse email").fill(email)
  await page
    .getByRole("button", { name: "Recevoir un lien de connexion" })
    .click()

  await expect.poll(() => magicLinkFor(request, email)).not.toBeNull()

  await page.goto((await magicLinkFor(request, email)) ?? "/")
}

async function dataConsentOf(page: Page): Promise<unknown> {
  const me = await page.request.get("/api/v1/me")

  return ((await me.json()) as { data_consent: unknown }).data_consent
}

test.describe("data consent", () => {
  test.beforeEach(async ({ page, request }) => {
    await request.post(harnessUrl("/reset"))
    await stayLocal(page)
  })

  test("the sign-in page says where the account goes before the email is typed", async ({
    page,
  }) => {
    await openHydrated(page, "/auth/sign-in")

    const notice = page.getByTestId("sign-in-data-notice")

    await expect(notice).toContainText("Cloudflare, aux États-Unis")
    await expect(
      notice.getByRole("link", { name: "Politique de confidentialité" })
    ).toHaveAttribute("href", "https://pupitre.studio/fr/legal/privacy/")
  })

  test("a new account agrees once, then the console opens", async ({
    page,
    request,
  }) => {
    await followMagicLink(page, request, "nouveau@e2e.local")

    await expect(page).toHaveURL(CONSENT_URL_RE)
    await expect(
      page.getByRole("heading", { name: "Où sont gardées vos données" })
    ).toBeVisible()
    await expect(page.getByText("est de l’Amérique du Nord")).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Lire la politique de confidentialité" })
    ).toHaveAttribute("href", "https://pupitre.studio/fr/legal/privacy/")
    expect(await dataConsentOf(page)).toBeNull()

    await test.step("nothing is recorded while the box is not ticked", async () => {
      await expect(
        page.getByRole("button", { name: "Accepter et continuer" })
      ).toBeDisabled()

      const servers = await page.request.get("/api/v1/servers")

      expect(servers.status()).toBe(403)
      expect(await servers.json()).toMatchObject({
        error: { code: "consent_required" },
      })
    })

    await test.step("the dashboard sends back to the consent while it is missing", async () => {
      await page.goto("/dashboard/servers")

      await expect(page).toHaveURL(CONSENT_URL_RE)
    })

    await test.step("ticking the box records the consent and opens the console", async () => {
      await page.getByRole("checkbox", { name: CONSENT_BOX_RE }).click()
      await page.getByRole("button", { name: "Accepter et continuer" }).click()

      await expect(page).not.toHaveURL(CONSENT_URL_RE)
      expect(await dataConsentOf(page)).toMatchObject({
        version: expect.any(String),
        accepted_at: expect.any(String),
      })

      await page.goto("/dashboard")

      await expect(page).toHaveURL(START_URL_RE)
    })
  })

  test("the consent comes back to where the person was going", async ({
    page,
    request,
  }) => {
    await followMagicLink(
      page,
      request,
      "retour@e2e.local",
      "/dashboard/devices"
    )

    await expect(page).toHaveURL(CONSENT_URL_RE)

    await agreeToDataStorage(page)

    await expect(page).toHaveURL(DEVICES_URL_RE)
  })

  test("the device confirmation waits for the consent, then comes back to its code", async ({
    page,
    request,
  }) => {
    const devicePath = "/auth/device?user_code=ABCDEFGH"

    await followMagicLink(page, request, "appareil@e2e.local", devicePath)

    await expect(page).toHaveURL(DEVICE_CONSENT_URL_RE)

    await agreeToDataStorage(page)

    await expect(page).toHaveURL(DEVICE_URL_RE)
    await expect(
      page.getByRole("heading", { level: 1, name: "Confirmer un appareil" })
    ).toBeVisible()
  })

  test("refusing deletes the bare account and signs out", async ({
    page,
    request,
  }) => {
    await followMagicLink(page, request, "refus@e2e.local")

    await expect(page).toHaveURL(CONSENT_URL_RE)

    await page
      .getByRole("button", { name: "Refuser et supprimer mon compte" })
      .click()

    const dialog = page.getByRole("alertdialog")

    await expect(dialog).toContainText("ne garde rien")
    await dialog.getByRole("button", { name: "Supprimer mon compte" }).click()

    await expect(page).toHaveURL(SIGN_IN_URL_RE)

    const me = await page.request.get("/api/v1/me")

    expect(me.status()).toBe(401)
  })
})
