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
import { createServer } from "@pupitre/api/testing/factories"
import type { OrgRole } from "@pupitre/shared/permissions"
import { LicensePanel } from "@/components/dashboard/license-panel"
import type { DashboardOrganization } from "@/lib/domain/dashboard-context"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { render, trigger, waitUntil, withDashboard } from "@/testing/render"

type Billing = ReturnType<typeof useFakeBilling>

const mounted: (() => void)[] = []

let organization: DashboardOrganization

function panel(role: OrgRole = "owner") {
  return withDashboard(<LicensePanel />, { organization, role })
}

async function grantLicense(seats: number, endsAt: Date | null) {
  const { prisma } = await bootApiTestServer()

  await prisma.subscription.create({
    data: {
      organizationId: organization.id,
      stripeSubscriptionId: `granted_${organization.id}`,
      product: "granted",
      quantity: seats,
      status: "active",
      currentPeriodEnd: endsAt,
    },
  })
}

async function payFor(billing: Billing, quantity: number) {
  billing.put(
    remoteSubscription({
      id: "sub_console",
      customerId: "cus_console",
      organizationId: organization.id,
      quantity,
      status: "active",
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
      client_reference_id: organization.id,
      metadata: { organization_id: organization.id },
    })
  )

  expect(received.json.handled).toBe(true)
}

describe("LicensePanel", () => {
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
      state: "active",
    }
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("counts the servers against the free three, with no offer and no price", async () => {
    await createServer({ organizationId: organization.id, status: "active" })

    const { container, unmount } = await render(panel())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("1 / 3") === true)

    const text = container.textContent ?? ""

    expect(text).toContain("Free up to 3 servers per organisation")
    expect(text).toContain("support@pupitre.studio")
    expect(text).not.toContain("$")
    expect(text).not.toContain("trial")
    expect(text).not.toContain("Manage the subscription")
    expect(container.querySelectorAll("button")).toHaveLength(0)
  })

  it("says a licence is required once the free servers are all in use", async () => {
    for (const name of ["a", "b", "c"]) {
      await createServer({
        organizationId: organization.id,
        status: "active",
        name,
      })
    }

    const { container, unmount } = await render(panel())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("3 / 3") === true)

    expect(container.textContent).toContain(
      "Every server the organisation may run is in use"
    )
  })

  it("shows the licence the platform granted, its seats and its end, without a portal", async () => {
    await grantLicense(5, new Date("2027-06-30T23:59:59.000Z"))

    const { container, unmount } = await render(panel())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("0 / 8") === true)

    const text = container.textContent ?? ""

    expect(text).toContain("Licence")
    expect(text).toContain("5 servers")
    expect(text).toContain("Active")
    expect(text).toContain("2027")
    expect(text).not.toContain("Manage the subscription")
  })

  it("opens the Stripe portal of a Stripe licence while Stripe bills", async () => {
    const billing = useFakeBilling()
    const leave = spyOn(window.location, "assign").mockImplementation(() => {
      // The console leaves for Stripe; the test only records where.
    })

    try {
      await payFor(billing, 2)

      const { container, unmount, click } = await render(panel())

      mounted.push(unmount)

      await waitUntil(
        () =>
          container.textContent?.includes("Manage the subscription") === true
      )

      await click(trigger(container, "Manage the subscription"))
      await waitUntil(() => billing.portals.length === 1)

      expect(billing.portals[0]).toMatchObject({ customerId: "cus_console" })
    } finally {
      leave.mockRestore()
    }
  })

  it("keeps the licence from a member", async () => {
    const { container, unmount } = await render(panel("member"))

    mounted.push(unmount)

    expect(container.textContent).toContain("The licence is for the owner")
    expect(container.querySelectorAll("button")).toHaveLength(0)
  })
})
