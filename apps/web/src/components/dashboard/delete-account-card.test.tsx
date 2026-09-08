import { afterEach, describe, expect, it } from "bun:test"
import { QueryClientProvider } from "@tanstack/react-query"
import { DeleteAccountCard } from "@/components/dashboard/delete-account-card"
import { DashboardContext } from "@/lib/domain/dashboard-context"
import { createQueryClient } from "@/lib/query/client"
import { fill, render, trigger } from "@/testing/render"

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
}

const mounted: (() => void)[] = []

function card() {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <DashboardContext.Provider value={CONTEXT}>
        <DeleteAccountCard />
      </DashboardContext.Provider>
    </QueryClientProvider>
  )
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("DeleteAccountCard", () => {
  it("keeps the deletion locked until the email is typed back", async () => {
    const { container, unmount, click } = await render(card())

    mounted.push(unmount)

    await click(trigger(container, "Delete my account"))

    const confirm = trigger(container, "Delete for good")
    const field = document.querySelector("#confirm-email")

    if (!field) {
      throw new Error("no confirmation field")
    }

    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    await fill(field, "ada@other.local")

    expect(
      (trigger(container, "Delete for good") as HTMLButtonElement).disabled
    ).toBe(true)

    await fill(field, "ada@test.local")

    expect(
      (trigger(container, "Delete for good") as HTMLButtonElement).disabled
    ).toBe(false)
  })
})
