import { afterEach, describe, expect, it } from "bun:test"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { listSearch, useListSearch } from "@/lib/domain/list-search"
import { render, trigger } from "@/testing/render"

const mounted: (() => void)[] = []

const rootRoute = createRootRoute({ component: Outlet })

const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/list",
  component: ListPage,
  validateSearch: listSearch({ filters: { status: { kind: "string" } } }),
})

function ListPage() {
  const { search, setSearch } = useListSearch(listRoute)

  return (
    <div>
      <Button
        onClick={() => {
          setSearch({ status: "suspended" })
        }}
      >
        Filter
      </Button>
      <Button
        onClick={() => {
          setSearch({ offset: 50 })
        }}
      >
        Next
      </Button>
      <span>{JSON.stringify(search)}</span>
    </div>
  )
}

async function page(initial: string) {
  const history = createMemoryHistory({ initialEntries: [initial] })
  const router = createRouter({
    routeTree: rootRoute.addChildren([listRoute]),
    history,
  })

  await router.load()

  const rendered = await render(<RouterProvider router={router as never} />)

  mounted.push(rendered.unmount)

  return { ...rendered, history }
}

describe("useListSearch", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("turns the page without losing the filter", async () => {
    const { container, click, history } = await page("/list?status=active")

    await click(trigger(container, "Next"))

    expect(history.location.search).toContain("offset=50")
    expect(history.location.search).toContain("status=active")
  })

  it("sends the reader back to the first page as soon as a filter changes", async () => {
    const { container, click, history } = await page(
      "/list?status=active&offset=50"
    )

    await click(trigger(container, "Filter"))

    expect(history.location.search).toContain("status=suspended")
    expect(history.location.search).not.toContain("offset")
  })

  it("replaces the address instead of stacking a step in the history", async () => {
    const { container, click, history } = await page("/list")
    const before = history.length

    await click(trigger(container, "Filter"))

    expect(history.location.search).toContain("status=suspended")
    expect(history.length).toBe(before)
  })
})
