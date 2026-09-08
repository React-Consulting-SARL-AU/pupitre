import { afterEach, describe, expect, it } from "bun:test"
import { Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { render, trigger, waitUntil } from "@/testing/render"

const mounted: (() => void)[] = []

function dialog(props: { busy?: boolean; onConfirm?: () => void } = {}) {
  return (
    <ConfirmDialog
      busy={props.busy}
      busyLabel="Deleting…"
      confirmLabel="Delete"
      description="The server goes to revoked."
      onConfirm={props.onConfirm ?? (() => undefined)}
      title="Delete this server?"
      triggerIcon={Trash2}
      triggerLabel="Delete the server"
    />
  )
}

function alertDialog(): Element | null {
  return document.querySelector("[role=alertdialog]")
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("ConfirmDialog", () => {
  it("demande deux fois, puis se ferme au clic sans attendre la réponse", async () => {
    let confirmed = 0
    const view = await render(
      dialog({
        onConfirm: () => {
          confirmed += 1
        },
      })
    )

    mounted.push(view.unmount)

    expect(alertDialog()).toBeNull()

    await view.click(trigger(view.container, "Delete the server"))
    await waitUntil(() => alertDialog() !== null)

    expect(alertDialog()?.textContent).toContain("Delete this server?")

    await view.click(trigger(document.body, "Delete"))
    await waitUntil(() => alertDialog() === null)

    expect(confirmed).toBe(1)
  })

  it("laisse le déclencheur respirer tant que l'action court", async () => {
    const view = await render(dialog({ busy: true }))

    mounted.push(view.unmount)

    const button = view.container.querySelector("button") as HTMLButtonElement

    expect(button.disabled).toBe(true)
    expect(button.getAttribute("aria-busy")).toBe("true")
    expect(button.textContent).toContain("Deleting…")
    expect(button.querySelector(".animate-breathe")).not.toBeNull()
  })
})
