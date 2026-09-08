import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { subscribeOrganization } from "@pupitre/api/testing/factories"
import type { OrgRole } from "@pupitre/shared/permissions"
import { SidebarEntitlement } from "@/components/dashboard/sidebar-entitlement"
import type { DashboardOrganization } from "@/lib/domain/dashboard-context"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

let organization: DashboardOrganization

function pill(entitlement: string, role: OrgRole = "owner") {
  return withDashboard(<SidebarEntitlement />, {
    organization,
    role,
    entitlement,
  })
}

describe("SidebarEntitlement", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    const console = await createConsoleUser({ email: "ada@test.local" })

    await useSessionApiClient(console.token)

    organization = {
      id: console.organization.id,
      name: console.organization.name,
      slug: console.organization.slug,
    }
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("ne dit jamais « suspendu » à un compte qui vient de s'inscrire", async () => {
    const { container, unmount } = await render(pill("suspended"))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Trial not started") === true
    )

    expect(container.textContent).not.toContain("Licence suspended")
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/dashboard/start"
    )
  })

  it("dit l'attente à qui ne peut pas lire la facturation", async () => {
    const { container, unmount } = await render(pill("suspended", "member"))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Waiting for the trial") === true
    )

    expect(container.textContent).not.toContain("Licence suspended")
  })

  it("mène à la facturation quand l'abonnement s'est arrêté", async () => {
    await subscribeOrganization({
      organizationId: organization.id,
      status: "canceled",
    })

    const { container, unmount } = await render(pill("suspended"))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Licence suspended") === true
    )

    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/dashboard/billing"
    )
  })

  it("s'efface quand le droit d'usage est en règle", async () => {
    const { container, unmount } = await render(pill("valid"))

    mounted.push(unmount)

    expect(container.textContent).toBe("")
  })
})
