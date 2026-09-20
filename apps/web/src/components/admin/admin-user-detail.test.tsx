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
} from "@pupitre/api/testing/factories"
import { joinPlatformOrganization } from "@pupitre/auth/testing"
import type { OrgRole } from "@pupitre/shared/permissions"
import { useState } from "react"
import {
  AdminUserDetail,
  type AdminUserTab,
} from "@/components/admin/admin-user-detail"
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

interface PageProps {
  id: string
  start: AdminUserTab
}

function Page({ id, start }: PageProps) {
  const [tab, setTab] = useState<AdminUserTab>(start)

  return <AdminUserDetail id={id} onTabChange={setTab} tab={tab} />
}

function page(
  id: string,
  start: AdminUserTab = "overview",
  platformRole: OrgRole = "owner"
) {
  return withDashboard(<Page id={id} start={start} />, { platformRole })
}

function dialogField(id: string): Element {
  const field = document.querySelector(`#${id}`)

  if (!field) {
    throw new Error(`the dialog has no field ${id}`)
  }

  return field
}

function dialogConfirm(): HTMLButtonElement {
  const confirm = document.querySelector<HTMLButtonElement>(
    "[role=dialog] button[type=submit]"
  )

  if (!confirm) {
    throw new Error("the dialog did not open")
  }

  return confirm
}

describe("AdminUserDetail", () => {
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

  it("opens on the account, its state and the organisations it belongs to", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const owner = members[0]

    await createServer({
      organizationId: organization.id,
      name: "vps-one",
      assignedUserId: owner.user.id,
    })

    const { container, unmount } = await render(page(owner.user.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Atelier") === true)

    expect(container.textContent).toContain(owner.user.email)
    expect(container.textContent).toContain("Active")
    expect(container.textContent).toContain("No platform role")
    expect(container.textContent).not.toContain("vps-one")
  })

  it("moves to the servers the account holds and to its devices", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const owner = members[0].user

    await createServer({
      organizationId: organization.id,
      name: "vps-one",
      assignedUserId: owner.id,
    })
    await prisma.device.create({
      data: {
        userId: owner.id,
        name: "MacBook",
        publicKey:
          "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJggxfUKhpYOKRen6E6lpoh//viuSJtxOQ8hVlFZb+/t ada@macbook",
        fingerprint: "SHA256:atelier",
      },
    })

    const { container, unmount, click } = await render(page(owner.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes(owner.email) === true)
    await click(trigger(container, "Servers"))
    await waitUntil(() => container.textContent?.includes("vps-one") === true)
    await click(trigger(container, "Devices"))
    await waitUntil(() => container.textContent?.includes("MacBook") === true)
  })

  it("suspends an account with the reason the log keeps, then offers to lift it", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["member"],
    })
    const target = members[0].user

    const { container, unmount, click } = await render(
      page(target.id, "danger")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Suspend the account") === true
    )
    await click(trigger(container, "Suspend the account"))
    await waitUntil(
      () => document.querySelector(`#suspend-${target.id}-reason`) !== null
    )
    await fill(dialogField(`suspend-${target.id}-reason`), "Abuse report")
    await click(dialogConfirm())
    await waitUntilStored(async () => {
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
      })

      return stored.banned === true && stored.banReason === "Abuse report"
    })
    await waitUntil(
      () =>
        container.textContent?.includes("Lift the account suspension") === true
    )

    expect(container.textContent).not.toContain("Suspend the account")
  })

  it("deactivates an account, then offers to reactivate it", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["member"],
    })
    const target = members[0].user

    const { container, unmount, click } = await render(
      page(target.id, "danger")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Deactivate the account") === true
    )
    await click(trigger(container, "Deactivate the account"))
    await waitUntil(
      () => document.querySelector(`#deactivate-${target.id}-reason`) !== null
    )
    await fill(dialogField(`deactivate-${target.id}-reason`), "Dormant")
    await click(dialogConfirm())
    await waitUntilStored(async () => {
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
      })

      return stored.deactivatedAt !== null
    })
    await waitUntil(
      () => container.textContent?.includes("Reactivate the account") === true
    )
  })

  it("schedules a deletion behind the address retyped, then offers to cancel it and to purge", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["member"],
    })
    const target = members[0].user

    const { container, unmount, click } = await render(
      page(target.id, "danger")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Delete the account") === true
    )
    await click(trigger(container, "Delete the account"))
    await waitUntil(
      () => document.querySelector(`#delete-${target.id}-keyword`) !== null
    )
    await fill(dialogField(`delete-${target.id}-reason`), "Asked for it")
    await fill(dialogField(`delete-${target.id}-keyword`), "autre-chose")

    expect(dialogConfirm().disabled).toBe(true)

    await fill(dialogField(`delete-${target.id}-keyword`), target.email)
    await click(dialogConfirm())
    await waitUntilStored(async () => {
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
      })

      return stored.deletionAt !== null
    })
    await waitUntil(
      () => container.textContent?.includes("Purge the account now") === true
    )

    expect(trigger(container, "Cancel the account deletion")).not.toBeNull()
  })

  it("links each organisation to the subscription that counts for it", async () => {
    const { prisma } = await bootApiTestServer()
    const { members, organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
      subscription: { quantity: 2, status: "active" },
    })
    const owner = members[0].user
    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: organization.id },
    })

    const { container, unmount } = await render(page(owner.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Atelier") === true)

    const link = container.querySelector<HTMLAnchorElement>(
      'a[title="Open the subscription"]'
    )

    expect(link?.getAttribute("href")).toBe(
      `/dashboard/admin/subscriptions/${subscription.id}`
    )
  })

  it("shows the refusal of the platform inside the dialog that asked", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 1, status: "active" },
    })
    const owner = members[0].user

    const { container, unmount, click } = await render(page(owner.id, "danger"))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Delete the account") === true
    )
    await click(trigger(container, "Delete the account"))
    await waitUntil(
      () => document.querySelector(`#delete-${owner.id}-keyword`) !== null
    )
    await fill(dialogField(`delete-${owner.id}-reason`), "Asked for it")
    await fill(dialogField(`delete-${owner.id}-keyword`), owner.email)
    await click(dialogConfirm())
    await waitUntil(
      () =>
        document
          .querySelector("[role=dialog]")
          ?.querySelector("[data-tone=danger]") !== null
    )

    expect(document.querySelector("[role=dialog]")).not.toBeNull()
  })

  it("revokes a device with the reason the revocation is logged with", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const owner = members[0].user
    const device = await prisma.device.create({
      data: {
        userId: owner.id,
        name: "MacBook",
        publicKey:
          "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJggxfUKhpYOKRen6E6lpoh//viuSJtxOQ8hVlFZb+/t ada@macbook",
        fingerprint: "SHA256:atelier",
      },
    })

    const { container, unmount, click } = await render(
      page(owner.id, "devices")
    )

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("MacBook") === true)
    await click(trigger(container, "Revoke"))
    await waitUntil(
      () => document.querySelector(`#revoke-${device.id}-reason`) !== null
    )
    await fill(dialogField(`revoke-${device.id}-reason`), "Laptop stolen")
    await click(dialogConfirm())
    await waitUntilStored(
      async () =>
        (await prisma.device.count({ where: { id: device.id } })) === 0
    )
    await waitUntil(
      () => container.textContent?.includes("No device signed in.") === true
    )
  })

  it("leaves a member of the platform organisation with the mention and no danger zone", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const colleague = members[0].user

    await joinPlatformOrganization(
      (await bootApiTestServer()).prisma,
      colleague.id,
      "member"
    )

    const { container, unmount } = await render(page(colleague.id, "danger"))

    mounted.push(unmount)

    await waitUntil(
      () =>
        container.textContent?.includes(
          "belongs to the Pupitre organisation"
        ) === true
    )

    expect(container.textContent).not.toContain("Suspend the account")
    expect(container.textContent).not.toContain("Delete the account")
  })

  it("leaves a member of the platform organisation's devices without a revocation", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const colleague = members[0].user

    await prisma.device.create({
      data: {
        userId: colleague.id,
        name: "MacBook de l'équipe",
        publicKey:
          "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJggxfUKhpYOKRen6E6lpoh//viuSJtxOQ8hVlFZb+/t ada@macbook",
        fingerprint: "SHA256:equipe",
      },
    })
    await joinPlatformOrganization(prisma, colleague.id, "member")

    const { container, unmount } = await render(page(colleague.id, "devices"))

    mounted.push(unmount)

    await waitUntil(
      () =>
        container.textContent?.includes(
          "belongs to the Pupitre organisation"
        ) === true
    )

    expect(container.textContent).toContain("MacBook de l'équipe")
    expect(container.textContent).not.toContain("Revoke")
  })

  it("greys every act out for a reader of the platform, and says which role acts", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["member"],
    })
    const target = members[0].user

    const { container, unmount } = await render(
      page(target.id, "danger", "member")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Suspend the account") === true
    )

    const suspend = trigger(
      container,
      "Suspend the account"
    ) as HTMLButtonElement

    expect(suspend.disabled).toBe(true)
    expect(suspend.getAttribute("title")).toBe(
      "The owner or admin role in the Pupitre organisation is required."
    )
  })
})
