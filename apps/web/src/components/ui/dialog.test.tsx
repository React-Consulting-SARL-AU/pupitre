import { afterEach, describe, expect, it } from "bun:test"
import { DialogPopup, DialogRoot } from "@/components/ui/dialog"
import { render } from "@/testing/render"

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

function popup(): HTMLElement {
  const found = document.querySelector<HTMLElement>("[role=dialog]")

  if (!found) {
    throw new Error("no dialog on the page")
  }

  return found
}

describe("DialogPopup", () => {
  it("names the dialog and says what it does, read by the screen reader", async () => {
    const view = await render(
      <DialogRoot open>
        <DialogPopup
          description="The organisation starts empty."
          title="New organisation"
        >
          <p>body</p>
        </DialogPopup>
      </DialogRoot>
    )

    mounted.push(view.unmount)

    const dialog = popup()
    const described = dialog.getAttribute("aria-describedby")

    expect(dialog.textContent).toContain("New organisation")
    expect(described && document.getElementById(described)?.textContent).toBe(
      "The organisation starts empty."
    )
  })

  it("keeps a title for the screen reader alone when the dialog shows none", async () => {
    const view = await render(
      <DialogRoot open>
        <DialogPopup placement="top" title="Search" titleHidden>
          <input aria-label="query" />
        </DialogPopup>
      </DialogRoot>
    )

    mounted.push(view.unmount)

    const labelled = popup().getAttribute("aria-labelledby")
    const title = labelled ? document.getElementById(labelled) : null

    expect(title?.textContent).toBe("Search")
    expect(title?.className).toContain("sr-only")
    expect(popup().className).toContain("top-[12vh]")
  })

  it("slides a navigation drawer in from the start edge", async () => {
    const view = await render(
      <DialogRoot open>
        <DialogPopup placement="start" size="nav" title="Menu" titleHidden>
          <nav />
        </DialogPopup>
      </DialogRoot>
    )

    mounted.push(view.unmount)

    expect(popup().className).toContain("inset-y-0")
    expect(popup().className).toContain("w-[min(288px,calc(100vw-48px))]")
  })

  it("sets the actions beside the title", async () => {
    const view = await render(
      <DialogRoot open>
        <DialogPopup
          actions={<button type="button">Download</button>}
          size="lg"
          title="invoice.pdf"
        >
          <iframe title="preview" />
        </DialogPopup>
      </DialogRoot>
    )

    mounted.push(view.unmount)

    expect(popup().querySelector("header")?.textContent).toBe(
      "invoice.pdfDownload"
    )
  })
})
