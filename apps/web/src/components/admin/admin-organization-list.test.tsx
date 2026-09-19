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
  AdminOrganizationList,
  type AdminOrganizationListSearch,
} from "@/components/admin/admin-organization-list"
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

function list(
  initial?: AdminOrganizationListSearch,
  platformRole: OrgRole = "owner"
) {
  return withDashboard(
    <ListSearchHarness<AdminOrganizationListSearch> initial={initial}>
      {(handle) => <AdminOrganizationList {...handle} />}
    </ListSearchHarness>,
    { platformRole }
  )
}

describe("AdminOrganizationList", () => {
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

  it("shows the state of every organisation", async () => {
    await createOrganizationWithMembers({ name: "Atelier", roles: ["owner"] })

    const { container, unmount } = await render(list())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Atelier") === true)

    expect(container.textContent).toContain("Active")
    expect(
      container.querySelectorAll("[data-testid=status-dot]").length
    ).toBeGreaterThan(0)
  })

  it("keeps only the organisations of the state the filter names", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })

    await createOrganizationWithMembers({ name: "Bureau", roles: ["owner"] })
    await prisma.organization.update({
      where: { id: organization.id },
      data: { closedAt: new Date(), closedReason: "demande" },
    })

    const { container, unmount } = await render(list({ state: "closed" }))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Atelier") === true)

    expect(container.textContent).toContain("Closed")
    expect(container.textContent).not.toContain("Bureau")
  })

  it("suspends an organisation from its row menu, with the reason the owners read", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })

    const { container, unmount, click } = await render(list({ q: "Atelier" }))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Atelier") === true)
    await click(trigger(container, "Acts on Atelier"))
    await waitUntil(() => document.querySelector("[role=menuitem]") !== null)

    const item = [...document.querySelectorAll("[role=menuitem]")].find(
      (candidate) =>
        (candidate.textContent ?? "").includes("Suspend the organisation")
    )

    if (!item) {
      throw new Error("the row menu offers no suspension")
    }

    await click(item)
    await waitUntil(
      () => document.querySelector("#suspend-organization-row-reason") !== null
    )

    const reason = document.querySelector("#suspend-organization-row-reason")
    const confirm = document.querySelector("[role=dialog] button[type=submit]")

    if (!(reason && confirm)) {
      throw new Error("the suspension dialog did not open")
    }

    await fill(reason, "Abuse report")
    await click(confirm)
    await waitUntilStored(async () => {
      const stored = await prisma.organization.findUniqueOrThrow({
        where: { id: organization.id },
      })

      return stored.suspendedAt !== null
    })
    await waitUntil(() => container.textContent?.includes("Suspended") === true)
  })

  it("offers no row act to a reader of the platform", async () => {
    await createOrganizationWithMembers({ name: "Atelier", roles: ["owner"] })

    const { container, unmount } = await render(list(undefined, "member"))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Atelier") === true)

    expect(container.querySelector("[aria-label='Acts on Atelier']")).toBeNull()
  })
})
