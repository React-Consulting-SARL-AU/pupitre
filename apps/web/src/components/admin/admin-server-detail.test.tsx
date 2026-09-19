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
import type { OrgRole } from "@pupitre/shared/permissions"
import { useState } from "react"
import {
  ADMIN_SERVER_TAB,
  AdminServerDetail,
  type AdminServerTab,
} from "@/components/admin/admin-server-detail"
import {
  createConsoleUser,
  useSessionApiClient,
  useSeveredApiClient,
} from "@/testing/harness"
import {
  fill,
  pick,
  render,
  trigger,
  waitUntil,
  waitUntilStored,
  withDashboard,
} from "@/testing/render"

const mounted: (() => void)[] = []

function Detail({ id, start }: { id: string; start: AdminServerTab }) {
  const [tab, setTab] = useState(start)

  return <AdminServerDetail id={id} onTabChange={setTab} tab={tab} />
}

function page(
  id: string,
  {
    tab = ADMIN_SERVER_TAB,
    platformRole = "owner",
  }: { tab?: AdminServerTab; platformRole?: OrgRole } = {}
) {
  return withDashboard(<Detail id={id} start={tab} />, { platformRole })
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

  it("opens on the overview, with the machine, its organisation and how it is reached", async () => {
    const { server } = await createServer({ organizationId, name: "vps-one" })

    const { container, unmount } = await render(page(server.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Online") === true)

    expect(container.textContent).toContain("SSH port")
    expect(container.textContent).toContain("Update channel")
    expect(container.textContent).toContain("Last heartbeat")
    expect(container.textContent).toContain("Danger")
    expect(container.textContent).not.toContain("Suspend the server")
  })

  it("applies the channel picked on the overview", async () => {
    const { prisma } = await bootApiTestServer()
    const { server } = await createServer({ organizationId, name: "vps-one" })

    const { container, unmount } = await render(page(server.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Online") === true)

    const control = container.querySelector(`#channel-${server.id}`)

    if (!control) {
      throw new Error("the channel selector is missing")
    }

    await pick(control, "Beta")
    await waitUntilStored(async () => {
      const stored = await prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })

      return stored.channel === "beta"
    })
  })

  it("draws the seven days on the usage tab and says when nothing came in", async () => {
    const { prisma } = await bootApiTestServer()
    const { server } = await createServer({ organizationId, name: "vps-one" })
    const sample = {
      at: new Date().toISOString(),
      disk: 0.42,
      ram: 0.31,
      load: 0.2,
      sessions: [],
      stack_version: "1.0.0",
      modules: [],
      disk_total_gb: null,
      disk_free_gb: null,
      ram_total_mb: null,
      ram_used_mb: null,
    }
    const empty = await createServer({ organizationId, name: "vps-quiet" })

    await prisma.server.update({
      where: { id: server.id },
      data: {
        metrics: { samples: [sample, { ...sample, disk: 0.55 }] },
        lastUsage: sample,
      },
    })

    const { container, unmount } = await render(
      page(server.id, { tab: "usage" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("The last seven days") === true
    )

    expect(container.textContent).toContain("Last sample")
    expect(container.textContent).toContain("2 readings")
    expect(container.querySelectorAll("polyline")).toHaveLength(3)

    const quiet = await render(page(empty.server.id, { tab: "usage" }))

    mounted.push(quiet.unmount)

    await waitUntil(
      () =>
        quiet.container.textContent?.includes(
          "This server has reported no sample."
        ) === true
    )
  })

  it("closes the open alerts from the alerts tab", async () => {
    const { prisma } = await bootApiTestServer()
    const { server } = await createServer({ organizationId, name: "vps-one" })

    await prisma.alert.create({
      data: { serverId: server.id, kind: "disk_high" },
    })

    const { container, unmount, click } = await render(
      page(server.id, { tab: "alerts" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Close the alerts") === true
    )
    await click(trigger(container, "Close the alerts"))

    const confirm = [
      ...document.querySelectorAll("[role=alertdialog] button"),
    ].find((button) => button.textContent?.trim() === "Close the alerts")

    if (!confirm) {
      throw new Error("the alert dialog did not open")
    }

    await click(confirm)
    await waitUntilStored(async () => {
      const stored = await prisma.alert.findFirstOrThrow({
        where: { serverId: server.id },
      })

      return stored.resolvedAt !== null
    })
  })

  it("names the devices this server no longer serves", async () => {
    const { server } = await createServer({ organizationId, name: "vps-one" })

    const { container, unmount } = await render(
      page(server.id, { tab: "devices" })
    )

    mounted.push(unmount)

    await waitUntil(
      () =>
        container.textContent?.includes("No device revoked on this server.") ===
        true
    )
  })

  it("lifts the suspension the team laid, from the danger tab", async () => {
    const { prisma } = await bootApiTestServer()
    const server = await suspendedServer(organizationId, "admin")

    const { container, unmount, click } = await render(
      page(server.id, { tab: "danger" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Hand the server back") === true
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

    const { container, unmount } = await render(
      page(server.id, { tab: "danger" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Delete the server") === true
    )

    expect(container.textContent).not.toContain("Lift the suspension")
  })

  it("keeps the suspension dialog open on a cut line, and opens it clean next time", async () => {
    const { server } = await createServer({ organizationId, name: "vps-one" })

    await useSeveredApiClient(
      sessionToken,
      (url, method) => method === "POST" && url.includes("/suspend")
    )

    const { container, unmount, click } = await render(
      page(server.id, { tab: "danger" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Suspend the server") === true
    )
    await click(trigger(container, "Suspend"))

    await waitUntil(
      () => document.querySelector(`#suspend-${server.id}-reason`) !== null
    )

    const reason = document.querySelector(`#suspend-${server.id}-reason`)
    const confirm = document.querySelector("[role=dialog] button[type=submit]")

    if (!(reason && confirm)) {
      throw new Error("the suspend dialog did not open")
    }

    await fill(reason, "Machine compromised")
    await click(confirm)
    await waitUntil(
      () =>
        document
          .querySelector("[role=dialog]")
          ?.textContent?.includes("The suspension failed.") === true
    )

    const cancel = [...document.querySelectorAll("[role=dialog] button")].find(
      (button) => button.textContent === "Cancel"
    )

    if (!cancel) {
      throw new Error("the suspend dialog has no way out")
    }

    await click(cancel)
    await waitUntil(() => document.querySelector("[role=dialog]") === null)
    await click(trigger(container, "Suspend"))
    await waitUntil(() => document.querySelector("[role=dialog]") !== null)

    expect(document.querySelector("[role=dialog]")?.textContent).not.toContain(
      "The suspension failed."
    )
  })

  it("deletes in two steps: revoked with its date first, purged second", async () => {
    const { prisma } = await bootApiTestServer()
    const { server } = await createServer({ organizationId, name: "vps-one" })

    const { container, unmount, click } = await render(
      page(server.id, { tab: "danger" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Delete the server") === true
    )
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

    expect(container.textContent).not.toContain("Suspend the server")

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

  it("leaves a reader of the platform without the danger tab nor the channel", async () => {
    const server = await suspendedServer(organizationId, "admin")

    const { container, unmount } = await render(
      page(server.id, { platformRole: "member" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Suspended by the team") === true
    )

    expect(container.textContent).not.toContain("Danger")
    expect(container.querySelector(`#channel-${server.id}`)).toBeNull()
  })
})
