import { expect, test } from "@playwright/test"
import {
  harnessUrl,
  openTrial,
  promotePlatformMember,
  signIn,
  stayLocal,
} from "./harness/session"

const OWNER_EMAIL = "standing@e2e.local"
const REASON = "Signalement 4412 : balayage réseau sortant."
const BANNER = "[data-testid=organization-standing-banner]"

interface MeBody {
  active_organization: { id: string; name: string; state: string } | null
}

test.describe("organisation retenue par la plateforme", () => {
  test.beforeAll(async ({ request }) => {
    await request.post(harnessUrl("/reset"))
  })

  test("la console dit la suspension, son motif et le remède", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await signIn(page, request, OWNER_EMAIL)
    await openTrial(request, OWNER_EMAIL)
    await promotePlatformMember(request, OWNER_EMAIL, "admin")

    const me = (await (await page.request.get("/api/v1/me")).json()) as MeBody
    const organization = me.active_organization

    expect(organization).not.toBeNull()

    await test.step("aucun bandeau sur une organisation active", async () => {
      await page.goto("/dashboard/servers")

      await expect(page.locator(BANNER)).toHaveCount(0)
    })

    await test.step("la suspension apparaît dès le rechargement", async () => {
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

    await test.step("le rétablissement fait tomber le bandeau", async () => {
      const restored = await page.request.post(
        `/api/v1/admin/organizations/${organization?.id}/restore`
      )

      expect(restored.ok()).toBe(true)

      await page.goto("/dashboard/servers")

      await expect(page.locator(BANNER)).toHaveCount(0)
    })
  })
})
