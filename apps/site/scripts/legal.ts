import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

export const LEGAL_DIR = "src/content/legal"

const TODO_MARKER = "TODO"

const DRAFT_FRONTMATTER = /^draft:\s*true\s*$/m

/** A bracket that doesn't open a Markdown link: information still missing. */
const PLACEHOLDER = /\[[^\]\n]+\](?!\()/

export interface LegalFinding {
  file: string
  reason: string
}

export function isProduction(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.PUPITRE_ENV === "production"
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) {
    return out
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.name.endsWith(".mdx")) {
      out.push(full)
    }
  }

  return out.sort()
}

export function checkLegalPages(root: string): LegalFinding[] {
  const findings: LegalFinding[] = []

  for (const file of walk(path.join(root, LEGAL_DIR))) {
    const content = readFileSync(file, "utf8")
    const relative = path.relative(root, file)

    if (content.includes(TODO_MARKER)) {
      findings.push({ file: relative, reason: `legal ${TODO_MARKER} left` })
    } else if (DRAFT_FRONTMATTER.test(content)) {
      findings.push({ file: relative, reason: "still marked draft" })
    } else if (PLACEHOLDER.test(content)) {
      findings.push({ file: relative, reason: "placeholder left" })
    }
  }

  return findings
}

/** The legal pages bind people: a page that is not finished never reaches production. */
export function legalGuard() {
  return {
    name: "pupitre:legal-guard",
    hooks: {
      "astro:build:start": ({
        logger,
      }: {
        logger: { warn: (m: string) => void }
      }) => {
        const findings = checkLegalPages(process.cwd())

        if (findings.length === 0) {
          return
        }

        const summary = findings
          .map((finding) => `${finding.file}: ${finding.reason}`)
          .join("\n")

        if (isProduction()) {
          throw new Error(`Legal pages are not ready to publish:\n${summary}`)
        }

        logger.warn(`Legal pages are not ready to publish:\n${summary}`)
      },
    },
  }
}
