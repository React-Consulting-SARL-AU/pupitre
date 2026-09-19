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
  createServer,
  subscribeOrganization,
} from "@pupitre/api/testing/factories"
import type { SuspensionReason } from "@pupitre/db/cloudflare/client"
import { AdminServerDetail } from "@/components/admin/admin-server-detail"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import {
  fill,
  render,
  trigger,
  waitUntil,
  waitUntilStored,
  withDashboard,
} from "@/testing/render"

const mounted: (() => void)[] = []

function page(id: string) {
  return withDashboard(<AdminServerDetail id={id} />, { platformRole: "owner" })
}

async function suspendedServer(
  organizationId: string,
  reason: SuspensionReason
) {
  const { prisma } = await bootApiTestServer()
  const { server } = await createServer({ organizationId, name: "vps-one" })

  return await prisma.server.update({
    where: { id: server.id },
    data: { status: "suspended", suspendedReason: reason },
  })
}

describe("AdminServerDetail", () => {
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

    // A restore hands the machine back to what the subscription allows: without
    // one it would fall straight back to suspended, for non-payment this time.
    await subscribeOrganization({ organizationId, status: "active" })
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("shows the machine, its organisation and how it is reached", async () => {
    const { server } = await createServer({ organizationId, name: "vps-one" })

    const { container, unmount } = await render(page(server.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Online") === true)

    expect(container.textContent).toContain("SSH port")
    expect(container.textContent).toContain("Channel")
    expect(container.textContent).toContain("Suspend")
  })

  it("lifts the suspension the team laid", async () => {
    const { prisma } = await bootApiTestServer()
    const server = await suspendedServer(organizationId, "admin")

    const { container, unmount, click } = await render(page(server.id))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Suspended by the team") === true
    )
    await click(trigger(container, "Lift the suspension"))
    await waitUntilStored(async () => {
      const stored = await prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })

      return stored.status === "active" && stored.suspendedReason === null
    })
  })

  it("offers nothing to lift on a server suspended for non-payment", async () => {
    const server = await suspendedServer(organizationId, "billing")

    const { container, unmount } = await render(page(server.id))

    mounted.push(unmount)

    await waitUntil(
      () =>
        container.textContent?.includes("Suspended for non-payment") === true
    )

    expect(container.textContent).not.toContain("Lift the suspension")
  })

  it("deletes in two steps: revoked with its date first, purged second", async () => {
    const { prisma } = await bootApiTestServer()
    const { server } = await createServer({ organizationId, name: "vps-one" })

    const { container, unmount, click } = await render(page(server.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Online") === true)
    await click(trigger(container, "Delete"))

    await waitUntil(
      () => document.querySelector(`#delete-${server.id}-reason`) !== null
    )

    const reason = document.querySelector(`#delete-${server.id}-reason`)
    const confirm = document.querySelector("[role=dialog] button[type=submit]")

    if (!(reason && confirm)) {
      throw new Error("the delete dialog did not open")
    }

    await fill(reason, "Machine compromised")
    await click(confirm)
    await waitUntilStored(async () => {
      const stored = await prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })

      return stored.status === "revoked" && stored.decommissionAt !== null
    })
    await waitUntil(() => container.textContent?.includes("Purge") === true)

    expect(container.textContent).toContain("Disappears on")
    expect(container.textContent).not.toContain("Suspend")

    await click(trigger(container, "Purge"))

    await waitUntil(
      () => document.querySelector(`#delete-${server.id}-keyword`) !== null
    )

    const purgeReason = document.querySelector(`#delete-${server.id}-reason`)
    const keyword = document.querySelector(`#delete-${server.id}-keyword`)
    const purge = document.querySelector("[role=dialog] button[type=submit]")

    if (!(purgeReason && keyword && purge)) {
      throw new Error("the purge dialog did not open")
    }

    await fill(purgeReason, "Nothing left to keep")

    expect((purge as HTMLButtonElement).disabled).toBe(true)

    await fill(keyword, "vps-one")
    await click(purge)
    await waitUntilStored(
      async () =>
        (await prisma.server.count({ where: { id: server.id } })) === 0
    )
  })

  it("leaves a reader of the platform without either gesture", async () => {
    const server = await suspendedServer(organizationId, "admin")

    const { container, unmount } = await render(
      withDashboard(<AdminServerDetail id={server.id} />, {
        platformRole: "member",
      })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Suspended by the team") === true
    )

    expect(container.querySelectorAll("button")).toHaveLength(0)
  })
})
