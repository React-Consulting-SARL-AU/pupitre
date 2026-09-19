import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { createOrganizationWithMembers } from "@pupitre/api/testing/factories"
import { InboxOrganizationFilter } from "@/components/admin/inbox/inbox-organization-filter"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

const ORGANIZATION = "Atelier Lovelace"

describe("InboxOrganizationFilter", () => {
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

  it("names the organisation the address carries, without a page that holds it", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: ORGANIZATION,
    })
    const { container, unmount } = await render(
      withDashboard(
        <InboxOrganizationFilter
          onOrganizationChange={() => undefined}
          organizationId={organization.id}
        />,
        { platformRole: "owner" }
      )
    )

    mounted.push(unmount)

    expect(container.textContent).toContain(organization.id)

    await waitUntil(
      () => container.textContent?.includes(ORGANIZATION) === true
    )

    expect(container.textContent).not.toContain(organization.id)
  })
})
