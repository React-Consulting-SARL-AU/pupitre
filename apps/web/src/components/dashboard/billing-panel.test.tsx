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
import { QueryClientProvider } from "@tanstack/react-query"
import { BillingPanel } from "@/components/dashboard/billing-panel"
import {
  DashboardContext,
  type DashboardOrganization,
} from "@/lib/domain/dashboard-context"
import { createQueryClient } from "@/lib/query/client"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { fill, render, trigger, waitUntil } from "@/testing/render"

type Billing = ReturnType<typeof useFakeBilling>

const mounted: (() => void)[] = []

function panel(organization: DashboardOrganization | null, role: OrgRole) {
  return (
    <QueryClientProvider client={createQueryClient()}>
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

async function payFor(billing: Billing, organizationId: string) {
  billing.put(
    remoteSubscription({
      id: "sub_console",
      customerId: "cus_console",
      organizationId,
      quantity: 3,
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

    await waitUntil(() => container.textContent?.includes("Commander") === true)

    const quantity = container.querySelector("#quantity")

    if (!quantity) {
      throw new Error("no quantity field")
    }

    await fill(quantity, "3")
    await click(trigger(container, "Annuel"))
    await click(trigger(container, "Commander"))
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
      () => container.textContent?.includes("Gérer l'abonnement") === true
    )

    expect(container.textContent).toContain("Abonnement")
    expect(container.textContent).toContain("3 serveurs")
    expect(container.textContent).toContain("Actif")
    expect(container.textContent).toContain("Annuel")
    expect(container.textContent).toContain("570")
    expect(container.textContent).not.toContain("Commander")

    await click(trigger(container, "Gérer l'abonnement"))
    await waitUntil(() => billing.portals.length === 1)

    expect(billing.portals[0]).toMatchObject({ customerId: "cus_console" })
    expect(leave).toHaveBeenCalledWith(
      expect.stringContaining("billing.stripe.test")
    )
  })

  it("shows a member neither a button nor an amount", async () => {
    await payFor(billing, organization.id)

    const { container, unmount } = await render(panel(organization, "member"))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("réservée au propriétaire") === true
    )

    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(container.querySelectorAll("a")).toHaveLength(0)
    expect(container.textContent).not.toContain("€")
    expect(container.textContent).not.toContain("Commander")
    expect(container.textContent).not.toContain("Gérer l'abonnement")
  })
})
