import { afterEach, describe, expect, it } from "bun:test"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DangerZone } from "@/components/ui/danger-zone"
import {
  type RowAction,
  RowActionsMenu,
} from "@/components/ui/row-actions-menu"
import { render, trigger, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

describe("DangerZone", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("names the consequence and carries its action, bordered by its tone", async () => {
    const { container, unmount } = await render(
      withDashboard(
        <DangerZone
          action={<Button variant="danger">Delete the organisation</Button>}
          description="Every server of the organisation is revoked."
          title="Delete the organisation"
        />
      )
    )

    mounted.push(unmount)

    expect(container.textContent).toContain(
      "Every server of the organisation is revoked."
    )
    expect(container.querySelector(".border-danger")).not.toBeNull()
    expect(trigger(container, "Delete the organisation")).not.toBeNull()
  })
})

describe("RowActionsMenu", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("hides nothing when it has nothing to offer", async () => {
    const { container, unmount } = await render(
      withDashboard(<RowActionsMenu actions={[]} label="Actions on vps-one" />)
    )

    mounted.push(unmount)

    expect(container.querySelector("button")).toBeNull()
  })

  it("names itself for the screen reader and runs the item picked", async () => {
    let purged = 0
    const actions: RowAction[] = [
      {
        label: "Purge",
        icon: Trash2,
        tone: "danger",
        onSelect: () => {
          purged += 1
        },
      },
    ]
    const { container, unmount, click } = await render(
      withDashboard(
        <RowActionsMenu actions={actions} label="Actions on vps-one" />
      )
    )

    mounted.push(unmount)

    await click(trigger(container, "Actions on vps-one"))
    await waitUntil(() => document.querySelector("[role=menuitem]") !== null)

    const item = document.querySelector("[role=menuitem]")

    if (!item) {
      throw new Error("no menu item")
    }

    await click(item)

    expect(purged).toBe(1)
  })
})
