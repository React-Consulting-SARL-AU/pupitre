import { afterEach, describe, expect, it } from "bun:test"
import { act } from "react"
import { useInboxShortcuts } from "@/hooks/use-inbox-shortcuts"
import { render } from "@/testing/render"

const mounted: (() => void)[] = []

const pressed: string[] = []

function record(name: string) {
  return () => {
    pressed.push(name)
  }
}

function Probe() {
  useInboxShortcuts({
    next: record("next"),
    previous: record("previous"),
    open: record("open"),
    toggleClosed: record("toggleClosed"),
    markUnread: record("markUnread"),
    toggleSelected: record("toggleSelected"),
    escape: record("escape"),
    help: record("help"),
  })

  return <textarea id="inbox-reply" readOnly value="" />
}

async function press(key: string, target: EventTarget = window): Promise<void> {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    )
    await Promise.resolve()
  })
}

describe("useInboxShortcuts", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }

    pressed.length = 0
  })

  it("names every gesture of the inbox", async () => {
    const { unmount } = await render(<Probe />)

    mounted.push(unmount)

    for (const key of ["j", "k", "Enter", "o", "e", "u", "x", "Escape", "?"]) {
      await press(key)
    }

    expect(pressed).toEqual([
      "next",
      "previous",
      "open",
      "open",
      "toggleClosed",
      "markUnread",
      "toggleSelected",
      "escape",
      "help",
    ])
  })

  it("stays quiet while someone is writing", async () => {
    const { container, unmount } = await render(<Probe />)

    mounted.push(unmount)

    const composer = container.querySelector("#inbox-reply")

    if (!composer) {
      throw new Error("the probe did not render its field")
    }

    await press("e", composer)

    expect(pressed).toEqual([])
  })

  it("sends the focus to the reply field on r", async () => {
    const { container, unmount } = await render(<Probe />)

    mounted.push(unmount)

    await press("r")

    expect(document.activeElement).toBe(container.querySelector("#inbox-reply"))
    expect(pressed).toEqual([])
  })
})
