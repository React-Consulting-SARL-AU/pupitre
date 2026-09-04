import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import DownloadButton from "./DownloadButton.astro"

describe("DownloadButton", () => {
  it("renders an inverted link with the label", async () => {
    const html = await render(DownloadButton, {
      props: { href: "/download/", label: "Download the app" },
    })

    expect(html).toContain('<a href="/download/" class="btn btn-primary">')
    expect(html).toContain("Download the app")
    expect(html).not.toContain("font-data")
  })

  it("shows the OS as data next to the label when given", async () => {
    const html = await render(DownloadButton, {
      props: { href: "/download/", label: "Download", os: "macOS" },
    })

    expect(html).toContain(
      '<span class="font-data text-[12px] tabular-nums">macOS</span>'
    )
  })
})
