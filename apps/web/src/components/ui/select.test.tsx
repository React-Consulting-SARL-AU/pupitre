import { afterEach, describe, expect, it } from "bun:test"
import { useState } from "react"
import { Select } from "@/components/ui/select"
import { pick, render } from "@/testing/render"

const ITEMS = [
  { value: "ada", label: "Ada Lovelace" },
  { value: "alan", label: "Alan Turing" },
]

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

function Picker({ onPick }: { onPick?: (value: string) => void }) {
  const [value, setValue] = useState("")

  return (
    <Select
      id="picker"
      items={ITEMS}
      onValueChange={(next) => {
        setValue(next)
        onPick?.(next)
      }}
      placeholder="Pick somebody…"
      value={value}
    />
  )
}

describe("Select", () => {
  it("shows the placeholder until something is chosen", async () => {
    const { container, unmount } = await render(<Picker />)

    mounted.push(unmount)

    expect(container.textContent).toContain("Pick somebody…")
    expect(container.querySelector("#picker")).not.toBeNull()
  })

  it("lists its items, hands back the chosen value and wears its label", async () => {
    const chosen: string[] = []
    const { container, unmount } = await render(
      <Picker
        onPick={(value) => {
          chosen.push(value)
        }}
      />
    )

    mounted.push(unmount)

    const control = container.querySelector("#picker")

    if (!control) {
      throw new Error("no select")
    }

    await pick(control, "Alan Turing")

    expect(chosen).toEqual(["alan"])
    expect(container.textContent).toContain("Alan Turing")
    expect(container.textContent).not.toContain("Pick somebody…")
  })
})
