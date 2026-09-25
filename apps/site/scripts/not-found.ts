import { existsSync, renameSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { DEFAULT_LOCALE, LOCALES } from "../src/lib/i18n"

const LOCALE_PREFIXES = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)

/**
 * The assets layer answers a missing page with the nearest `404.html` up the
 * tree, and Astro writes a localised one as `<locale>/404/index.html`, which it
 * never looks for.
 */
export function flattenNotFoundPages(
  dist: string,
  prefixes: readonly string[] = LOCALE_PREFIXES
): string[] {
  const moved: string[] = []

  for (const prefix of prefixes) {
    const folder = path.join(dist, prefix, "404")
    const nested = path.join(folder, "index.html")

    if (!existsSync(nested)) {
      continue
    }

    const flat = path.join(dist, prefix, "404.html")

    renameSync(nested, flat)
    rmSync(folder, { recursive: true, force: true })
    moved.push(path.relative(dist, flat))
  }

  return moved
}

export function notFoundPages() {
  return {
    name: "pupitre:not-found-pages",
    hooks: {
      "astro:build:done": ({ dir }: { dir: URL }) => {
        flattenNotFoundPages(fileURLToPath(dir))
      },
    },
  }
}
