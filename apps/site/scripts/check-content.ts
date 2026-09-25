import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { BANNED_WORDS } from "../src/lib/voice"
import { checkLegalPages } from "./legal"

export interface ContentFinding {
  file: string
  reason: string
}

const PAGES_DIR = "src/pages"
const SCANNED_DIRS = ["src/content", "src/pages"]
const ROUTE_FILE_RE = /\.(astro|md|mdx|html|ts|js)$/
const TEST_FILE_RE = /\.test\.[cm]?[jt]s$/
const FRENCH_PREFIX = "fr/"

/** Endpoints that serve every language from one route, so they have no twin. */
const SHARED_ROUTES = new Set([
  "llms.txt.ts",
  "og/[...slug].png.ts",
  ".well-known/security.txt.ts",
])

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) {
    return out
  }

  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  for (const entry of entries) {
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      walk(full, out)
    } else {
      out.push(full)
    }
  }

  return out
}

function isRoute(relative: string): boolean {
  const hidden = relative.split("/").some((segment) => segment.startsWith("_"))

  return ROUTE_FILE_RE.test(relative) && !TEST_FILE_RE.test(relative) && !hidden
}

export function listRoutes(root: string): string[] {
  const pagesDir = path.join(root, PAGES_DIR)

  return walk(pagesDir)
    .map((file) => path.relative(pagesDir, file))
    .filter(isRoute)
}

export function checkRouteParity(root: string): ContentFinding[] {
  const routes = new Set(listRoutes(root))
  const findings: ContentFinding[] = []

  for (const route of routes) {
    if (SHARED_ROUTES.has(route)) {
      continue
    }

    const french = route.startsWith(FRENCH_PREFIX)
    const twin = french
      ? route.slice(FRENCH_PREFIX.length)
      : `${FRENCH_PREFIX}${route}`

    if (!routes.has(twin)) {
      findings.push({
        file: path.join(PAGES_DIR, route),
        reason: `missing ${french ? "English" : "French"} twin ${path.join(PAGES_DIR, twin)}`,
      })
    }
  }

  return findings
}

export function checkBannedWords(root: string): ContentFinding[] {
  const findings: ContentFinding[] = []

  for (const dir of SCANNED_DIRS) {
    for (const file of walk(path.join(root, dir))) {
      const content = readFileSync(file, "utf8").toLowerCase()

      for (const word of BANNED_WORDS) {
        if (content.includes(word.toLowerCase())) {
          findings.push({
            file: path.relative(root, file),
            reason: `banned word "${word}"`,
          })
        }
      }
    }
  }

  return findings
}

const BLOG_DIR = "src/content/blog"
const BLOG_LOCALES = ["en", "fr"] as const
const TRANSLATION_RE = /^translation:\s*["']?([^"'\n]+?)["']?\s*$/m
const MDX_RE = /\.mdx$/

function translationOf(file: string): string | null {
  const frontmatter = readFileSync(file, "utf8").split("---")[1] ?? ""

  return TRANSLATION_RE.exec(frontmatter)?.[1] ?? null
}

export function checkBlogTranslations(root: string): ContentFinding[] {
  const findings: ContentFinding[] = []

  for (const locale of BLOG_LOCALES) {
    const other = locale === "en" ? "fr" : "en"
    const dir = path.join(root, BLOG_DIR, locale)
    const posts = existsSync(dir)
      ? readdirSync(dir)
          .filter((name) => MDX_RE.test(name))
          .sort()
      : []

    for (const name of posts) {
      const file = path.join(BLOG_DIR, locale, name)
      const slug = name.replace(MDX_RE, "")
      const translation = translationOf(path.join(root, file))

      if (!translation) {
        findings.push({ file, reason: "no `translation` in the frontmatter" })
        continue
      }

      const twin = path.join(root, BLOG_DIR, other, `${translation}.mdx`)

      if (!existsSync(twin)) {
        findings.push({
          file,
          reason: `translation "${translation}" has no post in ${other}`,
        })
        continue
      }

      if (translationOf(twin) !== slug) {
        findings.push({
          file,
          reason: `its ${other} translation "${translation}" does not point back to "${slug}"`,
        })
      }
    }
  }

  return findings
}

export function checkContent(root: string): ContentFinding[] {
  return [
    ...checkRouteParity(root),
    ...checkBannedWords(root),
    ...checkBlogTranslations(root),
    ...checkLegalPages(root),
  ]
}

function main(): void {
  const root = process.cwd()
  const findings = checkContent(root)

  if (findings.length > 0) {
    process.stderr.write("Content check failed:\n")
    for (const finding of findings) {
      process.stderr.write(`- ${finding.file}: ${finding.reason}\n`)
    }
    process.exit(1)
  }

  const routes = listRoutes(root)
  const pairs = routes.filter((route) => route.startsWith(FRENCH_PREFIX))

  process.stdout.write(
    `Content OK: ${pairs.length} route(s) in both languages (${routes.length} files), no banned word, legal pages complete.\n`
  )
}

if (import.meta.main) {
  main()
}
