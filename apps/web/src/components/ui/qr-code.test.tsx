import { afterEach, describe, expect, it } from "bun:test"
import { QrCode } from "@/components/ui/qr-code"
import { render } from "@/testing/render"

const TOTP_URI =
  "otpauth://totp/Pupitre:ada@test.local?secret=JBSWY3DPEHPK3PXP&issuer=Pupitre"

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("QrCode", () => {
  it("draws the matrix as one path, named for a screen reader", async () => {
    const { container, unmount } = await render(
      <QrCode label="QR code du second facteur" value={TOTP_URI} />
    )

    mounted.push(unmount)

    const svg = container.querySelector("svg")
    const path = container.querySelector("path")

    expect(svg?.getAttribute("aria-label")).toBe("QR code du second facteur")
    expect(svg?.getAttribute("role")).toBe("img")
    expect(path?.getAttribute("d")?.startsWith("M")).toBe(true)
    expect(path?.getAttribute("fill")).toBe("currentColor")
  })

  it("grows with the payload instead of truncating it", async () => {
    const short = await render(<QrCode label="court" value="abc" />)
    const long = await render(
      <QrCode label="long" value={`${TOTP_URI}&digits=6&period=30`} />
    )

    mounted.push(short.unmount, long.unmount)

    const sizeOf = (container: HTMLElement) =>
      Number(
        container.querySelector("svg")?.getAttribute("viewBox")?.split(" ")[2]
      )

    expect(sizeOf(long.container)).toBeGreaterThan(sizeOf(short.container))
  })
})
