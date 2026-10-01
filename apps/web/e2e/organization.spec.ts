import { expect, test } from "@playwright/test"
import { harnessUrl, signIn, stayLocal } from "./harness/session"

const EMAIL = "org@e2e.local"
const START_URL_RE = /\/dashboard\/start$/

test.describe("organization", () => {
  test("creation, renaming, and the chrome carried by the sidebar", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await request.post(harnessUrl("/reset"))

    await test.step("the magic link opens the console on the getting-started step", async () => {
      await signIn(page, request, EMAIL)
    })

    await test.step("the sidebar carries the theme, the language and the legal pages", async () => {
      await page.getByLabel("Compte et préférences").click()

      await expect(page.getByRole("menuitem", { name: "Statut" })).toBeVisible()
      await expect(
        page.getByRole("menuitemradio", { name: "Sombre" })
      ).toBeVisible()
      await expect(
        page.getByRole("menuitemradio", { name: "English" })
      ).toBeVisible()
      await expect(page.getByRole("contentinfo")).toHaveCount(0)

      await page.keyboard.press("Escape")
    })

    await test.step("a new organization is created and becomes active", async () => {
      await page.getByRole("button", { name: "org" }).first().click()
      await page
        .getByRole("menuitem", { name: "Nouvelle organisation" })
        .click()
      await page.getByLabel("Nom").fill("Acme Inc.")
      await page.getByRole("button", { name: "Créer" }).click()

      await expect(page).toHaveURL(START_URL_RE)
      await expect(page.getByText("Acme Inc.")).toBeVisible()
    })

    await test.step("the owner renames the active organization", async () => {
      await page.goto("/dashboard/organization")
      await page.getByLabel("Nom").fill("Acme Studio")
      await page.getByRole("button", { name: "Enregistrer" }).click()

      await expect(page.getByText("L'organisation est à jour.")).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Acme Studio" }).first()
      ).toBeVisible()
    })
  })
})
