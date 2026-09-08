import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  checkEntries,
  entryPath,
  locales,
  parseEntry,
  parseFrontmatter,
  readEntry,
  versionSlug,
} from "../release-notes"

const dirs: string[] = []

function fixture(entries: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pupitre-changelog-"))
  dirs.push(dir)

  for (const [relative, content] of Object.entries(entries)) {
    const file = path.join(dir, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, content)
  }

  return dir
}

function entry(
  locale: string,
  version: string,
  body = "What changed."
): string {
  return `---\ntitle: A version\ndescription: One line.\nlocale: ${locale}\nversion: ${version}\nchannel: beta\ndate: 2026-09-08\norder: 2\n---\n\n${body}\n`
}

afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe("the file a version maps to", () => {
  test("turns the dots of a version into dashes", () => {
    expect(versionSlug("0.2.0")).toBe("0-2-0")
    expect(versionSlug("1.10.3")).toBe("1-10-3")
  })

  test("lands under the locale directory", () => {
    expect(entryPath("fr", "0.2.0", "/tmp/changelog")).toBe(
      "/tmp/changelog/fr/0-2-0.mdx"
    )
  })
})

describe("the frontmatter", () => {
  test("reads the fields the collection declares", () => {
    const fields = parseFrontmatter(entry("en", "0.2.0"))

    expect(fields.version).toBe("0.2.0")
    expect(fields.locale).toBe("en")
    expect(fields.channel).toBe("beta")
  })

  test("unquotes a value and keeps a colon inside it", () => {
    expect(
      parseFrontmatter('---\ntitle: "Pupitre: the version"\n---\n')
    ).toEqual({
      title: "Pupitre: the version",
    })
  })

  test("returns nothing when the file has no frontmatter", () => {
    expect(parseFrontmatter("Just prose.\n")).toEqual({})
  })

  test("separates the body from the frontmatter", () => {
    expect(parseEntry(entry("en", "0.2.0", "The body.")).body).toBe("The body.")
  })
})

describe("reading one entry", () => {
  const dir = fixture({
    "en/0-2-0.mdx": entry("en", "0.2.0", "What the app does now."),
    "fr/0-2-0.mdx": entry("fr", "0.2.0", "Ce que l'app fait maintenant."),
  })

  test("finds the locales that exist", () => {
    expect(locales(dir)).toEqual(["en", "fr"])
  })

  test("returns the body without the frontmatter", () => {
    expect(readEntry("en", "0.2.0", dir).body).toBe("What the app does now.")
  })

  test("refuses a version that has no entry", () => {
    expect(() => readEntry("en", "0.3.0", dir)).toThrow("does not exist")
  })
})

describe("checking a version", () => {
  test("passes when every locale has its entry", () => {
    const dir = fixture({
      "en/0-2-0.mdx": entry("en", "0.2.0"),
      "fr/0-2-0.mdx": entry("fr", "0.2.0"),
    })

    expect(checkEntries("0.2.0", dir)).toEqual([])
  })

  test("names the locale that is missing", () => {
    const dir = fixture({ "en/0-2-0.mdx": entry("en", "0.2.0") })
    mkdirSync(path.join(dir, "fr"), { recursive: true })

    expect(checkEntries("0.2.0", dir)).toEqual([
      expect.stringContaining("fr/0-2-0.mdx"),
    ])
  })

  test("catches a frontmatter that names another version", () => {
    const dir = fixture({ "en/0-2-0.mdx": entry("en", "0.1.0") })

    expect(checkEntries("0.2.0", dir)).toEqual([
      expect.stringContaining("declares version 0.1.0"),
    ])
  })

  test("catches a frontmatter that names another locale", () => {
    const dir = fixture({ "en/0-2-0.mdx": entry("fr", "0.2.0") })

    expect(checkEntries("0.2.0", dir)).toEqual([
      expect.stringContaining("declares locale fr"),
    ])
  })

  test("catches an entry that is a frontmatter and nothing else", () => {
    const dir = fixture({ "en/0-2-0.mdx": entry("en", "0.2.0", "") })

    expect(checkEntries("0.2.0", dir)).toEqual([
      expect.stringContaining("frontmatter and nothing else"),
    ])
  })

  test("says so when no locale directory exists at all", () => {
    const dir = fixture({ "README.md": "nothing here" })

    expect(checkEntries("0.2.0", dir)).toEqual([
      expect.stringContaining("no locale directory"),
    ])
  })
})
