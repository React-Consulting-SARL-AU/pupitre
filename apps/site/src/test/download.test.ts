import { formatUsd } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import Download from "../components/Download.astro"
import { downloadContent } from "../content/site/download"
import { FALLBACK_RELEASES } from "../content/site/releases"
import { LOCALES } from "../lib/i18n"
import { latestRelease, OPERATING_SYSTEMS } from "../lib/releases"
import { render } from "./render"

const paths = { en: "/download/", fr: "/fr/download/" } as const

describe("download", () => {
  it("offers every system with its size and digest, in both languages", async () => {
    for (const locale of LOCALES) {
      const html = await render(Download, { path: paths[locale] })
      const content = downloadContent(locale)

      expect(html, locale).toContain(`>${content.hero.headline}</h1>`)

      for (const os of OPERATING_SYSTEMS) {
        expect(html, `${locale} ${os}`).toContain(`data-os="${os}"`)
        expect(html, `${locale} ${os}`).toContain(content.os[os].name)
      }

      const release = latestRelease(FALLBACK_RELEASES)

      for (const asset of release?.assets ?? []) {
        expect(html).toContain(`data-download="${asset.os}-${asset.arch}"`)
        expect(html).toContain(asset.url)
      }
    }
  })

  it("warns when the release list came from the fallback", async () => {
    const html = await render(Download, { path: paths.en })

    expect(html).toContain(downloadContent("en").stale.title)
    expect(html).toContain('data-kind="warn"')
  })

  it("states what each side needs", async () => {
    const html = await render(Download, { path: paths.en })
    const { requirements } = downloadContent("en")

    for (const line of [
      ...requirements.app.lines,
      ...requirements.server.lines,
    ]) {
      expect(html).toContain(line)
    }
  })

  it("never quotes a price, because the site does not sell here", async () => {
    const html = await render(Download, { path: paths.en })

    expect(html).not.toContain(formatUsd(19))
  })
})
