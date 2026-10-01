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
  subscribeOrganization,
} from "@pupitre/api/testing/factories"
import { FREE_SERVERS } from "@pupitre/shared/plans"
import {
  AdminSubscriptionList,
  type AdminSubscriptionListSearch,
} from "@/components/admin/admin-subscription-list"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { ListSearchHarness } from "@/testing/list-search"
import { render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

function list(initial?: AdminSubscriptionListSearch) {
  return withDashboard(
    <ListSearchHarness<AdminSubscriptionListSearch> initial={initial}>
      {(handle) => <AdminSubscriptionList {...handle} />}
    </ListSearchHarness>,
    { platformRole: "owner" }
  )
}

async function twoOrganizations() {
  const { organization: tight } = await createOrganizationWithMembers({
    name: "Atelier serré",
    roles: ["owner"],
  })
  const { organization: covered } = await createOrganizationWithMembers({
    name: "Bureau couvert",
    roles: ["owner"],
  })

  await subscribeOrganization({
    organizationId: tight.id,
    status: "active",
    quantity: 1,
  })
  await subscribeOrganization({
    organizationId: covered.id,
    status: "active",
    quantity: 5,
  })
  for (let index = 0; index <= FREE_SERVERS; index += 1) {
    await createServer({ organizationId: tight.id })
  }

  await createServer({ organizationId: tight.id, status: "grace" })
}

describe("AdminSubscriptionList", () => {
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

  it("sorts on the creation and on the last change from the column headers", async () => {
    await twoOrganizations()

    const { container, unmount } = await render(list())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Atelier serré") === true
    )

    const headers = [...container.querySelectorAll("th button")].map(
      (button) => button.textContent
    )

    expect(headers).toContain("Created")
    expect(headers).toContain("Updated")
  })

  it("keeps the rows adrift alone once the filter is on", async () => {
    await twoOrganizations()

    const { container, unmount } = await render(list({ drifted: true }))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Atelier serré") === true
    )

    expect(container.textContent).not.toContain("Bureau couvert")
    expect(
      (
        container.querySelector(
          "#admin-subscriptions-drifted"
        ) as HTMLInputElement | null
      )?.checked
    ).toBe(true)
  })

  it("shows every subscription while the filter is off", async () => {
    await twoOrganizations()

    const { container, unmount } = await render(list())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Bureau couvert") === true
    )

    expect(container.textContent).toContain("Atelier serré")
  })
})
