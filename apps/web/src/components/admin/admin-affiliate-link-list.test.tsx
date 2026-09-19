import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
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
  withDashboard,
} from "@/testing/render"

const mounted: (() => void)[] = []

const SETTLE_MS = 5000

function list(platformRole: OrgRole = "owner") {
  return withDashboard(
    <ListSearchHarness<AdminAffiliateLinkListSearch>>
      {(handle) => <AdminAffiliateLinkList {...handle} />}
    </ListSearchHarness>,
    { platformRole }
  )
}

async function seedLink(name: string, code: string) {
  const { prisma } = await bootApiTestServer()

  await prisma.affiliateLink.create({
    data: { name, code, freeMonths: 1, seats: 1 },
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

  it("creates a link from the form at the foot, then disables it from its row", async () => {
    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("No affiliate link yet") === true
    )

    await fill(field("affiliate-name"), "Ada")
    await fill(field("affiliate-code"), "ada-2026")
    await fill(field("affiliate-free-months"), "3")
    await click(trigger(container, "Create the link"))
    await waitUntil(() => container.textContent?.includes("ada-2026") === true)

    expect(container.textContent).toContain("Ada")
    expect(container.textContent).toContain("3 free months")
    expect(container.textContent).toContain("1 seat")
    expect(container.textContent).toContain("0 referrals")
    expect(container.textContent).toContain("Enabled")
    expect(container.textContent).not.toContain("No affiliate link yet")
    expect(
      container.querySelector('[aria-label="Copy the link"]')
    ).not.toBeNull()

    await click(trigger(container, "Disable"))
    await waitUntil(() => container.textContent?.includes("Disabled") === true)

    expect(await storedDisabled("ada-2026", true)).toBe(true)
    expect(trigger(container, "Enable")).not.toBeNull()
  })

  it("refuses a code that is already taken, under the code field", async () => {
    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("No affiliate link yet") === true
    )

    await fill(field("affiliate-name"), "Ada")
    await fill(field("affiliate-code"), "ada-2026")
    await click(trigger(container, "Create the link"))
    await waitUntil(() => container.textContent?.includes("ada-2026") === true)

    await fill(field("affiliate-name"), "Ada again")
    await fill(field("affiliate-code"), "ada-2026")
    await click(trigger(container, "Create the link"))
    await waitUntil(() => container.querySelector("[role=alert]") !== null)

    expect(container.querySelectorAll("tbody tr")).toHaveLength(1)
    expect(container.textContent).not.toContain("Ada again")
  })

  it("refuses a malformed code before calling the platform", async () => {
    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("No affiliate link yet") === true
    )

    await fill(field("affiliate-name"), "Ada")
    await fill(field("affiliate-code"), "Ada 2026")
    await click(trigger(container, "Create the link"))
    await waitUntil(
      () => container.textContent?.includes("lowercase letters") === true
    )

    const { prisma } = await bootApiTestServer()

    expect(await prisma.affiliateLink.count()).toBe(0)
  })

  it("leaves a reader of the platform the rows without either gesture", async () => {
    await seedLink("Ada", "ada-2026")

    const { container, unmount } = await render(list("member"))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("ada-2026") === true)

    expect(container.textContent).toContain("Ada")
    expect(container.textContent).toContain("Enabled")
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1)
    expect(container.textContent).not.toContain("Disable")
    expect(container.textContent).not.toContain("New affiliate link")
    expect(container.querySelector("#affiliate-name")).toBeNull()
  })

  it("gives an administrator of the platform both gestures", async () => {
    await seedLink("Ada", "ada-2026")

    const { container, unmount } = await render(list("admin"))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("ada-2026") === true)

    expect(trigger(container, "Disable")).not.toBeNull()
    expect(container.textContent).toContain("New affiliate link")
    expect(container.querySelector("#affiliate-name")).not.toBeNull()
  })
})
