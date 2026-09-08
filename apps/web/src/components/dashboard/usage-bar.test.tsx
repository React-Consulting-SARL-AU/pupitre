import { afterEach, describe, expect, it } from "bun:test"
import type { Locale } from "@pupitre/shared/i18n"
import { UsageBar } from "@/components/dashboard/usage-bar"
import { LocaleProvider } from "@/hooks/use-locale"
import { render } from "@/testing/render"

const mounted: (() => void)[] = []

function bar(locale: Locale, label: string, percent: number | null) {
  return (
    <LocaleProvider initial={locale}>
      <UsageBar label={label} percent={percent} />
    </LocaleProvider>
  )
}

function reading(container: HTMLElement): string {
  return (
    container.querySelector("[role=progressbar]")?.getAttribute("aria-label") ??
    ""
  )
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("UsageBar", () => {
  it("dit la mesure dans la langue de la console", async () => {
    const french = await render(bar("fr", "Disque", 42))

    mounted.push(french.unmount)

    expect(reading(french.container)).toBe("Disque : 42 %")

    const english = await render(bar("en", "Disk", 42))

    mounted.push(english.unmount)

    expect(reading(english.container)).toBe("Disk: 42%")
  })

  it("dit aussi ce qu'elle ne sait pas", async () => {
    const french = await render(bar("fr", "Disque", null))

    mounted.push(french.unmount)

    expect(reading(french.container)).toBe("Disque : inconnu")

    const english = await render(bar("en", "Disk", null))

    mounted.push(english.unmount)

    expect(reading(english.container)).toBe("Disk: unknown")
  })
})
