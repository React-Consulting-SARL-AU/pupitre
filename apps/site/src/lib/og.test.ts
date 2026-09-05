import { describe, expect, it } from "vitest"
import { OG_HEIGHT, OG_WIDTH, ogImage } from "./og"

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

describe("ogImage", () => {
  it("renders a monochrome PNG at the size crawlers expect", async () => {
    const png = await ogImage({
      eyebrow: "Docs",
      title: "Choose a VPS",
      description: "What Pupitre needs from the machine you rent.",
      footnote: "pupitre.studio/docs/start/vps/",
    })

    expect([...png.slice(0, 4)]).toEqual(PNG_SIGNATURE)

    const width = new DataView(png.buffer, png.byteOffset).getUint32(16)
    const height = new DataView(png.buffer, png.byteOffset).getUint32(20)

    expect(width).toBe(OG_WIDTH)
    expect(height).toBe(OG_HEIGHT)
  }, 20_000)
})
