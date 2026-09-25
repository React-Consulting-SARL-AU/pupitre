import { afterEach, describe, expect, it } from "bun:test"
import { QueryClientProvider } from "@tanstack/react-query"
import { SidebarAccountMenu } from "@/components/dashboard/sidebar-account-menu"
import { LocaleProvider } from "@/hooks/use-locale"
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
  organizations: [],
  activeOrganization: null,
  role: "owner" as const,
  entitlement: "valid",
  platformRole: null,
  platformCanAct: false,
}

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("SidebarAccountMenu", () => {
  it("nomme son icône dans une infobulle", async () => {
    const { container, unmount } = await render(
      withRouter(
        <LocaleProvider initial="fr">
          <QueryClientProvider client={createQueryClient()}>
            <DashboardContext.Provider value={CONTEXT}>
              <SidebarAccountMenu />
            </DashboardContext.Provider>
          </QueryClientProvider>
        </LocaleProvider>
      )
    )

    mounted.push(unmount)

    expect(trigger(container, "Ada").title).toBe("Compte et préférences")
  })
})
