import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { createServer } from "@pupitre/api/testing/factories"
import { AdminOverview } from "@/components/admin/admin-overview"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

function page() {
  return withDashboard(<AdminOverview />, { platformRole: "owner" })
}

describe("AdminOverview", () => {
  let organizationId: string

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

    organizationId = console.organization.id
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("counts the platform and says each work list is empty", async () => {
    const { container, unmount } = await render(page())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Unread mail") === true
    )

    expect(container.textContent).toContain("Users")
    expect(container.textContent).toContain("Unpaid licences")
    expect(container.textContent).not.toContain("Trials ending")
    expect(container.textContent).toContain("Unreachable servers")
    expect(container.textContent).toContain("Servers over the licence")
    expect(container.textContent).toContain("Scheduled deletions")
    expect(container.textContent).toContain("Nothing to handle")
    expect(container.textContent).not.toContain("See everything")
  })

  it("lists an unreachable server and links to its page", async () => {
    const { prisma } = await bootApiTestServer()
    const { server } = await createServer({
      organizationId,
      name: "vps-muet",
    })

    await prisma.alert.create({
      data: { serverId: server.id, kind: "server_unreachable" },
    })

    const { container, unmount } = await render(page())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-muet") === true)

    const link = [...container.querySelectorAll("a")].find(
      (anchor) => anchor.textContent?.includes("vps-muet") === true
    )

    expect(link?.getAttribute("href")).toBe(
      `/dashboard/admin/servers/${server.id}`
    )
    expect(container.textContent).toContain("See everything")
  })

  it("sends an unpaid subscription on to the list already filtered", async () => {
    const { prisma } = await bootApiTestServer()

    await prisma.subscription.create({
      data: {
        organizationId,
        stripeSubscriptionId: "sub_overview_past_due",
        product: "prod_server",
        quantity: 1,
        status: "past_due",
        currentPeriodEnd: new Date(),
      },
    })

    const { container, unmount } = await render(page())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("See everything") === true
    )

    const links = [...container.querySelectorAll("a")].map((anchor) =>
      anchor.getAttribute("href")
    )

    expect(links).toContain("/dashboard/admin/subscriptions?status=past_due")
  })

  it("sends unread mail, unreachable servers and drifted seats on to their filtered list", async () => {
    const { prisma } = await bootApiTestServer()
    const { server } = await createServer({ organizationId, name: "vps-muet" })

    for (const name of ["vps-deux", "vps-trois", "vps-quatre", "vps-cinq"]) {
      await createServer({ organizationId, name })
    }
    await prisma.alert.create({
      data: { serverId: server.id, kind: "server_unreachable" },
    })
    await prisma.mailThread.create({
      data: {
        address: "support@pupitre.studio",
        subject: "La marmotte ne répond plus",
        normalizedSubject: "la marmotte ne repond plus",
        unread: true,
      },
    })
    await prisma.subscription.create({
      data: {
        organizationId,
        stripeSubscriptionId: "sub_overview_drifted",
        product: "prod_server",
        quantity: 1,
        status: "active",
      },
    })

    const { container, unmount } = await render(page())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("See everything") === true
    )

    const links = [...container.querySelectorAll("a")].map((anchor) =>
      anchor.getAttribute("href")
    )
    const inbox = links.find((href) =>
      href?.startsWith("/dashboard/admin/inbox?")
    )

    expect(links).toContain("/dashboard/admin/servers?stale=true")
    expect(links).toContain("/dashboard/admin/subscriptions?drifted=true")
    expect(inbox).toContain("unread=true")
  })

  it("names an unread mail without a subject instead of leaving its line blank", async () => {
    const { prisma } = await bootApiTestServer()

    await prisma.mailThread.create({
      data: {
        address: "support@pupitre.studio",
        subject: "",
        normalizedSubject: "",
        unread: true,
      },
    })

    const { container, unmount } = await render(page())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("See everything") === true
    )

    expect(container.textContent).toContain("No subject")
  })

  it("raises a scheduled deletion and links to the account it will erase", async () => {
    const { prisma } = await bootApiTestServer()
    const doomed = await createConsoleUser({ email: "ada@test.local" })

    await prisma.user.update({
      where: { id: doomed.user.id },
      data: { deletionAt: new Date(), deletionReason: "demande" },
    })

    const { container, unmount } = await render(page())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("ada@test.local") === true
    )

    const link = [...container.querySelectorAll("a")].find(
      (anchor) => anchor.textContent?.includes("ada@test.local") === true
    )

    expect(link?.getAttribute("href")).toBe(
      `/dashboard/admin/users/${doomed.user.id}`
    )
    expect(container.textContent).toContain("Account ·")
  })
})
