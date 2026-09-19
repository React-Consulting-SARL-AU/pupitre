import { afterEach, describe, expect, it } from "bun:test"
import { MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES } from "@pupitre/shared/legal"
import { act } from "react"
import { InboxAttachmentPicker } from "@/components/admin/inbox/inbox-attachment-picker"
import { render, trigger } from "@/testing/render"

const mounted: (() => void)[] = []

function file(name: string, size: number, type = "text/plain"): File {
  return new File([new Uint8Array(size)], name, { type })
}

async function choose(container: HTMLElement, files: File[]): Promise<void> {
  const input = container.querySelector("input[type=file]")

  if (!(input instanceof HTMLInputElement)) {
    throw new Error("the picker has no file input")
  }

  const transfer = new DataTransfer()

  for (const chosen of files) {
    transfer.items.add(chosen)
  }

  await act(async () => {
    input.files = transfer.files
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await Promise.resolve()
  })
}

async function mount(files: File[]) {
  const changes: File[][] = []
  const rendered = await render(
    <InboxAttachmentPicker
      files={files}
      id="picker"
      onFilesChange={(next) => {
        changes.push(next)
      }}
    />
  )

  mounted.push(rendered.unmount)

  return { ...rendered, changes }
}

describe("InboxAttachmentPicker", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("lists the chosen files with their size and lets one go", async () => {
    const { container, changes, click } = await mount([
      file("journal.txt", 2048),
    ])

    expect(container.textContent).toContain("journal.txt")
    expect(container.textContent).toContain("2.0 kB")
    expect(container.textContent).toContain("2.0 kB of 5.0 MB")

    await click(trigger(container, "Remove journal.txt"))

    expect(changes).toEqual([[]])
  })

  it("takes a sound selection whole", async () => {
    const { container, changes } = await mount([])

    await choose(container, [file("a.png", 10, "image/png"), file("b.pdf", 20)])

    expect(changes).toHaveLength(1)
    expect(changes[0].map((chosen) => chosen.name)).toEqual(["a.png", "b.pdf"])
    expect(container.querySelector("[role=alert]")).toBeNull()
  })

  it("refuses a blocked file and adds nothing from that selection", async () => {
    const { container, changes } = await mount([])

    await choose(container, [file("notes.txt", 10), file("setup.exe", 10)])

    expect(changes).toEqual([])
    expect(container.querySelector("[role=alert]")?.textContent).toBe(
      "setup.exe cannot be sent by email."
    )
  })

  it("refuses a selection that takes the email past its budget", async () => {
    const { container, changes } = await mount([file("kept.txt", 1)])

    await choose(container, [
      file("big.bin", MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES),
    ])

    expect(changes).toEqual([])
    expect(container.querySelector("[role=alert]")?.textContent).toBe(
      "At most 10 files and 5.0 MB per email; nothing was added."
    )
  })
})
