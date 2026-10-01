import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import Fr from "../pages/fr/pricing.astro"
import Home from "../pages/index.astro"
import En from "../pages/pricing.astro"
import { render } from "./render"

const MOCKED_FREE_SERVERS = vi.hoisted(() => 7)

vi.mock("@pupitre/shared/plans", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pupitre/shared/plans")>()

  return { ...actual, FREE_SERVERS: MOCKED_FREE_SERVERS }
})

const SOURCE_RE = /\.(ts|astro|mdx)$/
const TEST_RE = /\.test\.ts$/
const WRITTEN_COUNT_RE =
  /\b(\d+|three|trois)\s+(servers?|serveurs?|machines?)\b/i
const DEFAULT_COUNT_RE = /\b3 serv/

/** Release notes are history: they keep the numbers of their day. */
const HISTORY = new Set(["changelog"])

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (!HISTORY.has(entry.name)) {
        sources(full, out)
      }
    } else if (SOURCE_RE.test(entry.name) && !TEST_RE.test(entry.name)) {
      out.push(full)
    }
  }

  return out
}

describe("the free servers follow @pupitre/shared/plans", () => {
  it("shows the mocked number of free servers without any edit", async () => {
    for (const [page, pathname] of [
      [En, "/pricing/"],
      [Fr, "/fr/pricing/"],
      [Home, "/"],
    ] as const) {
      const html = await render(page, { path: pathname })

      expect(html, pathname).toContain(`${MOCKED_FREE_SERVERS} serv`)
      expect(html, pathname).not.toMatch(DEFAULT_COUNT_RE)
    }
  })

  it("never writes a number of servers by hand in the site sources", () => {
    const root = path.resolve(import.meta.dirname, "..")

    for (const file of sources(root)) {
      const text = readFileSync(file, "utf8")

      expect(text, path.relative(root, file)).not.toMatch(WRITTEN_COUNT_RE)
    }
  })
})
