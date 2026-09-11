import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import {
  isIncorporated,
  isPublicStage,
  LEGAL_ENTITY,
  type LegalEntity,
  PROJECT_STAGE,
  type ProjectStage,
} from "@pupitre/shared/legal"

export const LEGAL_DIR = "src/content/legal"

const TODO_MARKER = "TODO"

const DRAFT_FRONTMATTER = /^draft:\s*true\s*$/m

/** A bracket that doesn't open a Markdown link: information still missing. */
const PLACEHOLDER = /\[[^\]\n]+\](?!\()/

export interface LegalFinding {
  file: string
  reason: string
}

export interface LegalStage {
  stage?: ProjectStage
  entity?: LegalEntity
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

export function legalDrafts(root: string): string[] {
  return walk(path.join(root, LEGAL_DIR))
    .filter((file) => DRAFT_FRONTMATTER.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(root, file))
}

export function checkLegalDrafts(
  root: string,
  { stage = PROJECT_STAGE, entity = LEGAL_ENTITY }: LegalStage = {}
): LegalFinding[] {
  const findings: LegalFinding[] = []
  const open = isPublicStage(stage)

  if (open && !isIncorporated(entity)) {
    findings.push({
      file: "@pupitre/shared/legal",
      reason: "project opened while the publisher is not incorporated",
    })
  }

  for (const file of walk(path.join(root, LEGAL_DIR))) {
    const content = readFileSync(file, "utf8")
    const relative = path.relative(root, file)

    if (content.includes(TODO_MARKER)) {
      findings.push({ file: relative, reason: `legal ${TODO_MARKER} left` })
    } else if (open && DRAFT_FRONTMATTER.test(content)) {
      findings.push({ file: relative, reason: "still marked draft" })
    } else if (open && PLACEHOLDER.test(content)) {
      findings.push({ file: relative, reason: "placeholder left" })
    }
  }

  return findings
}

/** A legal `TODO` never ships. A draft does, with its warning, until the project declares itself open — then pages must be signed. */
export function legalGuard() {
  return {
    name: "pupitre:legal-guard",
    hooks: {
      "astro:build:start": ({
        logger,
      }: {
        logger: { warn: (m: string) => void }
      }) => {
        const findings = checkLegalDrafts(process.cwd())

        if (findings.length > 0) {
          const summary = findings
            .map((finding) => `${finding.file}: ${finding.reason}`)
            .join("\n")

          if (isProduction()) {
            throw new Error(`Legal pages are not ready to publish:\n${summary}`)
          }

          logger.warn(`Legal pages are not ready to publish:\n${summary}`)

          return
        }

        const drafts = legalDrafts(process.cwd())

        if (drafts.length > 0) {
          logger.warn(
            `${drafts.length} legal page(s) publish as drafts while the project is in development.`
          )
        }
      },
    },
  }
}
