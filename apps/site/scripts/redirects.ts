import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

export const PAGES_DIR = "src/pages"

export const REDIRECTS_FILE = "public/_redirects"

const LOCALE_DIRS = ["fr"]

const IGNORED_PAGES = new Set(["index", "404"])

const COLUMNS_RE = /\s+/

function pageRoutes(dir: string, prefix: string): string[] {
  if (!existsSync(dir)) {
    return []
  }

  const routes: string[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name

    if (entry.isDirectory()) {
      if (existsSync(path.join(dir, name, "index.astro"))) {
        routes.push(`${prefix}/${name}`)
      }

      continue
    }

    const base = path.basename(name, ".astro")

    if (name.endsWith(".astro") && !IGNORED_PAGES.has(base)) {
      routes.push(`${prefix}/${base}`)
    }
  }

  return routes
}

export function topLevelRoutes(root: string): string[] {
  const pages = path.join(root, PAGES_DIR)
  const routes = pageRoutes(pages, "")

  for (const locale of LOCALE_DIRS) {
    const dir = path.join(pages, locale)

    if (!existsSync(path.join(dir, "index.astro"))) {
      continue
    }

    routes.push(`/${locale}`, ...pageRoutes(dir, `/${locale}`))
  }

  return [...new Set(routes)].sort()
}

export function redirectSources(content: string): Set<string> {
  const sources = new Set<string>()

  for (const line of content.split("\n")) {
    const trimmed = line.trim()

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue
    }

    const [from] = trimmed.split(COLUMNS_RE)

    if (from?.startsWith("/")) {
      sources.add(from)
    }
  }

  return sources
}

export function missingRedirects(root: string): string[] {
  const file = path.join(root, REDIRECTS_FILE)
  const content = existsSync(file) ? readFileSync(file, "utf8") : ""
  const sources = redirectSources(content)

  return topLevelRoutes(root).filter((route) => !sources.has(route))
}
