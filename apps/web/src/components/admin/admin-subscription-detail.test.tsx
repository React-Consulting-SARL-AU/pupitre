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
  remoteSubscription,
  useFakeBilling,
} from "@pupitre/api/testing/billing"
import {
  createOrganizationWithMembers,
  createServer,
  subscribeOrganization,
} from "@pupitre/api/testing/factories"
import type { OrgRole } from "@pupitre/shared/permissions"
import { FREE_SERVERS, GRANTED_PRODUCT } from "@pupitre/shared/plans"
import { useState } from "react"
import {
  ADMIN_SUBSCRIPTION_TAB,
  AdminSubscriptionDetail,
  type AdminSubscriptionTab,
} from "@/components/admin/admin-subscription-detail"
import {
  createConsoleUser,
  usePlatformReaderClient,
  useSessionApiClient,
  useSeveredApiClient,
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

function Detail({ id, start }: { id: string; start: AdminSubscriptionTab }) {
  const [tab, setTab] = useState(start)

  return <AdminSubscriptionDetail id={id} onTabChange={setTab} tab={tab} />
}

function page(
  id: string,
  {
    tab = ADMIN_SUBSCRIPTION_TAB,
    platformRole = "owner",
  }: { tab?: AdminSubscriptionTab; platformRole?: OrgRole } = {}
) {
  return withDashboard(<Detail id={id} start={tab} />, { platformRole })
}

async function seedServers(organizationId: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    await createServer({ organizationId })
  }
}

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
  let sessionToken: string

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

    sessionToken = console.token
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("opens on the overview: organisation, product, seats and note, without a Stripe id", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const granted = await grantedSubscription(organization.id, 3)

    await seedServers(organization.id, FREE_SERVERS + 1)

    const { container, unmount } = await render(page(granted.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Atelier") === true)

    expect(container.textContent).toContain("Granted")
    expect(container.textContent).toContain("1 of 3")
    expect(container.textContent).toContain("Partner of the launch")
    expect(container.textContent).toContain("No end date")
    expect(container.textContent).not.toContain("Stripe subscription")
    expect(container.textContent).toContain("Actions")
  })

  it("marks the drift when the servers beyond the free ones outnumber the seats", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const granted = await grantedSubscription(organization.id, 1)

    await seedServers(organization.id, FREE_SERVERS + 1)
    await createServer({ organizationId: organization.id, status: "grace" })

    const { container, unmount } = await render(page(granted.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("2 of 1") === true)

    expect(
      [...container.querySelectorAll("title")].map((mark) => mark.textContent)
    ).toContain("More servers than seats")
  })

  it("files the Stripe deliveries under their own tab", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const stripe = await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
      quantity: 2,
    })

    await prisma.stripeEvent.create({
      data: {
        id: "evt_console_1",
        type: "invoice.payment_failed",
        status: "failed",
        subscriptionId: stripe.stripeSubscriptionId,
      },
    })

    const { container, unmount } = await render(
      page(stripe.id, { tab: "stripe" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("invoice.payment_failed") === true
    )

    expect(container.textContent).toContain("Failed")
  })

  it("stops a licence now, with the reason, and leaves the free servers running", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const { server } = await createServer({ organizationId: organization.id })
    const granted = await grantedSubscription(organization.id, 2)

    const { container, unmount, click } = await render(
      page(granted.id, { tab: "actions" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Stop the licence") === true
    )

    expect(container.textContent).toContain(
      "the servers of Atelier are suspended right away."
    )

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

      return stored.status === "canceled" && machine.status === "active"
    })
    await waitUntil(
      () => container.textContent?.includes("Stop the licence") === false
    )
  })

  it("resumes a subscription Stripe was to stop at the end of the period", async () => {
    const { prisma } = await bootApiTestServer()
    const billing = useFakeBilling()
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const periodEnd = new Date(Date.now() + 12 * DAY_MS)
    const stripe = await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
      quantity: 2,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: true,
    })

    billing.put(
      remoteSubscription({
        id: stripe.stripeSubscriptionId,
        organizationId: organization.id,
        status: "active",
        quantity: 2,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true,
      })
    )

    const { container, unmount, click } = await render(
      page(stripe.id, { tab: "actions" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Resume the subscription") === true
    )
    await click(trigger(container, "Resume"))
    await waitUntil(() => document.querySelector("[role=alertdialog]") !== null)

    const confirm = [
      ...document.querySelectorAll("[role=alertdialog] button"),
    ].find((button) => button.textContent === "Resume the subscription")

    if (!confirm) {
      throw new Error("the resume dialog did not open")
    }

    await click(confirm)
    await waitUntilStored(
      async () =>
        (
          await prisma.subscription.findUniqueOrThrow({
            where: { id: stripe.id },
          })
        ).cancelAtPeriodEnd === false
    )

    expect(billing.resumptions).toEqual([stripe.stripeSubscriptionId])
  })

  it("keeps the stop dialog open on a cut line, and opens it clean next time", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const granted = await grantedSubscription(organization.id, 2)

    await useSeveredApiClient(
      sessionToken,
      (url, method) => method === "POST" && url.includes("/cancel")
    )

    const { container, unmount, click } = await render(
      page(granted.id, { tab: "actions" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Stop the licence") === true
    )
    await click(trigger(container, "Stop now"))

    await waitUntil(() => document.querySelector("#cancel-reason") !== null)

    const reason = document.querySelector("#cancel-reason")
    const confirm = document.querySelector("[role=dialog] button[type=submit]")

    if (!(reason && confirm)) {
      throw new Error("the stop dialog did not open")
    }

    await fill(reason, "Partnership over")
    await click(confirm)
    await waitUntil(
      () =>
        document
          .querySelector("[role=dialog]")
          ?.textContent?.includes("The licence was not stopped.") === true
    )

    const close = [...document.querySelectorAll("[role=dialog] button")].find(
      (button) => button.textContent === "Cancel"
    )

    if (!close) {
      throw new Error("the stop dialog has no way out")
    }

    await click(close)
    await waitUntil(() => document.querySelector("[role=dialog]") === null)
    await click(trigger(container, "Stop now"))
    await waitUntil(() => document.querySelector("[role=dialog]") !== null)

    expect(document.querySelector("[role=dialog]")?.textContent).not.toContain(
      "The licence was not stopped."
    )
  })

  it("deletes a granted row once its identifier is retyped, and leaves the page", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const granted = await grantedSubscription(organization.id, 2)

    const { container, unmount, click } = await render(
      page(granted.id, { tab: "actions" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Delete the licence row") === true
    )

    await click(trigger(container, "Delete the row"))

    await waitUntil(() => document.querySelector("#delete-keyword") !== null)

    const keyword = document.querySelector("#delete-keyword")
    const confirm = document.querySelector("[role=dialog] button[type=submit]")

    if (!(keyword && confirm)) {
      throw new Error("the delete dialog did not open")
    }

    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    await fill(keyword, granted.stripeSubscriptionId)
    await click(confirm)
    await waitUntilStored(
      async () =>
        (await prisma.subscription.count({ where: { id: granted.id } })) === 0
    )
  })

  it("offers no deletion on a row Stripe still bills, and no resizing", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const stripe = await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
      quantity: 2,
    })

    const { container, unmount } = await render(
      page(stripe.id, { tab: "actions" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Stop the licence") === true
    )

    expect(container.textContent).not.toContain("Delete the licence row")
    expect(container.textContent).not.toContain("Seats and end date")
  })

  it("leaves a reader of the platform without the actions tab", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const granted = await grantedSubscription(organization.id, 2)

    await usePlatformReaderClient()

    const { container, unmount } = await render(
      page(granted.id, { platformRole: "member" })
    )

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Atelier") === true)

    expect(container.textContent).not.toContain("Actions")
  })
})
