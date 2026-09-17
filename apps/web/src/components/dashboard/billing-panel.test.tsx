import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import {
  postStripeWebhook,
  remoteSubscription,
  stripeEvent,
  useFakeBilling,
} from "@pupitre/api/testing/billing"
import type { OrgRole } from "@pupitre/shared/permissions"
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BillingPanel } from "@/components/dashboard/billing-panel"
import { queryKeys } from "@/lib/api/queries"
import {
  DashboardContext,
  type DashboardOrganization,
} from "@/lib/domain/dashboard-context"
import { createQueryClient } from "@/lib/query/client"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { fill, render, trigger, waitUntil } from "@/testing/render"

type Billing = ReturnType<typeof useFakeBilling>

const mounted: (() => void)[] = []

function panel(
  organization: DashboardOrganization | null,
  role: OrgRole,
  queryClient: QueryClient = createQueryClient()
) {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardContext.Provider
        value={{
          user: {
            id: "u1",
            email: "ada@test.local",
            name: "Ada",
            image: null,
            locale: "fr",
          },
          organizations: [],
          activeOrganization: organization,
          role,
          entitlement: "valid",
        }}
      >
        <BillingPanel />
      </DashboardContext.Provider>
    </QueryClientProvider>
  )
}

async function payFor(
  billing: Billing,
  organizationId: string,
  quantity = 3,
  status = "active"
) {
  billing.put(
    remoteSubscription({
      id: "sub_console",
      customerId: "cus_console",
      organizationId,
      quantity,
      status,
      interval: "year",
    })
  )

  const received = await postStripeWebhook<{ handled: boolean }>(
    stripeEvent("checkout.session.completed", {
      id: "cs_console",
      object: "checkout.session",
      mode: "subscription",
      customer: "cus_console",
      subscription: "sub_console",
      client_reference_id: organizationId,
      metadata: { organization_id: organizationId },
    })
  )

  expect(received.json.handled).toBe(true)
}

describe("BillingPanel", () => {
  let billing: Billing
  let organization: DashboardOrganization
  let leave: ReturnType<typeof spyOn>

  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    billing = useFakeBilling()
    leave = spyOn(window.location, "assign").mockImplementation(() => {
      // The console leaves for Stripe; the test only records where.
    })

    const console = await createConsoleUser({ email: "ada@test.local" })

    await useSessionApiClient(console.token)

    organization = {
      id: console.organization.id,
      name: console.organization.name,
      slug: console.organization.slug,
    }
  })

  afterEach(() => {
    leave.mockRestore()

    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("opens a checkout with the chosen quantity and interval when nothing is paid", async () => {
    const { container, unmount, click } = await render(
      panel(organization, "owner")
    )

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Order") === true)

    const quantity = container.querySelector("#quantity")

    if (!quantity) {
      throw new Error("no quantity field")
    }

    await fill(quantity, "3")
    await click(trigger(container, "Yearly"))
    await click(trigger(container, "Order"))
    await waitUntil(() => billing.checkouts.length === 1)

    expect(billing.checkouts[0]).toMatchObject({
      organizationId: organization.id,
      quantity: 3,
      interval: "year",
    })
    expect(leave).toHaveBeenCalledWith(
      expect.stringContaining("checkout.stripe.test")
    )
  })

  it("shows the paid subscription and opens the portal once Stripe confirmed it", async () => {
    await payFor(billing, organization.id)

    const { container, unmount, click } = await render(
      panel(organization, "owner")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Manage the subscription") === true
    )

    expect(container.textContent).toContain("Subscription")
    expect(container.textContent).toContain("3 servers")
    expect(container.textContent).toContain("Active")
    expect(container.textContent).toContain("Yearly")
    expect(container.textContent).toContain("300")
    expect(container.textContent).not.toContain("Order")

    await click(trigger(container, "Manage the subscription"))
    await waitUntil(() => billing.portals.length === 1)

    expect(billing.portals[0]).toMatchObject({ customerId: "cus_console" })
    expect(leave).toHaveBeenCalledWith(
      expect.stringContaining("billing.stripe.test")
    )
  })

  it("raises the seats of a running trial, without leaving the console", async () => {
    await payFor(billing, organization.id, 1, "trialing")

    const { container, unmount, click } = await render(
      panel(organization, "owner")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Change the number") === true
    )

    expect(container.textContent).toContain("During the trial")

    const seats = container.querySelector("#seats")

    if (!seats) {
      throw new Error("no seats field")
    }

    await fill(seats, "3")
    await click(trigger(container, "Update"))
    await waitUntil(() => billing.quantities.length === 1)

    expect(billing.quantities[0]).toEqual({
      subscriptionId: "sub_console",
      quantity: 3,
    })
    await waitUntil(() => container.textContent?.includes("3 servers") === true)

    expect(leave).not.toHaveBeenCalled()
  })

  it("refreshes the account once the seats changed", async () => {
    await payFor(billing, organization.id, 1, "trialing")

    const queryClient = createQueryClient()

    queryClient.setQueryData(queryKeys.me, { user: { id: "u1" } })

    const { container, unmount, click } = await render(
      panel(organization, "owner", queryClient)
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Change the number") === true
    )

    const seats = container.querySelector("#seats")

    if (!seats) {
      throw new Error("no seats field")
    }

    await fill(seats, "2")
    await click(trigger(container, "Update"))
    await waitUntil(
      () => queryClient.getQueryState(queryKeys.me)?.isInvalidated === true
    )

    expect(billing.quantities).toEqual([
      { subscriptionId: "sub_console", quantity: 2 },
    ])
  })

  it("offers the checkout again once the mirror is no longer live", async () => {
    await payFor(billing, organization.id, 3, "canceled")

    const { container, unmount } = await render(panel(organization, "owner"))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Order") === true)

    expect(container.textContent).not.toContain("Manage the subscription")
    expect(container.querySelector("#seats")).toBeNull()
  })

  it("refuses a seat count below the servers in place", async () => {
    await payFor(billing, organization.id)

    const { container, unmount, click } = await render(
      panel(organization, "owner")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Change the number") === true
    )

    const seats = container.querySelector("#seats")

    if (!seats) {
      throw new Error("no seats field")
    }

    await fill(seats, "0")
    await click(trigger(container, "Update"))
    await waitUntil(
      () => container.textContent?.includes("At least 1") === true
    )

    expect(billing.quantities).toHaveLength(0)
  })

  it("shows a member neither a button nor an amount", async () => {
    await payFor(billing, organization.id)

    const { container, unmount } = await render(panel(organization, "member"))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Billing is for the owner") === true
    )

    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(container.querySelectorAll("a")).toHaveLength(0)
    expect(container.textContent).not.toContain("€")
    expect(container.textContent).not.toContain("Order")
    expect(container.textContent).not.toContain("Manage the subscription")
  })
})
