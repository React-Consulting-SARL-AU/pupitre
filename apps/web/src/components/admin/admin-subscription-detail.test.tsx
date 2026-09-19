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
import { GRANTED_PRODUCT } from "@pupitre/shared/plans"
import { AdminSubscriptionDetail } from "@/components/admin/admin-subscription-detail"
import {
  createConsoleUser,
  grantLaunch,
  useSessionApiClient,
} from "@/testing/harness"
import {
  fill,
  render,
  trigger,
  waitUntil,
  waitUntilStored,
  withDashboard,
} from "@/testing/render"

const mounted: (() => void)[] = []

const DAY_MS = 86_400_000

function page(id: string, platformRole: "owner" | "member" = "owner") {
  return withDashboard(<AdminSubscriptionDetail id={id} />, { platformRole })
}

/** What the grant route writes, laid straight into the table. */
async function grantedSubscription(organizationId: string, quantity: number) {
  const { prisma } = await bootApiTestServer()

  return await prisma.subscription.create({
    data: {
      organizationId,
      stripeSubscriptionId: `granted_${organizationId}`,
      product: GRANTED_PRODUCT,
      quantity,
      status: "active",
      currentPeriodEnd: null,
      note: "Partner of the launch",
    },
  })
}

describe("AdminSubscriptionDetail", () => {
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

  it("shows the organisation, the product, the seats and the note, without a Stripe id", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const granted = await grantedSubscription(organization.id, 3)

    const { container, unmount } = await render(page(granted.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Atelier") === true)

    expect(container.textContent).toContain("Granted")
    expect(container.textContent).toContain("3 seats")
    expect(container.textContent).toContain("Partner of the launch")
    expect(container.textContent).toContain("No end date")
    expect(container.textContent).not.toContain("Stripe subscription")
    expect(container.textContent).toContain("Resize")
  })

  it("stops a subscription now, with the reason, and its servers follow", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const { server } = await createServer({ organizationId: organization.id })
    const granted = await grantedSubscription(organization.id, 2)

    const { container, unmount, click } = await render(page(granted.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Atelier") === true)
    await click(trigger(container, "Stop now"))

    await waitUntil(() => document.querySelector("#cancel-reason") !== null)

    const reason = document.querySelector("#cancel-reason")
    const confirm = document.querySelector("[role=dialog] button[type=submit]")

    if (!(reason && confirm)) {
      throw new Error("the stop dialog did not open")
    }

    await fill(reason, "Partnership over")
    await click(confirm)
    await waitUntilStored(async () => {
      const [stored, machine] = await Promise.all([
        prisma.subscription.findUniqueOrThrow({ where: { id: granted.id } }),
        prisma.server.findUniqueOrThrow({ where: { id: server.id } }),
      ])

      return stored.status === "canceled" && machine.status === "suspended"
    })
    await waitUntil(() => container.textContent?.includes("Cancelled") === true)

    expect(container.textContent).not.toContain("Stop now")
  })

  it("deletes a launch row and leaves the page", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const launch = await grantLaunch(
      organization.id,
      new Date(Date.now() + 30 * DAY_MS)
    )

    const { container, unmount, click } = await render(page(launch.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Launch") === true)

    expect(container.textContent).not.toContain("Resize")

    await click(trigger(container, "Delete the row"))

    const confirm = [
      ...document.querySelectorAll("[role=alertdialog] button"),
    ].find((button) => button.textContent?.trim() === "Delete the row")

    if (!confirm) {
      throw new Error("the delete dialog did not open")
    }

    await click(confirm)
    await waitUntilStored(
      async () =>
        (await prisma.subscription.count({ where: { id: launch.id } })) === 0
    )
  })

  it("offers no deletion on a row Stripe still bills", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const stripe = await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
      quantity: 2,
    })

    const { container, unmount } = await render(page(stripe.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Atelier") === true)

    expect(container.textContent).toContain("Stripe subscription")
    expect(container.textContent).toContain(stripe.stripeSubscriptionId)
    expect(container.textContent).toContain("Stop now")
    expect(container.textContent).not.toContain("Delete the row")
    expect(container.textContent).not.toContain("Resize")
  })

  it("leaves a reader of the platform without any gesture", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const granted = await grantedSubscription(organization.id, 2)

    const { container, unmount } = await render(page(granted.id, "member"))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Atelier") === true)

    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(container.textContent).not.toContain("Resize")
  })
})
