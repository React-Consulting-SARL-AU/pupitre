import { afterEach, describe, expect, it } from "bun:test"
import { developmentNotice } from "@pupitre/shared/legal"
import { DevelopmentBanner } from "@/components/ui/development-banner"
import { LocaleProvider } from "@/hooks/use-locale"
import { render } from "@/testing/render"

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("DevelopmentBanner", () => {
  it("says in the page's language that the project is under development", async () => {
    const { container, unmount } = await render(
      <LocaleProvider initial="fr">
        <DevelopmentBanner />
      </LocaleProvider>
    )

    mounted.push(unmount)

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      developmentNotice("fr").banner
    )
  })
})
