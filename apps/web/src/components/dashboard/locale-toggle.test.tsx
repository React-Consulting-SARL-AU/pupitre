import { afterEach, describe, expect, it } from "bun:test"
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { LocaleToggle } from "@/components/dashboard/locale-toggle"
import { LocaleProvider } from "@/hooks/use-locale"
import { queryKeys } from "@/lib/api/queries"
import { DashboardContext } from "@/lib/domain/dashboard-context"
import { createQueryClient } from "@/lib/query/client"
import { type ApiRecorder, recordApiCalls } from "@/testing/api-recorder"
import { render, trigger, waitUntil } from "@/testing/render"

const SAVE_TIMEOUT_MS = 2000

const mounted: (() => void)[] = []
const recorders: ApiRecorder[] = []

function toggle(
  locale: "fr" | "en",
  client: QueryClient = createQueryClient()
) {
  return (
    <LocaleProvider initial={locale}>
      <QueryClientProvider client={client}>
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
            license: "valid",
            platformRole: null,
            platformCanAct: false,
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

  for (const recorder of recorders.splice(0)) {
    recorder.restore()
  }

  document.documentElement.lang = ""
})

describe("LocaleToggle", () => {
  it("shows the interface language", async () => {
    const { container, unmount } = await render(toggle("en"))

    mounted.push(unmount)

    expect(container.textContent).toContain("English")
    expect(container.textContent).not.toContain("Français")
  })

  it("names its icon in a tooltip", async () => {
    const { container, unmount } = await render(toggle("fr"))

    mounted.push(unmount)

    expect(trigger(container, "Français").title).toBe("Langue")
  })

  it("shows French when it is the chosen language", async () => {
    const { container, unmount } = await render(toggle("fr"))

    mounted.push(unmount)

    expect(container.textContent).toContain("Français")
  })

  it("updates the account language, like the footer", async () => {
    const recorder = recordApiCalls()
    const client = createQueryClient()

    recorders.push(recorder)
    client.setQueryData(queryKeys.me, { user: { id: "u1" } })

    const { container, unmount, click } = await render(toggle("fr", client))

    mounted.push(unmount)

    await click(trigger(container, "Français"))

    const english = [...document.querySelectorAll("[role=menuitemradio]")].find(
      (item) => item.textContent === "English"
    )

    if (!english) {
      throw new Error("the English entry is missing from the toggle")
    }

    await click(english)
    await waitUntil(() => recorder.calls.length > 0, SAVE_TIMEOUT_MS)

    expect(recorder.calls).toEqual(["PATCH /api/v1/me"])
  })
})
