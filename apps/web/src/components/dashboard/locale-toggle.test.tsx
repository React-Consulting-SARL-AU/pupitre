import { afterEach, describe, expect, it } from "bun:test"
import { QueryClientProvider } from "@tanstack/react-query"
import { LocaleToggle } from "@/components/dashboard/locale-toggle"
import { LocaleProvider } from "@/hooks/use-locale"
import { DashboardContext } from "@/lib/domain/dashboard-context"
import { createQueryClient } from "@/lib/query/client"
import { render } from "@/testing/render"

const mounted: (() => void)[] = []

function toggle(locale: "fr" | "en") {
  return (
    <LocaleProvider initial={locale}>
      <QueryClientProvider client={createQueryClient()}>
        <DashboardContext.Provider
          value={{
            user: {
              id: "u1",
              email: "ada@test.local",
              name: "Ada",
              image: null,
              locale,
            },
            organizations: [],
            activeOrganization: null,
            role: "owner" as const,
            entitlement: "valid",
          }}
        >
          <LocaleToggle />
        </DashboardContext.Provider>
      </QueryClientProvider>
    </LocaleProvider>
  )
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("LocaleToggle", () => {
  it("montre la langue de l'interface", async () => {
    const { container, unmount } = await render(toggle("en"))

    mounted.push(unmount)

    expect(container.textContent).toContain("English")
    expect(container.textContent).not.toContain("Français")
  })

  it("montre le français quand c'est la langue choisie", async () => {
    const { container, unmount } = await render(toggle("fr"))

    mounted.push(unmount)

    expect(container.textContent).toContain("Français")
  })
})
