import { afterEach, describe, expect, it } from "bun:test"
import { useState } from "react"
import { PageTabs } from "@/components/ui/page-tabs"
import { render, trigger, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

function Tabs() {
  const [tab, setTab] = useState("servers")

  return (
    <PageTabs
      label="Sections"
      onValueChange={setTab}
      tabs={[
        { value: "servers", label: "Servers", panel: <p>Two servers</p> },
        { value: "members", label: "Members", panel: <p>One member</p> },
      ]}
      value={tab}
    />
  )
}

describe("PageTabs", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("renders only the current tab and moves to the one that is clicked", async () => {
    const { container, unmount, click } = await render(withDashboard(<Tabs />))

    mounted.push(unmount)

    expect(container.textContent).toContain("Two servers")
    expect(container.textContent).not.toContain("One member")

    await click(trigger(container, "Members"))

    expect(container.textContent).toContain("One member")
    expect(container.textContent).not.toContain("Two servers")
  })

  it("marks the current tab so its styling can find it", async () => {
    const { container, unmount, click } = await render(withDashboard(<Tabs />))

    mounted.push(unmount)

    const current = () =>
      [...container.querySelectorAll("[role=tab]")].filter((tab) =>
        tab.hasAttribute("data-active")
      )

    expect(current().map((tab) => tab.textContent)).toEqual(["Servers"])
    expect(current()[0]?.className).toContain("data-[active]:border-ink")

    await click(trigger(container, "Members"))

    expect(current().map((tab) => tab.textContent)).toEqual(["Members"])
  })
})
