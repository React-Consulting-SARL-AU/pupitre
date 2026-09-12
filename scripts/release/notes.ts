import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { entryPath, locales, parseFrontmatter } from "../release-notes"
import { checkRelease } from "./check"
import { hasFlag, say } from "./cli"
import { git, lastVersion } from "./resolve"
import { run } from "./shell"

/**
 * The changelog entry of a version, drafted by Claude from what git says and
 * left for the owner to read before anything is committed.
 *
 * The draft is written straight into the two files the site serves, in the
 * form `check` validates; the owner rewrites what needs it and runs `check`
 * again. What is committed is what the owner read, never what a model wrote
 * unseen.
 */

const ROOT = path.resolve(import.meta.dir, "../..")

const CHANGELOG_DIR = path.join(ROOT, "apps/site/src/content/changelog")

const SKILL = path.join(ROOT, ".claude/skills/release/SKILL.md")

const VOICE = path.join(ROOT, "docs/product/PRODUCT.md")

/** The entry after the last one the site holds, in either locale. */
export function nextOrder(dir = CHANGELOG_DIR): number {
  let highest = 0

  for (const locale of locales(dir)) {
    for (const file of readdirSync(path.join(dir, locale))) {
      const order = Number(
        parseFrontmatter(readFileSync(path.join(dir, locale, file), "utf8"))
          .order
      )

      highest = Math.max(highest, Number.isFinite(order) ? order : 0)
    }
  }

  return highest + 1
}

export function commitsSince(last: string | null): string {
  const range = last ? `v${last}..HEAD` : "HEAD"

  return git(["log", "--no-merges", "--format=%h %s%n%b", range]) ?? ""
}

export function prompt(
  version: string,
  last: string | null,
  order: number,
  date: string
): string {
  const files = locales(CHANGELOG_DIR)
    .map((locale) => path.relative(ROOT, entryPath(locale, version)))
    .join(" and ")

  return [
    `Write the changelog entry for Pupitre ${version}, in the two files ${files}.`,
    `Read first: the rules under "2. Écrire l'entrée de changelog" in ${path.relative(ROOT, SKILL)}, and the voice in ${path.relative(ROOT, VOICE)}.`,
    "Read an existing entry of each locale to copy the frontmatter shape exactly.",
    `Frontmatter values: version ${version}, channel stable, date ${date}, order ${order}; locale en or fr; a title and a one-line description of your own.`,
    `The commits since ${last ? `v${last}` : "the beginning"} are below; read the diff of any commit whose effect for a customer you cannot tell from its message, and mention nothing you cannot tell.`,
    "Both locales say the same things. Write nothing else: no commentary, no question, the two files only.",
    "",
    commitsSince(last),
  ].join("\n")
}

export function notesCommand(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): void {
  const version = env.PUPITRE_RELEASE_VERSION

  if (!version) {
    throw new Error("PUPITRE_RELEASE_VERSION is not set: run `resolve` first.")
  }

  const last = lastVersion()
  const files = locales(CHANGELOG_DIR).map((locale) =>
    entryPath(locale, version)
  )

  if (files.every(existsSync) && !hasFlag(argv, "again")) {
    say(`${version} already has its entries; pass --again to draft them anew.`)
  } else {
    run(
      [
        "claude",
        "-p",
        prompt(
          version,
          last,
          nextOrder(),
          new Date().toISOString().slice(0, 10)
        ),
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        "Read,Write,Edit,Bash(git log:*),Bash(git show:*),Bash(git diff:*)",
      ],
      { cwd: ROOT }
    )
  }

  const failures = checkRelease(version)

  if (failures.length > 0) {
    throw new Error(
      `the draft does not pass check:\n${failures.map((line) => `- ${line}`).join("\n")}`
    )
  }

  say(
    `Read before shipping:\n${files.map((file) => `  ${path.relative(ROOT, file)}`).join("\n")}`
  )
}
