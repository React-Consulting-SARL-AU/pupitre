import { afterEach, describe, expect, it } from "bun:test"
import { QueryClientProvider } from "@tanstack/react-query"
import { OrganizationSwitcher } from "@/components/dashboard/organization-switcher"
import { DashboardContext } from "@/lib/domain/dashboard-context"
import { createQueryClient } from "@/lib/query/client"
import { render, trigger, withRouter } from "@/testing/render"

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
})
