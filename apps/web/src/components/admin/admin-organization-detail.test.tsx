import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "@pupitre/api/testing/factories"
import { AdminOrganizationDetail } from "@/components/admin/admin-organization-detail"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

describe("AdminOrganizationDetail", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    const console = await createConsoleUser({
      email: "ops@test.local",
      role: "platform_admin",
    })

    await useSessionApiClient(console.token)
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("shows the members, the servers and the subscriptions of one organisation", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner", "member"],
      subscription: { quantity: 3, status: "active" },
    })

    await createServer({ organizationId: organization.id, name: "vps-one" })

    const { container, unmount } = await render(
      withDashboard(<AdminOrganizationDetail id={organization.id} />, {
        platformRole: "owner",
      })
    )

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-one") === true)

    expect(container.textContent).toContain(organization.slug)
    expect(container.textContent).toContain(members[0].user.email)
    expect(container.textContent).toContain(members[1].user.email)
    expect(container.textContent).toContain("3 seats")
    expect(container.textContent).toContain("Active")
  })

  it("says plainly when an organisation has neither server nor subscription", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Seule",
      roles: ["owner"],
    })

    const { container, unmount } = await render(
      withDashboard(<AdminOrganizationDetail id={organization.id} />, {
        platformRole: "member",
      })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("No server.") === true
    )

    expect(container.textContent).toContain("No subscription, past or present.")
  })
})
