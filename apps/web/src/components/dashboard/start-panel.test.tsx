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
  stripeEvent,
  stripeSubscriptionObject,
  useFakeBilling,
} from "@pupitre/api/testing/billing"
import type { OrgRole } from "@pupitre/shared/permissions"
import { QueryClientProvider } from "@tanstack/react-query"
import { StartPanel } from "@/components/dashboard/start-panel"
import {
  DashboardContext,
  type DashboardOrganization,
} from "@/lib/domain/dashboard-context"
import { createQueryClient } from "@/lib/query/client"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { render, trigger, waitUntil } from "@/testing/render"

type Billing = ReturnType<typeof useFakeBilling>

const mounted: (() => void)[] = []

function panel(
  organization: DashboardOrganization,
  role: OrgRole,
  returning = false
) {
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
          entitlement: "suspended",
        }}
      >
        <StartPanel returningFromCheckout={returning} />
      </DashboardContext.Provider>
    </QueryClientProvider>
  )
}

async function openTrial(organizationId: string) {
  const received = await postStripeWebhook<{ handled: boolean }>(
    stripeEvent(
      "customer.subscription.created",
      stripeSubscriptionObject({
        id: "sub_trial",
        customerId: "cus_trial",
        organizationId,
        status: "trialing",
        quantity: 1,
        currentPeriodEnd: new Date(Date.now() + 14 * 86_400_000),
      })
    )
  )

  expect(received.json.handled).toBe(true)
}

describe("StartPanel", () => {
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

  it("offers one action, which opens a one-seat checkout on Stripe", async () => {
    const { container, unmount, click } = await render(
      panel(organization, "owner")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Démarrer l'essai") === true
    )

    expect(container.textContent).toContain("Quatorze jours, sans carte")
    expect(container.textContent).toContain("Aucune carte n'est demandée")
    expect(container.querySelectorAll("button")).toHaveLength(1)
    expect(container.querySelector("#quantity")).toBeNull()

    await click(trigger(container, "Démarrer l'essai"))
    await waitUntil(() => billing.checkouts.length === 1)

    expect(billing.checkouts[0]).toMatchObject({
      organizationId: organization.id,
      quantity: 1,
      interval: "month",
    })
    expect(leave).toHaveBeenCalledWith(
      expect.stringContaining("checkout.stripe.test")
    )
  })

  it("waits for the webhook on the way back, then leads to the download", async () => {
    const { container, unmount } = await render(
      panel(organization, "owner", true)
    )

    mounted.push(unmount)

    await waitUntil(
      () =>
        container.textContent?.includes("Attente de la confirmation") === true
    )

    expect(container.textContent).not.toContain("L'essai est ouvert")

    await openTrial(organization.id)

    await waitUntil(
      () => container.textContent?.includes("L'essai est ouvert") === true
    )

    const links = [...container.querySelectorAll("a")].map((link) =>
      link.getAttribute("href")
    )

    expect(links).toContain("/download")
    expect(container.textContent).toContain("Télécharger l'app")
  })

  it("tells a member who has to start the trial, and offers no checkout", async () => {
    const { container, unmount } = await render(panel(organization, "member"))

    mounted.push(unmount)

    await waitUntil(
      () =>
        container.textContent?.includes("se démarre par le propriétaire") ===
        true
    )

    expect(container.textContent).toContain("ada@test.local")
    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(container.textContent).not.toContain("Démarrer l'essai")
  })
})
