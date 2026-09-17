import { afterEach, describe, expect, it, spyOn } from "bun:test"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterContextProvider } from "@tanstack/react-router"
import { OrganizationSwitcher } from "@/components/dashboard/organization-switcher"
import { queryKeys } from "@/lib/api/queries"
import { DashboardContext } from "@/lib/domain/dashboard-context"
import { createQueryClient } from "@/lib/query/client"
import { getRouter } from "@/router"
import { render, trigger, waitUntil, withRouter } from "@/testing/render"

const CONTEXT = {
  user: {
    id: "u1",
    email: "ada@test.local",
    name: "Ada",
    image: null,
    locale: "fr" as const,
  },
  organizations: [
    { id: "o1", name: "Ada Lovelace", slug: "ada", role: "owner" },
    { id: "o2", name: "Atelier", slug: "atelier", role: "member" },
  ],
  activeOrganization: { id: "o2", name: "Atelier", slug: "atelier" },
  role: "member" as const,
  entitlement: "valid",
}

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("OrganizationSwitcher", () => {
  it("shows the active organization and lists the others under a group label", async () => {
    const { container, unmount, click } = await render(
      withRouter(
        <QueryClientProvider client={createQueryClient()}>
          <DashboardContext.Provider value={CONTEXT}>
            <OrganizationSwitcher />
          </DashboardContext.Provider>
        </QueryClientProvider>
      )
    )

    mounted.push(unmount)

    expect(container.textContent).toContain("Atelier")

    await click(trigger(container, "Atelier"))

    const items = [...document.querySelectorAll("[role=menuitem]")]

    expect(items).toHaveLength(3)
    expect(document.body.textContent).toContain("Organisations")
    expect(items[1]?.textContent).toContain("Atelier")
    expect(items[2]?.textContent).toContain("New organisation")
    expect(document.body.textContent).not.toContain("Manage the organisation")
  })

  it("names its icon in a tooltip", async () => {
    const { container, unmount } = await render(
      withRouter(
        <QueryClientProvider client={createQueryClient()}>
          <DashboardContext.Provider value={CONTEXT}>
            <OrganizationSwitcher />
          </DashboardContext.Provider>
        </QueryClientProvider>
      )
    )

    mounted.push(unmount)

    expect(trigger(container, "Atelier").title).toBe("Organisations")
  })

  it("drops the previous organisation's answers and refreshes the account before it navigates", async () => {
    const queryClient = createQueryClient()
    const router = getRouter()
    const seen: { servers: unknown; meInvalidated: boolean }[] = []
    const activated: string[] = []
    const setActive = spyOn(globalThis, "fetch").mockImplementation((async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const request = new Request(input, init)

      if (!request.url.endsWith("/api/auth/organization/set-active")) {
        throw new Error(`unexpected request ${request.url}`)
      }

      const body = (await request.json()) as { organizationId: string }

      activated.push(body.organizationId)

      return Response.json({ id: body.organizationId })
    }) as typeof fetch)
    const navigate = spyOn(router, "navigate").mockImplementation((async () => {
      seen.push({
        servers: queryClient.getQueryData(queryKeys.servers),
        meInvalidated:
          queryClient.getQueryState(queryKeys.me)?.isInvalidated ?? false,
      })
    }) as never)

    queryClient.setQueryData(queryKeys.servers, [{ id: "srv-of-atelier" }])
    queryClient.setQueryData(queryKeys.me, { user: { id: "u1" } })

    const { container, unmount, click } = await render(
      <RouterContextProvider router={router}>
        <QueryClientProvider client={queryClient}>
          <DashboardContext.Provider value={CONTEXT}>
            <OrganizationSwitcher />
          </DashboardContext.Provider>
        </QueryClientProvider>
      </RouterContextProvider>
    )

    mounted.push(unmount)

    try {
      await click(trigger(container, "Atelier"))

      const target = [...document.querySelectorAll("[role=menuitem]")].find(
        (item) => item.textContent?.includes("Ada Lovelace")
      )

      if (!target) {
        throw new Error("no menu item for the other organisation")
      }

      await click(target)
      await waitUntil(() => seen.length === 1)

      expect(activated).toEqual(["o1"])
      expect(seen[0]).toEqual({ servers: undefined, meInvalidated: true })
    } finally {
      setActive.mockRestore()
      navigate.mockRestore()
    }
  })
})
