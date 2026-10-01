import { afterEach, describe, expect, it } from "bun:test"
import type { OrgRole } from "@pupitre/shared/permissions"
import { SidebarLicense } from "@/components/dashboard/sidebar-license"
import { render, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

const ORGANIZATION = { id: "org_1", name: "Atelier", slug: "atelier" }

function pill(license: string, role: OrgRole = "owner") {
  return withDashboard(<SidebarLicense />, {
    organization: ORGANIZATION,
    role,
    license,
  })
}

describe("SidebarLicense", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("says the licence is required and leads to its page", async () => {
    const { container, unmount } = await render(pill("suspended"))

    mounted.push(unmount)

    expect(container.textContent).toContain("Licence required")
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/dashboard/billing"
    )
  })

  it("leads nowhere for someone who does not manage the licence", async () => {
    const { container, unmount } = await render(pill("suspended", "member"))

    mounted.push(unmount)

    expect(container.textContent).toContain("Licence required")
    expect(container.querySelector("a")).toBeNull()
  })

  it("disappears when the right of use is in order", async () => {
    const { container, unmount } = await render(pill("valid"))

    mounted.push(unmount)

    expect(container.textContent).toBe("")
  })
})
