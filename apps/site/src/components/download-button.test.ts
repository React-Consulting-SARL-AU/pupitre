import { describe, expect, it } from "vitest"
import { actionTo } from "../test/actions"
import { render } from "../test/render"
import DownloadButton from "./DownloadButton.astro"

describe("DownloadButton", () => {
  it("renders an inverted link with the label", async () => {
    const html = await render(DownloadButton, {
      props: { href: "/download/", label: "Download the app" },
    })

    expect(actionTo(html, "/download/")).toEqual({
      href: "/download/",
      label: "Download the app",
      main: true,
    })
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
