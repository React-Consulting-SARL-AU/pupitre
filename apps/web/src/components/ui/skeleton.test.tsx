import { afterEach, describe, expect, it } from "bun:test"
import { PageSkeleton, Skeleton } from "@/components/ui/skeleton"
import { render, withRouter } from "@/testing/render"

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("Skeleton", () => {
  it("stays out of the accessibility tree", async () => {
    const view = await render(<Skeleton className="h-4 w-24" />)

    mounted.push(view.unmount)

    expect(view.container.firstElementChild?.getAttribute("aria-hidden")).toBe(
      "true"
    )
  })
})

describe("PageSkeleton", () => {
  it("keeps the real title and says out loud that it is loading", async () => {
    const view = await render(
      withRouter(<PageSkeleton shape="rows" title="Servers" />)
    )

    mounted.push(view.unmount)

    expect(view.container.querySelector("h1")?.textContent).toBe("Servers")
    expect(view.container.querySelector("[role=status]")).not.toBeNull()
    expect(view.container.textContent).toContain("Loading")
  })

  it("draws cards when the page is made of cards", async () => {
    const view = await render(
      withRouter(<PageSkeleton shape="cards" title="Members" />)
    )

    mounted.push(view.unmount)

    expect(view.container.querySelectorAll("[aria-hidden=true]")).toHaveLength(
      3
    )
  })
})
