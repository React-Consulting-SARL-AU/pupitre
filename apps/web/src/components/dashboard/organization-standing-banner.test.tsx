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
  it("ne montre rien sur une organisation active", async () => {
    const { container } = await mount({ ...ATELIER, state: "active" })

    expect(
      container.querySelector("[data-testid=organization-standing-banner]")
    ).toBeNull()
  })

  it("nomme l'organisation suspendue, son motif et le remède", async () => {
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

  it("dit qu'une organisation fermée n'accueille plus personne", async () => {
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

  it("annonce l'effacement programmé", async () => {
    const { container } = await mount({ ...ATELIER, state: "deleting" })

    expect(
      container.querySelector("[data-testid=organization-standing-banner]")
        ?.textContent
    ).toContain("scheduled the erasure of Atelier Ferrand")
  })
})
