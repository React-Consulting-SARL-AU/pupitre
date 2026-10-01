import { afterEach, describe, expect, it } from "bun:test"
import { OrganizationStandingBanner } from "@/components/dashboard/organization-standing-banner"
import {
  type HarnessOrganization,
  render,
  withDashboard,
} from "@/testing/render"

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

async function mount(organization: HarnessOrganization | null) {
  const rendered = await render(
    withDashboard(<OrganizationStandingBanner />, { organization })
  )

  mounted.push(rendered.unmount)

  return rendered
}

const ATELIER = {
  id: "o1",
  name: "Atelier Ferrand",
  slug: "atelier-ferrand",
}

describe("OrganizationStandingBanner", () => {
  it("shows nothing on an active organization", async () => {
    const { container } = await mount({ ...ATELIER, state: "active" })

    expect(
      container.querySelector("[data-testid=organization-standing-banner]")
    ).toBeNull()
  })

  it("names the suspended organization, its reason and the remedy", async () => {
    const { container } = await mount({
      ...ATELIER,
      state: "suspended",
      reason: "signalement 4412",
    })

    const banner = container.querySelector(
      "[data-testid=organization-standing-banner]"
    )

    expect(banner?.textContent).toContain("Atelier Ferrand")
    expect(banner?.textContent).toContain("signalement 4412")
    expect(banner?.textContent).toContain("support@pupitre.studio")
  })

  it("says a closed organization no longer welcomes anyone", async () => {
    const { container } = await mount({
      ...ATELIER,
      state: "closed",
      reason: null,
    })

    const banner = container.querySelector(
      "[data-testid=organization-standing-banner]"
    )

    expect(banner?.textContent).toContain("Atelier Ferrand")
    expect(banner?.textContent).toContain("closed Atelier Ferrand")
    expect(banner?.textContent).not.toContain("Reason given")
  })

  it("announces the scheduled deletion", async () => {
    const { container } = await mount({ ...ATELIER, state: "deleting" })

    expect(
      container.querySelector("[data-testid=organization-standing-banner]")
        ?.textContent
    ).toContain("scheduled the erasure of Atelier Ferrand")
  })

  it("carries the Callout's alert tone", async () => {
    const { container } = await mount({ ...ATELIER, state: "suspended" })
    const banner = container.querySelector(
      "[data-testid=organization-standing-banner]"
    )

    expect(banner?.getAttribute("data-tone")).toBe("danger")
    expect(banner?.getAttribute("role")).toBe("alert")
  })

  it("opens another organization from a closed or deleting one", async () => {
    for (const state of ["closed", "deleting"] as const) {
      const { container } = await mount({ ...ATELIER, state })

      expect(
        container.querySelector("[data-testid=organization-standing-banner]")
          ?.textContent
      ).toContain("Open another organisation")
    }
  })

  it("offers no exit on an organization that is only suspended", async () => {
    const { container } = await mount({ ...ATELIER, state: "suspended" })

    expect(
      container.querySelector("[data-testid=organization-standing-banner]")
        ?.textContent
    ).not.toContain("Open another organisation")
  })
})
