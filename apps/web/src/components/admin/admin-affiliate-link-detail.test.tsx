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
  subscribeOrganization,
} from "@pupitre/api/testing/factories"
import type { OrgRole } from "@pupitre/shared/permissions"
import { useState } from "react"
import { AdminAffiliateLinkDetail } from "@/components/admin/admin-affiliate-link-detail"
import type { AffiliateLinkTab } from "@/lib/domain/affiliate"
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

function Page({ id, opening }: { id: string; opening: AffiliateLinkTab }) {
  const [tab, setTab] = useState<AffiliateLinkTab>(opening)

  return <AdminAffiliateLinkDetail id={id} onTabChange={setTab} tab={tab} />
}

function page(
  id: string,
  opening: AffiliateLinkTab = "overview",
  platformRole: OrgRole = "owner"
) {
  return withDashboard(<Page id={id} opening={opening} />, { platformRole })
}

async function seedLink() {
  const { prisma } = await bootApiTestServer()

  return await prisma.affiliateLink.create({
    data: {
      name: "Salon des makers",
      code: "makers",
      freeMonths: 2,
      seats: 3,
      partnerName: "Ada Lovelace",
      partnerEmail: "ada@partner.test",
      notes: "Met at the fair",
    },
  })
}

async function seedReferral(linkId: string, name: string) {
  const { prisma } = await bootApiTestServer()
  const { organization } = await createOrganizationWithMembers({
    name,
    roles: ["owner"],
  })

  await subscribeOrganization({
    organizationId: organization.id,
    status: "active",
    quantity: 2,
  })
  await prisma.referral.create({
    data: { organizationId: organization.id, linkId },
  })

  return organization
}

async function seedClicks(linkId: string, count: number) {
  const { prisma } = await bootApiTestServer()

  await prisma.affiliateClickDay.create({
    data: { linkId, day: new Date().toISOString().slice(0, 10), count },
  })
}

function field(id: string): Element {
  const found = document.querySelector(`#${id}`)

  if (!found) {
    throw new Error(`no field ${id}`)
  }

  return found
}

describe("AdminAffiliateLinkDetail", () => {
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

  it("opens on the address, the terms, the partner, the notes and what the link brought", async () => {
    const link = await seedLink()

    await seedReferral(link.id, "Atelier")
    await seedClicks(link.id, 7)

    const { container, unmount } = await render(page(link.id))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Salon des makers") === true
    )

    expect(container.textContent).toContain(
      "https://pupitre.studio/?ref=makers"
    )
    expect(container.textContent).toContain("Ada Lovelace")
    expect(container.textContent).toContain("ada@partner.test")
    expect(container.textContent).toContain("Met at the fair")
    expect(container.textContent).toContain("Arrived")
    expect(container.textContent).toContain("On trial")
    expect(container.textContent).toContain("Past due")
    expect(container.textContent).toContain("Canceled")
    expect(container.textContent).toContain("Clicks, total")
    expect(
      container.querySelector('[aria-label="Copy the link"]')
    ).not.toBeNull()
  })

  it("lists the organisations the link brought under its own tab", async () => {
    const link = await seedLink()

    await seedReferral(link.id, "Atelier")

    const { container, unmount, click } = await render(page(link.id))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Salon des makers") === true
    )

    expect(container.textContent).not.toContain("Atelier")

    await click(trigger(container, "Organisations"))
    await waitUntil(() => container.textContent?.includes("Atelier") === true)

    expect(container.textContent).toContain("Active")
  })

  it("holds the apply button until a setting moves, then writes the change", async () => {
    const link = await seedLink()
    const { container, unmount, click } = await render(
      page(link.id, "settings")
    )

    mounted.push(unmount)

    await waitUntil(() => document.querySelector("#link-name") !== null)

    expect((trigger(container, "Apply") as HTMLButtonElement).disabled).toBe(
      true
    )

    await fill(field("link-name"), "Salon des makers 2027")
    await fill(field("link-partner-name"), "Grace Hopper")

    expect((trigger(container, "Apply") as HTMLButtonElement).disabled).toBe(
      false
    )

    await click(trigger(container, "Apply"))
    await waitUntilStored(async () => {
      const { prisma } = await bootApiTestServer()
      const stored = await prisma.affiliateLink.findUniqueOrThrow({
        where: { id: link.id },
      })

      return stored.partnerName === "Grace Hopper"
    })

    const { prisma } = await bootApiTestServer()
    const stored = await prisma.affiliateLink.findUniqueOrThrow({
      where: { id: link.id },
    })

    expect(stored.name).toBe("Salon des makers 2027")
  })

  it("refuses an unreadable partner address under the field", async () => {
    const link = await seedLink()
    const { container, unmount, click } = await render(
      page(link.id, "settings")
    )

    mounted.push(unmount)

    await waitUntil(
      () => document.querySelector("#link-partner-email") !== null
    )

    await fill(field("link-partner-email"), "ada")
    await click(trigger(container, "Apply"))
    await waitUntil(
      () =>
        container.textContent?.includes("Write a readable email address.") ===
        true
    )

    const { prisma } = await bootApiTestServer()
    const stored = await prisma.affiliateLink.findUniqueOrThrow({
      where: { id: link.id },
    })

    expect(stored.partnerEmail).toBe("ada@partner.test")
  })

  it("says what disabling costs, and disables the link from the danger tab", async () => {
    const link = await seedLink()
    const { container, unmount, click } = await render(page(link.id, "danger"))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Disable the link") === true
    )

    expect(container.textContent).toContain(
      "A disabled link records no referral any more"
    )
    expect(container.textContent).toContain(
      "Only a link nobody arrived through can be deleted."
    )

    await click(trigger(container, "Disable"))
    await waitUntilStored(async () => {
      const { prisma } = await bootApiTestServer()
      const stored = await prisma.affiliateLink.findUniqueOrThrow({
        where: { id: link.id },
      })

      return stored.disabledAt !== null
    })

    const { prisma } = await bootApiTestServer()
    const stored = await prisma.affiliateLink.findUniqueOrThrow({
      where: { id: link.id },
    })

    expect(stored.disabledAt).not.toBeNull()
  })

  it("leaves a reader of the platform the overview alone, whichever tab the address names", async () => {
    const link = await seedLink()
    const { container, unmount } = await render(
      page(link.id, "settings", "member")
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Salon des makers") === true
    )

    expect(container.textContent).not.toContain("Link settings")
    expect(container.textContent).not.toContain("Delete the link")
    expect(container.textContent).toContain("Met at the fair")
  })
})
