import { afterEach, describe, expect, it } from "bun:test"
import { Callout, type CalloutTone } from "@/components/ui/callout"
import { render } from "@/testing/render"

const TONES: CalloutTone[] = ["neutral", "info", "warn", "danger", "ok"]

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("Callout", () => {
  for (const tone of TONES) {
    it(`carries the shape of the ${tone} tone`, async () => {
      const view = await render(<Callout title="Something" tone={tone} />)

      mounted.push(view.unmount)

      const callout = view.container.firstElementChild

      expect(callout?.getAttribute("data-tone")).toBe(tone)
      expect(callout?.querySelector("svg")).not.toBeNull()
    })
  }

  it("shows a remedy that reads like a command as a command", async () => {
    const view = await render(
      <Callout
        fix="sudo systemctl restart pupitred"
        title="The agent stopped."
      />
    )

    mounted.push(view.unmount)

    expect(view.container.querySelector("code")?.textContent).toBe(
      "sudo systemctl restart pupitred"
    )
  })

  it("shows a remedy that reads like a sentence as a sentence", async () => {
    const view = await render(
      <Callout
        fix="Try again in a moment."
        title="The page could not be read."
      />
    )

    mounted.push(view.unmount)

    expect(view.container.querySelector("code")).toBeNull()
    expect(
      [...view.container.querySelectorAll("p")].map((p) => p.textContent)
    ).toContain("Try again in a moment.")
  })

  it("carries the gesture that repairs", async () => {
    const view = await render(
      <Callout
        action={<button type="button">Try again</button>}
        title="The list could not be read."
        tone="danger"
      />
    )

    mounted.push(view.unmount)

    expect(view.container.querySelector("button")?.textContent).toBe(
      "Try again"
    )
  })

  it("interrupts only when something is broken", async () => {
    const danger = await render(<Callout title="Broken" tone="danger" />)
    const neutral = await render(<Callout title="Noted" />)

    mounted.push(danger.unmount, neutral.unmount)

    expect(danger.container.firstElementChild?.getAttribute("role")).toBe(
      "alert"
    )
    expect(neutral.container.firstElementChild?.getAttribute("role")).toBe(
      "status"
    )
  })
})
