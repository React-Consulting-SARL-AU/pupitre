import { afterEach, describe, expect, it } from "bun:test"
import { Button } from "@/components/ui/button"
import { DangerZone } from "@/components/ui/danger-zone"
import { render, trigger, withDashboard } from "@/testing/render"

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
