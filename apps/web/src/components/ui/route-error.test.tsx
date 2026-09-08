import { afterEach, describe, expect, it } from "bun:test"
import { ApiError } from "@pupitre/api/client"
import { RouteError, RouteNotFound } from "@/components/ui/route-error"
import { render, withRouter } from "@/testing/render"

const CONFLICT = 409

const mounted: (() => void)[] = []

function failure() {
  return new ApiError(
    CONFLICT,
    {
      error: {
        code: "conflict",
        message: "The organisation already has a server by that name.",
        fix: "Rename the server, then enrol it again.",
      },
    },
    "conflict"
  )
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("RouteError", () => {
  it("says what the API said, its remedy, and offers to try again", async () => {
    const view = await render(
      withRouter(
        <RouteError
          error={failure()}
          reset={() => {
            // the router resets its boundary; the test only reads the screen
          }}
        />
      )
    )

    mounted.push(view.unmount)

    expect(view.container.textContent).toContain(
      "The organisation already has a server by that name."
    )
    expect(view.container.textContent).toContain(
      "Rename the server, then enrol it again."
    )
    expect(view.container.textContent).toContain("Try again")
  })

  it("falls back to the console's own words when nothing came from the API", async () => {
    const view = await render(
      withRouter(
        <RouteError
          error={new Error("network down")}
          reset={() => {
            // nothing to reset here
          }}
        />
      )
    )

    mounted.push(view.unmount)

    expect(view.container.textContent).toContain("This page could not be read.")
    expect(view.container.textContent).not.toContain("network down")
  })
})

describe("RouteNotFound", () => {
  it("says the address holds nothing, and leads back to the servers", async () => {
    const view = await render(withRouter(<RouteNotFound />))

    mounted.push(view.unmount)

    expect(view.container.textContent).toContain("Nothing at this address")
    expect(view.container.querySelector("a")?.getAttribute("href")).toBe(
      "/dashboard/servers"
    )
  })
})
