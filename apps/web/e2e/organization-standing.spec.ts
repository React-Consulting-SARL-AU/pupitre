import { expect, test } from "@playwright/test"
import {
  harnessUrl,
  promotePlatformMember,
  signIn,
  stayLocal,
} from "./harness/session"

const OWNER_EMAIL = "standing@e2e.local"
const REASON = "Signalement 4412 : balayage réseau sortant."
const BANNER = "[data-testid=organization-standing-banner]"

const SWITCH_LABEL = "Ouvrir une autre organisation"

interface MeBody {
  active_organization: { id: string; name: string; state: string } | null
}

test.describe("organization held by the platform", () => {
  test.beforeAll(async ({ request }) => {
    await request.post(harnessUrl("/reset"))
  })

  test("the console states the suspension, its reason and the remedy", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await signIn(page, request, OWNER_EMAIL)
    await promotePlatformMember(request, OWNER_EMAIL, "admin")

    const me = (await (await page.request.get("/api/v1/me")).json()) as MeBody
    const organization = me.active_organization

    expect(organization).not.toBeNull()

    await test.step("no banner on an active organization", async () => {
      await page.goto("/dashboard/servers")

      await expect(page.locator(BANNER)).toHaveCount(0)
    })

    await test.step("the suspension appears on reload", async () => {
      const suspended = await page.request.post(
        `/api/v1/admin/organizations/${organization?.id}/suspend`,
        { data: { reason: REASON } }
      )

      expect(suspended.ok()).toBe(true)

      await page.goto("/dashboard/start")

      const banner = page.locator(BANNER)

      await expect(banner).toContainText(organization?.name ?? "")
      await expect(banner).toContainText(REASON)
      await expect(banner).toContainText("support@pupitre.studio")
    })

    await test.step("a suspension does not offer switching organization", async () => {
      await expect(
        page.locator(BANNER).getByRole("button", { name: SWITCH_LABEL })
      ).toHaveCount(0)
    })

    await test.step("reinstatement removes the banner", async () => {
      const restored = await page.request.post(
        `/api/v1/admin/organizations/${organization?.id}/restore`
      )

      expect(restored.ok()).toBe(true)

      await page.goto("/dashboard/servers")

      await expect(page.locator(BANNER)).toHaveCount(0)
    })

    await test.step("a second reinstatement is refused, the organization no longer being suspended", async () => {
      const again = await page.request.post(
        `/api/v1/admin/organizations/${organization?.id}/restore`
      )

      expect(again.status()).toBe(409)
    })

    await test.step("a closed organization opens the choice of another", async () => {
      const closed = await page.request.post(
        `/api/v1/admin/organizations/${organization?.id}/close`,
        { data: { reason: REASON } }
      )

      expect(closed.ok()).toBe(true)

      await page.goto("/dashboard/start")

      const banner = page.locator(BANNER)

      await expect(banner).toHaveAttribute("data-tone", "danger")

      await banner.getByRole("button", { name: SWITCH_LABEL }).click()

      await expect(
        page.getByRole("menuitem", { name: organization?.name ?? "" })
      ).toBeVisible()
    })
  })
})
