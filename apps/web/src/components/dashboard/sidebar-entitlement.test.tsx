import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { TEST_LAUNCH_END } from "@pupitre/api/testing/billing"
import { subscribeOrganization } from "@pupitre/api/testing/factories"
import type { OrgRole } from "@pupitre/shared/permissions"
import { SidebarEntitlement } from "@/components/dashboard/sidebar-entitlement"
import type { DashboardOrganization } from "@/lib/domain/dashboard-context"
import {
  createConsoleUser,
  grantLaunch,
  useSessionApiClient,
} from "@/testing/harness"
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
      () => container.textContent?.includes("Free access not started") === true
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
      () =>
        container.textContent?.includes("Waiting for the owner to start") ===
        true
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

  it("nomme le lancement gratuit et sa fin, jamais un essai", async () => {
    await grantLaunch(organization.id, TEST_LAUNCH_END)

    const { container, unmount } = await render(pill("valid"))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Free launch · until") === true
    )

    expect(container.textContent).toContain("2026")
    expect(container.textContent).not.toContain("Trial")
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/dashboard/billing"
    )
  })
})
