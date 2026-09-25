import { afterEach, describe, expect, it } from "bun:test"
import { InboxNotesPanel } from "@/components/admin/inbox/inbox-notes-panel"
import { ToastProvider } from "@/components/ui/toast"
import type { InboxNote } from "@/lib/api/inbox-queries"
import { MAX_NOTE_LENGTH } from "@/lib/schemas/inbox"
import { fill, render, trigger, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

function note(id: string, body: string): InboxNote {
  return {
    id,
    body,
    author: { id: "u1", name: "Ada" },
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
  }
}

function panel(notes: InboxNote[]) {
  return withDashboard(
    <ToastProvider>
      <InboxNotesPanel canAct notes={notes} threadId="thr_1" />
    </ToastProvider>,
    { platformRole: "admin" }
  )
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("InboxNotesPanel", () => {
  it("refuses a note past the limit before anything leaves the page", async () => {
    const view = await render(panel([]))

    mounted.push(view.unmount)

    const field = view.container.querySelector("#inbox-note")

    if (!field) {
      throw new Error("no note field")
    }

    await fill(field, "x".repeat(MAX_NOTE_LENGTH + 1))
    await view.click(trigger(view.container, "Add the note"))

    expect(view.container.textContent).toContain(
      `At most ${MAX_NOTE_LENGTH} characters.`
    )
  })

  it("asks before deleting a note", async () => {
    const view = await render(
      panel([note("n1", "first"), note("n2", "second")])
    )

    mounted.push(view.unmount)

    const deletes = [...view.container.querySelectorAll("button")].filter(
      (button) => button.getAttribute("aria-label") === "Delete this note"
    )

    expect(deletes).toHaveLength(2)

    await view.click(deletes[0])

    expect(document.querySelector("[role=alertdialog]")?.textContent).toContain(
      "Delete this note?"
    )
  })
})
