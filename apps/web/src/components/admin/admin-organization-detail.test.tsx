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
import type { OrgRole } from "@pupitre/shared/permissions"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { useState } from "react"
import {
  AdminOrganizationDetail,
  type AdminOrganizationTab,
} from "@/components/admin/admin-organization-detail"
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
  start: AdminOrganizationTab
}

function Page({ id, start }: PageProps) {
  const [tab, setTab] = useState<AdminOrganizationTab>(start)

  return <AdminOrganizationDetail id={id} onTabChange={setTab} tab={tab} />
}

function page(
  id: string,
  start: AdminOrganizationTab = "overview",
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

async function pickMenuItem(label: string): Promise<Element> {
  await waitUntil(() => document.querySelector("[role=menuitem]") !== null)

  const item = [...document.querySelectorAll("[role=menuitem]")].find(
    (candidate) => (candidate.textContent ?? "").includes(label)
  )

  if (!item) {
    throw new Error(`no menu item labelled ${label}`)
  }

  return item
}

describe("AdminOrganizationDetail", () => {
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

  it("opens on the state, the facts, the owners and the seats", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner", "member"],
      subscription: { quantity: 3, status: "active" },
    })

    await createServer({ organizationId: organization.id, name: "vps-one" })

    const { container, unmount } = await render(page(organization.id))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes(organization.slug) === true
    )

    expect(container.textContent).toContain("Active")
    expect(container.textContent).toContain(members[0].user.email)
    expect(container.textContent).toContain("3 · 1")
    expect(container.textContent).not.toContain("vps-one")
  })

  it("lists the servers, the members and the subscriptions on their own tabs", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner", "member"],
      subscription: { quantity: 3, status: "active" },
    })

    await createServer({ organizationId: organization.id, name: "vps-one" })

    const { container, unmount, click } = await render(page(organization.id))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes(organization.slug) === true
    )
    await click(trigger(container, "Servers"))
    await waitUntil(() => container.textContent?.includes("vps-one") === true)
    await click(trigger(container, "Members"))
    await waitUntil(
      () => container.textContent?.includes(members[1].user.email) === true
    )
    await click(trigger(container, "Subscriptions"))
    await waitUntil(() => container.textContent?.includes("3 seats") === true)
  })

  it("suspends an organisation and shows its servers suspended", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
      subscription: { quantity: 2, status: "active" },
    })

    await createServer({ organizationId: organization.id, name: "vps-one" })

    const { container, unmount, click } = await render(
      page(organization.id, "danger")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Suspend the organisation") === true
    )
    await click(trigger(container, "Suspend the organisation"))
    await waitUntil(
      () =>
        document.querySelector(`#suspend-${organization.id}-reason`) !== null
    )
    await fill(dialogField(`suspend-${organization.id}-reason`), "Abuse report")
    await click(dialogConfirm())
    await waitUntilStored(async () => {
      const stored = await prisma.organization.findUniqueOrThrow({
        where: { id: organization.id },
      })

      return stored.suspendedAt !== null
    })
    await waitUntil(
      () =>
        container.textContent?.includes("Lift the organisation suspension") ===
        true
    )
    await click(trigger(container, "Servers"))
    await waitUntil(() => container.textContent?.includes("vps-one") === true)

    expect(container.textContent).toContain("Suspended by the team")
  })

  it("closes an organisation, then offers to reopen it", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })

    const { container, unmount, click } = await render(
      page(organization.id, "danger")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Close the organisation") === true
    )
    await click(trigger(container, "Close the organisation"))
    await waitUntil(
      () => document.querySelector(`#close-${organization.id}-reason`) !== null
    )
    await fill(dialogField(`close-${organization.id}-reason`), "Asked for it")
    await click(dialogConfirm())
    await waitUntilStored(async () => {
      const stored = await prisma.organization.findUniqueOrThrow({
        where: { id: organization.id },
      })

      return stored.closedAt !== null
    })
    await waitUntil(
      () => container.textContent?.includes("Reopen the organisation") === true
    )

    expect(container.textContent).not.toContain("Close the organisation")
  })

  it("renames an organisation once the form is dirty", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })

    const { container, unmount, click } = await render(
      page(organization.id, "settings")
    )

    mounted.push(unmount)

    await waitUntil(() => document.querySelector("#organization-name") !== null)

    const apply = trigger(container, "Apply") as HTMLButtonElement

    expect(apply.disabled).toBe(true)

    await fill(dialogField("organization-name"), "Atelier Bis")
    await click(trigger(container, "Apply"))
    await waitUntilStored(async () => {
      const stored = await prisma.organization.findUniqueOrThrow({
        where: { id: organization.id },
      })

      return stored.name === "Atelier Bis"
    })
  })

  it("transfers the ownership from the row menu of a member", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner", "member"],
    })
    const second = members[1].user

    const { container, unmount, click } = await render(
      page(organization.id, "members")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes(second.email) === true
    )
    await click(trigger(container, `Actions on the member ${second.email}`))
    await click(await pickMenuItem("Transfer the ownership"))
    await waitUntil(() => document.querySelector("[role=dialog]") !== null)
    await click(dialogConfirm())
    await waitUntilStored(async () => {
      const stored = await prisma.member.findFirstOrThrow({
        where: { organizationId: organization.id, userId: second.id },
      })

      return stored.role === "owner"
    })
  })

  it("removes a member from the row menu, with the reason the removal is logged with", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner", "member"],
    })
    const second = members[1].user

    const { container, unmount, click } = await render(
      page(organization.id, "members")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes(second.email) === true
    )
    await click(trigger(container, `Actions on the member ${second.email}`))
    await click(await pickMenuItem("Remove the member"))
    await waitUntil(
      () =>
        document.querySelector(`#remove-member-${organization.id}-reason`) !==
        null
    )
    await fill(
      dialogField(`remove-member-${organization.id}-reason`),
      "Left the company"
    )
    await click(dialogConfirm())
    await waitUntilStored(
      async () =>
        (await prisma.member.count({
          where: { organizationId: organization.id, userId: second.id },
        })) === 0
    )
  })

  it("leaves the platform organisation without a danger zone", async () => {
    const { container, unmount } = await render(
      page(PLATFORM_ORGANIZATION_ID, "danger")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("is the platform's own") === true
    )

    expect(container.textContent).not.toContain("Suspend the organisation")
  })

  it("leaves the platform organisation without a rename form", async () => {
    const { container, unmount } = await render(
      page(PLATFORM_ORGANIZATION_ID, "settings")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("is the platform's own") === true
    )

    expect(container.querySelector("#organization-slug")).toBeNull()
  })

  it("leaves the platform organisation's members without a row menu", async () => {
    const { container, unmount } = await render(
      page(PLATFORM_ORGANIZATION_ID, "members")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("is the platform's own") === true
    )

    expect(container.querySelector("[aria-haspopup=menu]")).toBeNull()
  })

  it("greys every act out for a reader of the platform", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })

    const { container, unmount } = await render(
      page(organization.id, "danger", "member")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Suspend the organisation") === true
    )

    const suspend = trigger(
      container,
      "Suspend the organisation"
    ) as HTMLButtonElement

    expect(suspend.disabled).toBe(true)
    expect(suspend.getAttribute("title")).toBe(
      "The owner or admin role in the Pupitre organisation is required."
    )
  })

  it("grants a subscription outside Stripe and keeps the grant shut afterwards", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })

    const { container, unmount, click } = await render(
      page(organization.id, "subscriptions")
    )

    mounted.push(unmount)

    await waitUntil(
      () =>
        container.textContent?.includes("No subscription, past or present.") ===
        true
    )
    await click(trigger(container, "Grant a subscription"))
    await waitUntil(
      () => document.querySelector(`#grant-${organization.id}-seats`) !== null
    )
    await fill(dialogField(`grant-${organization.id}-seats`), "3")
    await fill(
      dialogField(`grant-${organization.id}-note`),
      "Partner of the launch"
    )
    await click(dialogConfirm())
    await waitUntilStored(async () => {
      const stored = await prisma.subscription.findFirst({
        where: { organizationId: organization.id },
      })

      return stored?.product === "granted" && stored.quantity === 3
    })
    await waitUntil(() => container.textContent?.includes("3 seats") === true)

    expect(container.textContent).toContain(
      "A subscription is live: stop it before granting another."
    )
  })
})
