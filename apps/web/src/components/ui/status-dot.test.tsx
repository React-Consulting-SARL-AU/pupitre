import { describe, expect, it } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { StatusDot } from "@/components/ui/status-dot"
import { statusLook } from "@/lib/domain/server-status"
import { translator } from "@/lib/i18n/i18n"

const t = translator("fr")

function markupFor(status: string): string {
  const look = statusLook(status)

  return renderToStaticMarkup(
    <StatusDot label={t(look.label)} shape={look.shape} tone={look.tone} />
  )
}

describe("StatusDot", () => {
  it("carries the shape and a title, not only a colour", () => {
    const active = markupFor("active")

    expect(active).toContain('data-shape="filled"')
    expect(active).toContain("<title>En ligne</title>")
    expect(active).toContain('fill="currentColor"')
  })

  it("draws a hollow circle when the server is in grace", () => {
    expect(markupFor("grace")).toContain('fill="none"')
  })

  it("bars the circle when the server is suspended", () => {
    expect(markupFor("suspended")).toContain("<line")
  })

  it("breathes while the server enrolls", () => {
    expect(markupFor("enrolling")).toContain("animate-breathe")
  })
})
