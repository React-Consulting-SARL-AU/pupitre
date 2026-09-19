import { afterEach, describe, expect, it } from "bun:test"
import { SIDEBAR_ITEM_CLASS } from "@/components/dashboard/sidebar-link"
import { SidebarSearchButton } from "@/components/dashboard/sidebar-search-button"
import { shortcutModifier } from "@/lib/domain/chrome"
import { render, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

describe("SidebarSearchButton", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("sits like every other line of the sidebar and prints the shortcut of this keyboard", async () => {
    const { container, unmount } = await render(
      withDashboard(<SidebarSearchButton />, { platformRole: "owner" })
    )

    mounted.push(unmount)

    const button = container.querySelector("button")
    const shortcut = container.querySelector("kbd")

    for (const token of SIDEBAR_ITEM_CLASS.split(" ")) {
      expect(button?.className, token).toContain(token)
    }

    expect(shortcut?.textContent).toBe(
      `${shortcutModifier(navigator.userAgent)}K`
    )
  })
})
