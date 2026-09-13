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
import { StartPanel } from "@/components/dashboard/start-panel"
import type { DashboardOrganization } from "@/lib/domain/dashboard-context"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import {
  type DashboardHarness,
  render,
  trigger,
  waitUntil,
  withDashboard,
} from "@/testing/render"

type Billing = ReturnType<typeof useFakeBilling>

const mounted: (() => void)[] = []

function panel(
  organization: DashboardOrganization,
  role: OrgRole,
  returning = false,
  entitlement: DashboardHarness["entitlement"] = "suspended"
) {
  return withDashboard(<StartPanel returningFromCheckout={returning} />, {
    organization,
    role,
    entitlement,
  })
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

  it("opens a one-seat monthly checkout on Stripe by default", async () => {
    const { container, unmount, click } = await render(
      panel(organization, "owner")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Start the trial") === true
    )

    expect(container.textContent).toContain("Fourteen days, no card")
    expect(container.textContent).toContain("No card is asked for")
    expect(container.textContent).toContain(
      "After the trial: $10 per server per month"
    )
    expect(container.querySelector("#quantity")).toBeNull()
    expect(trigger(container, "Monthly").getAttribute("aria-pressed")).toBe(
      "true"
    )

    await click(trigger(container, "Start the trial"))
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

  it("lets the owner start the trial on the yearly rate", async () => {
    const { container, unmount, click } = await render(
      panel(organization, "owner")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Start the trial") === true
    )

    await click(trigger(container, "Yearly"))

    expect(container.textContent).toContain(
      "After the trial: $100 per server per year, 2 months free"
    )
    expect(trigger(container, "Yearly").getAttribute("aria-pressed")).toBe(
      "true"
    )

    await click(trigger(container, "Start the trial"))
    await waitUntil(() => billing.checkouts.length === 1)

    expect(billing.checkouts[0]).toMatchObject({
      organizationId: organization.id,
      quantity: 1,
      interval: "year",
    })
  })

  it("names the four steps, and the account is already behind", async () => {
    const { container, unmount } = await render(panel(organization, "owner"))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Create your account") === true
    )

    const text = container.textContent ?? ""

    expect(text).toContain("Four steps, and your server works for you.")
    expect(text).toContain("Install the app and link it to your account")
    expect(text).toContain("Rent a server and add it")
    expect(text).toContain("Done")
  })

  it("waits for the webhook on the way back", async () => {
    const { container, unmount } = await render(
      panel(organization, "owner", true)
    )

    mounted.push(unmount)

    await waitUntil(
      () =>
        container.textContent?.includes("Waiting for the confirmation") === true
    )

    expect(container.textContent).not.toContain("The trial is open.")

    await openTrial(organization.id)

    await waitUntil(
      () => container.textContent?.includes("The trial is open.") === true
    )
  })

  it("once the trial is confirmed, the list points at the app", async () => {
    await openTrial(organization.id)

    const { container, unmount } = await render(
      panel(organization, "owner", true, "valid")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("The trial is open.") === true
    )
    await waitUntil(
      () =>
        container.textContent?.includes(
          "Install the app and link it to your account"
        ) === true
    )

    const links = [...container.querySelectorAll("a")].map((link) =>
      link.getAttribute("href")
    )

    expect(links).toContain("/dashboard/download")
    expect(container.textContent).toContain("All platforms")
    expect(container.textContent).not.toContain("No card is asked for")
  })

  it("tells a member who has to start the trial, and offers no checkout", async () => {
    const { container, unmount } = await render(panel(organization, "member"))

    mounted.push(unmount)

    await waitUntil(
      () =>
        container.textContent?.includes("The owner starts the trial") === true
    )

    expect(container.textContent).toContain("ada@test.local")
    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(container.textContent).not.toContain("No card is asked for")
  })
})
