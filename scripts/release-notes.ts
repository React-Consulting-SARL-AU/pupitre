import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "..")
const CHANGELOG_DIR = path.join(ROOT, "apps/site/src/content/changelog")

// Release notes are one string, so they take the unprefixed default locale.
export const NOTES_LOCALE = "en"

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/
const FRONTMATTER_BLOCK = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/
const QUOTES = /^["']|["']$/g
const DOTS = /\./g

export interface TChangelogEntry {
  version: string
  locale: string
  title: string
  body: string
}

export function versionSlug(version: string): string {
  return version.replace(DOTS, "-")
}

export function parseFrontmatter(source: string): Record<string, string> {
  const match = source.match(FRONTMATTER)

  if (!match) {
    return {}
  }

  const fields: Record<string, string> = {}

  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":")

    if (separator === -1) {
      continue
    }

    const key = line.slice(0, separator).trim()
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(QUOTES, "")

    if (key) {
      fields[key] = value
    }
  }

  return fields
}

export function parseEntry(source: string): {
  data: Record<string, string>
  body: string
} {
  const data = parseFrontmatter(source)
  const body = source.replace(FRONTMATTER_BLOCK, "").trim()

  return { data, body }
}

export function locales(dir = CHANGELOG_DIR): string[] {
  if (!existsSync(dir)) {
    return []
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

export function entryPath(
  locale: string,
  version: string,
  dir = CHANGELOG_DIR
): string {
  return path.join(dir, locale, `${versionSlug(version)}.mdx`)
}

export function readEntry(
  locale: string,
  version: string,
  dir = CHANGELOG_DIR
): TChangelogEntry {
  const file = entryPath(locale, version, dir)

  if (!existsSync(file)) {
    throw new Error(`${path.relative(ROOT, file)} does not exist`)
  }

  const { data, body } = parseEntry(readFileSync(file, "utf8"))
  const relative = path.relative(ROOT, file)

  if (data.version !== version) {
    throw new Error(
      `${relative} declares version ${data.version || "nothing"}, expected ${version}`
    )
  }

  if (data.locale !== locale) {
    throw new Error(
      `${relative} declares locale ${data.locale || "nothing"}, expected ${locale}`
    )
  }

  if (!data.title) {
    throw new Error(`${relative} has no title`)
  }

  if (!body) {
    throw new Error(`${relative} has a frontmatter and nothing else`)
  }

  return { version, locale, title: data.title, body }
}

export function checkEntries(version: string, dir = CHANGELOG_DIR): string[] {
  const found = locales(dir)

  if (found.length === 0) {
    return [`no locale directory under ${path.relative(ROOT, dir)}`]
  }

  return found.flatMap((locale) => {
    try {
      readEntry(locale, version, dir)

      return []
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)]
    }
  })
}

function argumentOf(name: string): string | undefined {
  const flag = `--${name}=`
  const found = process.argv.find((value) => value.startsWith(flag))

  return found?.slice(flag.length)
}

function main(): void {
  const version = process.argv.slice(2).find((value) => !value.startsWith("--"))

  if (!version) {
    process.stderr.write(
      "Usage: bun scripts/release-notes.ts <version> [--check] [--locale=en] [--out=file]\n"
    )
    process.exit(1)
  }

  if (process.argv.includes("--check")) {
    const failures = checkEntries(version)

    if (failures.length > 0) {
      process.stderr.write(
        `The changelog does not cover ${version}:\n${failures.map((line) => `- ${line}`).join("\n")}\n\nWrite one entry per locale under apps/site/src/content/changelog/, then tag again.\n`
      )
      process.exit(1)
    }

    process.stdout.write(
      `The changelog covers ${version} in ${locales().join(", ")}.\n`
    )

    return
  }

  let entry: TChangelogEntry

  try {
    entry = readEntry(argumentOf("locale") ?? NOTES_LOCALE, version)
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    )
    process.exit(1)
  }

  const out = argumentOf("out")

  if (out) {
    writeFileSync(out, `${entry.body}\n`)

    return
  }

  process.stdout.write(`${entry.body}\n`)
}

if (import.meta.main) {
  main()
}
