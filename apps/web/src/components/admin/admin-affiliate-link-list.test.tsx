import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { createOrganizationWithMembers } from "@pupitre/api/testing/factories"
import type { OrgRole } from "@pupitre/shared/permissions"
import {
  AdminAffiliateLinkList,
  type AdminAffiliateLinkListSearch,
} from "@/components/admin/admin-affiliate-link-list"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { ListSearchHarness } from "@/testing/list-search"
import {
  fill,
  render,
  trigger,
  waitUntil,
  waitUntilStored,
  withDashboard,
} from "@/testing/render"

const mounted: (() => void)[] = []

const SETTLE_MS = 5000

function list(
  platformRole: OrgRole = "owner",
  initial?: AdminAffiliateLinkListSearch
) {
  return withDashboard(
    <ListSearchHarness<AdminAffiliateLinkListSearch> initial={initial}>
      {(handle) => <AdminAffiliateLinkList {...handle} />}
    </ListSearchHarness>,
    { platformRole }
  )
}

async function seedLink(
  name: string,
  code: string,
  extra: { partnerName?: string; disabled?: boolean } = {}
) {
  const { prisma } = await bootApiTestServer()

  return await prisma.affiliateLink.create({
    data: {
      name,
      code,
      freeMonths: 1,
      seats: 1,
      partnerName: extra.partnerName ?? null,
      disabledAt: extra.disabled ? new Date() : null,
    },
  })
}

async function seedReferral(linkId: string) {
  const { prisma } = await bootApiTestServer()
  const { organization } = await createOrganizationWithMembers({
    roles: ["owner"],
  })

  await prisma.referral.create({
    data: { organizationId: organization.id, linkId },
  })
}

function field(id: string): Element {
  const found = document.querySelector(`#${id}`)

  if (!found) {
    throw new Error(`no field ${id}`)
  }

  return found
}

/** The row moves before the platform answers: the store is read once the call has landed, or the wait is over. */
async function storedDisabled(code: string, expected: boolean) {
  const { prisma } = await bootApiTestServer()
  const deadline = Date.now() + SETTLE_MS
  const read = async () => {
    const row = await prisma.affiliateLink.findUnique({ where: { code } })

    return row !== null && row.disabledAt !== null
  }
  let disabled = await read()

  while (disabled !== expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    disabled = await read()
  }

  return disabled
}

async function storedCount(): Promise<number> {
  const { prisma } = await bootApiTestServer()

  return await prisma.affiliateLink.count()
}

function menuItem(label: string): Element {
  const found = [...document.querySelectorAll("[role=menuitem]")].find(
    (item) => (item.textContent ?? "").trim() === label
  )

  if (!found) {
    throw new Error(`no menu item ${label}`)
  }

  return found
}

function submitOfDialog(): Element {
  const found = document.querySelector("[role=dialog] button[type=submit]")

  if (!found) {
    throw new Error("no dialog open")
  }

  return found
}

describe("AdminAffiliateLinkList", () => {
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

  it("creates a link with its partner, then disables it from the row menu", async () => {
    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("No affiliate link yet") === true
    )

    await click(trigger(container, "Create a link"))
    await waitUntil(() => document.querySelector("#affiliate-name") !== null)

    await fill(field("affiliate-name"), "Ada")
    await fill(field("affiliate-code"), "ada-2026")
    await fill(field("affiliate-free-months"), "3")
    await fill(field("affiliate-partner-name"), "Ada Lovelace")
    await fill(field("affiliate-partner-email"), "ada@partner.test")
    await fill(field("affiliate-notes"), "Met at the fair")
    await click(trigger(container, "Create the link"))
    await waitUntil(() => container.textContent?.includes("ada-2026") === true)

    expect(container.textContent).toContain("Ada")
    expect(container.textContent).toContain("Ada Lovelace")
    expect(container.textContent).toContain("Enabled")
    expect(container.textContent).not.toContain("No affiliate link yet")
    expect(
      container.querySelector('[aria-label="Copy the link"]')
    ).not.toBeNull()

    await click(trigger(container, "Actions on Ada"))
    await waitUntil(() => document.querySelector("[role=menuitem]") !== null)
    await click(menuItem("Disable"))
    await waitUntil(() => container.textContent?.includes("Disabled") === true)

    expect(await storedDisabled("ada-2026", true)).toBe(true)
  })

  it("refuses a code that is already taken, under the code field", async () => {
    await seedLink("Ada", "ada-2026")

    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("ada-2026") === true)

    await click(trigger(container, "Create a link"))
    await waitUntil(() => document.querySelector("#affiliate-name") !== null)

    await fill(field("affiliate-name"), "Ada again")
    await fill(field("affiliate-code"), "ada-2026")
    await click(trigger(container, "Create the link"))
    await waitUntil(() => document.querySelector("[role=alert]") !== null)

    expect(container.querySelectorAll("tbody tr")).toHaveLength(1)
    expect(container.textContent).not.toContain("Ada again")
    expect(await storedCount()).toBe(1)
  })

  it("refuses a malformed code before calling the platform", async () => {
    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("No affiliate link yet") === true
    )

    await click(trigger(container, "Create a link"))
    await waitUntil(() => document.querySelector("#affiliate-name") !== null)

    await fill(field("affiliate-name"), "Ada")
    await fill(field("affiliate-code"), "Ada 2026")
    await click(trigger(container, "Create the link"))
    await waitUntil(
      () => document.body.textContent?.includes("lowercase letters") === true
    )

    expect(await storedCount()).toBe(0)
  })

  it("leaves a reader of the platform the rows without a gesture", async () => {
    await seedLink("Ada", "ada-2026")

    const { container, unmount } = await render(list("member"))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("ada-2026") === true)

    expect(container.textContent).toContain("Ada")
    expect(container.textContent).toContain("Enabled")
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1)
    expect(container.querySelector('[aria-label="Actions on Ada"]')).toBeNull()
    expect(container.textContent).not.toContain("Create a link")
  })

  it("narrows the list by what is typed, then by the state asked for", async () => {
    await seedLink("Salon des makers", "makers", { partnerName: "Ada" })
    await seedLink("Podcast", "podcast", { disabled: true })

    const typed = await render(list("owner", { q: "podcast" }))

    mounted.push(typed.unmount)

    await waitUntil(
      () => typed.container.textContent?.includes("Podcast") === true
    )

    expect(typed.container.querySelectorAll("tbody tr")).toHaveLength(1)
    expect(typed.container.textContent).not.toContain("Salon des makers")

    const enabled = await render(list("owner", { disabled: false }))

    mounted.push(enabled.unmount)

    await waitUntil(
      () => enabled.container.textContent?.includes("Salon des makers") === true
    )

    expect(enabled.container.querySelectorAll("tbody tr")).toHaveLength(1)
    expect(enabled.container.textContent).not.toContain("Podcast")
  })

  it("keeps a link that already brought an organisation, and says how to stop it", async () => {
    const referred = await seedLink("Podcast", "podcast")

    await seedReferral(referred.id)

    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Podcast") === true)

    await click(trigger(container, "Actions on Podcast"))
    await waitUntil(() => document.querySelector("[role=menuitem]") !== null)
    await click(menuItem("Delete the link"))
    await waitUntil(
      () =>
        document.querySelector(`#delete-link-${referred.id}-keyword`) !== null
    )

    await fill(field(`delete-link-${referred.id}-keyword`), "podcast")
    await click(submitOfDialog())
    await waitUntil(
      () =>
        document.body.textContent?.includes(
          "This link already brought an organization"
        ) === true
    )

    expect(document.body.textContent).toContain("Disable it")
    expect(await storedCount()).toBe(1)
  })

  it("deletes a link nobody arrived through, once its code is retyped", async () => {
    const unused = await seedLink("Podcast", "podcast")

    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Podcast") === true)

    await click(trigger(container, "Actions on Podcast"))
    await waitUntil(() => document.querySelector("[role=menuitem]") !== null)
    await click(menuItem("Delete the link"))
    await waitUntil(
      () => document.querySelector(`#delete-link-${unused.id}-keyword`) !== null
    )

    await fill(field(`delete-link-${unused.id}-keyword`), "podcast")
    await click(submitOfDialog())
    await waitUntilStored(async () => (await storedCount()) === 0)

    expect(await storedCount()).toBe(0)
  })
})
