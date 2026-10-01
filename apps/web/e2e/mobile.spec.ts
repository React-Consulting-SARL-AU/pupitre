import { expect, type Page, test } from "@playwright/test"
import { harnessUrl, seedServer, signIn, stayLocal } from "./harness/session"

const EMAIL = "mobile@e2e.local"
const SERVER_NAME = "vps-mobile"
const SERVERS_URL_RE = /\/dashboard\/servers$/
const SERVER_URL_RE = /\/dashboard\/servers\/[^/]+$/
const DEVICES_URL_RE = /\/dashboard\/devices$/

async function fits(page: Page): Promise<boolean> {
  return await page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth
  )
}

test.describe("the console on a phone", () => {
  test("the menu, list and record fit in 390 px", async ({ page, request }) => {
    await stayLocal(page)
    await request.post(harnessUrl("/reset"))
    await signIn(page, request, EMAIL)
    await seedServer(request, {
      email: EMAIL,
      name: SERVER_NAME,
      status: "active",
    })

    await test.step("the sidebar gives way to a top bar", async () => {
      await page.goto("/dashboard/servers")

      await expect(page).toHaveURL(SERVERS_URL_RE)
      await expect(page.locator("aside")).toBeHidden()
      await expect(
        page.getByRole("button", { name: "Ouvrir le menu" })
      ).toBeVisible()
    })

    await test.step("tabbing starts with the skip link", async () => {
      await page.keyboard.press("Tab")

      await expect(
        page.getByRole("link", { name: "Aller au contenu" })
      ).toBeFocused()
    })

    await test.step("the menu opens, closes from the keyboard, then leads elsewhere", async () => {
      await page.getByRole("button", { name: "Ouvrir le menu" }).click()

      const panel = page.getByRole("dialog")

      await expect(
        panel.getByRole("navigation", { name: "Menu principal" })
      ).toBeVisible()

      await page.keyboard.press("Escape")

      await expect(panel).toBeHidden()

      await page.getByRole("button", { name: "Ouvrir le menu" }).click()

      await expect(panel).toBeVisible()

      await panel.getByRole("link", { name: "Appareils" }).click()

      await expect(page).toHaveURL(DEVICES_URL_RE)
      await expect(panel).toBeHidden()
    })

    await test.step("the list carries the server without overflowing", async () => {
      await page.goto("/dashboard/servers")

      await expect(
        page.getByTestId("server-list").getByText(SERVER_NAME)
      ).toBeVisible()
      expect(await fits(page)).toBe(true)
    })

    await test.step("no console page overflows in width", async () => {
      for (const path of [
        "/dashboard/members",
        "/dashboard/devices",
        "/dashboard/billing",
        "/dashboard/audit",
        "/dashboard/settings",
      ]) {
        await page.goto(path)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        expect(await fits(page), path).toBe(true)
      }

      await page.goto("/dashboard/servers")
    })

    await test.step("the record opens and keeps its revocation within reach", async () => {
      await page.getByTestId("server-list").getByText(SERVER_NAME).click()

      await expect(page).toHaveURL(SERVER_URL_RE)
      await expect(
        page.getByRole("heading", { level: 1, name: SERVER_NAME })
      ).toBeFocused()
      await expect(
        page.getByRole("button", { name: "Supprimer le serveur" })
      ).toBeVisible()
      expect(await fits(page)).toBe(true)
    })
  })
})
