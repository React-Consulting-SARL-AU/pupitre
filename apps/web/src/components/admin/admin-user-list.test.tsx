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
import {
  AdminUserList,
  type AdminUserListSearch,
} from "@/components/admin/admin-user-list"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { ListSearchHarness } from "@/testing/list-search"
import { fill, render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

function list() {
  return withDashboard(
    <ListSearchHarness<AdminUserListSearch>>
      {(handle) => <AdminUserList {...handle} />}
    </ListSearchHarness>,
    { platformRole: "owner" }
  )
}

describe("AdminUserList", () => {
  let organizationId: string

  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    const console = await createConsoleUser({
      email: "ops@test.local",
      name: "Ops",
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

  it("lists every account with its organisations, their subscription and their servers", async () => {
    await createConsoleUser({ email: "ada@test.local", name: "Ada" })
    await createServer({ organizationId })

    const { container, unmount } = await render(list())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("ada@test.local") === true
    )

    expect(container.textContent).toContain("ops@test.local")
    expect(container.textContent).toContain("1–2 of 2")
    expect(container.textContent).toContain("platform_admin")
    expect(container.textContent).toContain("free")
    expect(container.textContent).toContain("1 server")
    expect(container.textContent).toContain("0 servers")
    expect(container.querySelectorAll("[data-testid=status-dot]")).toHaveLength(
      2
    )
  })

  it("searches by email after the debounce and says when nobody matches", async () => {
    await createConsoleUser({ email: "ada@test.local", name: "Ada" })

    const { container, unmount } = await render(list())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("ada@test.local") === true
    )

    const search = container.querySelector("#admin-users-search")

    if (!search) {
      throw new Error("no search field")
    }

    await fill(search, "ada")
    await waitUntil(
      () => container.textContent?.includes("ops@test.local") === false
    )

    expect(container.textContent).toContain("ada@test.local")

    await fill(search, "nobody")
    await waitUntil(
      () => container.textContent?.includes("No user matches") === true
    )
  })

  it("keeps only the accounts of the state the filter names", async () => {
    const { prisma } = await bootApiTestServer()
    const ada = await createConsoleUser({
      email: "ada@test.local",
      name: "Ada",
    })

    await prisma.user.update({
      where: { id: ada.user.id },
      data: { banned: true, banReason: "abus" },
    })

    const { container, unmount } = await render(
      withDashboard(
        <ListSearchHarness<AdminUserListSearch>
          initial={{ state: "suspended" }}
        >
          {(handle) => <AdminUserList {...handle} />}
        </ListSearchHarness>,
        { platformRole: "owner" }
      )
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("ada@test.local") === true
    )

    expect(container.textContent).toContain("1–1 of 1")
    expect(container.textContent).toContain("Suspended")
    expect(container.textContent).not.toContain("ops@test.local")
  })
})
