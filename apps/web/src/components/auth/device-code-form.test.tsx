import { afterEach, describe, expect, it } from "bun:test"
import { DeviceCodeForm } from "@/components/auth/device-code-form"
import { render, withRouter } from "@/testing/render"

const mounted: (() => void)[] = []

afterEach(() => {
  history.replaceState(null, "", "/")

  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("DeviceCodeForm", () => {
  it("asks for the code the app shows, even when the link carried one", async () => {
    history.replaceState(null, "", "/auth/device?user_code=WDJBMJHT")

    const view = await render(withRouter(<DeviceCodeForm />))

    mounted.push(view.unmount)

    const field = view.container.querySelector<HTMLInputElement>("#device-code")

    expect(field?.value).toBe("")
  })
})
