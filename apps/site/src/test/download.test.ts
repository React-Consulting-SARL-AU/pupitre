import { formatUsd } from "@pupitre/shared/plans"
import { describe, expect, it, vi } from "vitest"
import Download from "../components/Download.astro"
import { downloadContent } from "../content/site/download"
import { FALLBACK_RELEASES } from "../content/site/releases"
import { LOCALES } from "../lib/i18n"
import { latestRelease, OPERATING_SYSTEMS } from "../lib/releases"
import { SIGNUP_URL } from "../lib/urls"
import {
  actions,
  offersDownloadAsMainAction,
  undeclaredButtons,
} from "./actions"
import { render } from "./render"

const paths = { en: "/download/", fr: "/fr/download/" } as const

/** A title that counts anything drifts the day a step is added or split. */
const MEGABYTES_RE = /\d+ MB/
const COUNT_RE =
  /\d|\b(one|two|three|four|five|six|seven|un|deux|trois|quatre|cinq|six|sept)\b/i

const SERVED = {
  version: "9.9.9",
  channel: "stable",
  published_at: "2026-09-04T00:00:00.000Z",
  builds: [
    {
      os: "macos",
      arch: "arm64",
      format: "dmg",
      bytes: 111_000_000,
      sha256: "b".repeat(64),
      url: "https://example.test/pupitre-macos-arm64.dmg",
    },
  ],
}

function stepCard(html: string, position: number): string {
  const start = html.indexOf(`<p class="step-number">${position}</p>`)

  return html.slice(start, html.indexOf("</li>", start))
}

describe("download", () => {
  it("offers every system in both languages", async () => {
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

  it("publishes a digest and a size only for a release the platform served", async () => {
    for (const locale of LOCALES) {
      const html = await render(Download, { path: paths[locale] })
      const { assets } = downloadContent(locale)

      expect(html, locale).not.toContain(assets.digest)
      expect(html, locale).not.toContain(assets.verify)
      expect(html, locale).not.toMatch(MEGABYTES_RE)
      expect(html, locale).not.toContain("0000000000")
    }

    vi.stubEnv("PUBLIC_RELEASES_URL", "https://example.test/releases")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: [SERVED] }))
    )

    try {
      const html = await render(Download, { path: paths.en })
      const { assets } = downloadContent("en")

      expect(html).toContain(assets.verify)
      expect(html).toContain(`${assets.digest} bbbbbbbbbbbb`)
      expect(html).toContain("111 MB")
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
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

  it("says the account comes first, above the three systems", async () => {
    for (const locale of LOCALES) {
      const html = await render(Download, { path: paths[locale] })
      const { account } = downloadContent(locale)

      expect(html, locale).toContain(account.title)
      expect(html, locale).toContain(account.body)
      expect(actions(html), locale).toContainEqual({
        href: SIGNUP_URL,
        label: account.cta,
        main: true,
      })
      expect(html.indexOf(account.cta), locale).toBeLessThan(
        html.indexOf('data-os="macos"')
      )
    }
  })

  it("puts signing in to the account on the first step", async () => {
    for (const locale of LOCALES) {
      const html = await render(Download, { path: paths[locale] })
      const { install } = downloadContent(locale)

      expect(install.steps, locale).toHaveLength(5)
      expect(install.title, locale).not.toMatch(COUNT_RE)
      expect(html, locale).toContain(`>${install.title}</h2>`)
      expect(stepCard(html, 1), locale).toContain(install.steps[0])
    }
  })

  it("stays public, and offers no download as a main action", async () => {
    for (const locale of LOCALES) {
      const html = await render(Download, { path: paths[locale] })

      expect(html, locale).not.toContain('name="robots"')
      expect(offersDownloadAsMainAction(html), locale).toBe(false)
      expect(undeclaredButtons(html), locale).toEqual([])
    }
  })
})
