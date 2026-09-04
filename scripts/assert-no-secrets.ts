import { existsSync, readFileSync } from "node:fs"

interface TPattern {
  kind: string
  regex: RegExp
  entropy?: boolean
  keyMaterial?: boolean
}

const PATTERNS: TPattern[] = [
  {
    kind: "private key",
    regex: /^\s*-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,
  },
  {
    kind: "Stripe secret key",
    regex: /\b[sr]k_(?:live|test)_[0-9a-zA-Z]{16,}/,
  },
  { kind: "Stripe webhook secret", regex: /\bwhsec_[0-9a-zA-Z]{16,}/ },
  { kind: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { kind: "GitHub token", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { kind: "AWS access key id", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: "Slack token", regex: /\bxox[abprs]-[0-9A-Za-z-]{10,}/ },
  { kind: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}/ },
  { kind: "Anthropic API key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { kind: "OpenAI API key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  {
    kind: "JSON Web Token",
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    kind: "database URL with password",
    regex:
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s/]+:([^@\s]{8,})@/,
  },
  {
    kind: "credential assigned in source",
    regex:
      /(?:api[_-]?key|secret|token|password|passwd)\w*\s*[:=]\s*["'`]([A-Za-z0-9_\-/+=.]{24,})["'`]/i,
    entropy: true,
  },
  {
    kind: "credential assigned in an env file",
    regex:
      /^\s*(?:export\s+)?[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD)[A-Z0-9_]*\s*=\s*["']?([A-Za-z0-9_\-/+=.]{24,})/,
    entropy: true,
  },
]

const LETTER_RE = /[A-Za-z]/
const DIGIT_RE = /\d/
const HEADER_AT_LINE_START_RE = /^\s*-----BEGIN/
const KEY_MATERIAL_LINE_RE = /^[A-Za-z0-9+/=]{20,}/

export interface TSecretFinding {
  file: string
  line: number
  kind: string
}

function looksRandom(value: string): boolean {
  return LETTER_RE.test(value) && DIGIT_RE.test(value)
}

function matches(pattern: TPattern, line: string, nextLine: string): boolean {
  const match = line.match(pattern.regex)
  if (!match) {
    return false
  }

  if (pattern.keyMaterial) {
    return (
      HEADER_AT_LINE_START_RE.test(line) ||
      KEY_MATERIAL_LINE_RE.test(nextLine.trim())
    )
  }

  return pattern.entropy ? looksRandom(match[1] ?? "") : true
}

export function findSecrets(content: string, file: string): TSecretFinding[] {
  if (content.includes("\0")) {
    return []
  }

  const findings: TSecretFinding[] = []

  const lines = content.split("\n")

  lines.forEach((line, index) => {
    for (const pattern of PATTERNS) {
      if (matches(pattern, line, lines[index + 1] ?? "")) {
        findings.push({ file, line: index + 1, kind: pattern.kind })
      }
    }
  })

  return findings
}

function main(files: string[]): void {
  const findings = files
    .filter((file) => existsSync(file))
    .flatMap((file) => findSecrets(readFileSync(file, "utf8"), file))

  if (findings.length === 0) {
    return
  }

  process.stderr.write("Secret-like strings found, commit refused:\n")
  for (const finding of findings) {
    process.stderr.write(`- ${finding.file}:${finding.line}: ${finding.kind}\n`)
  }
  process.stderr.write(
    "Keep secrets in .env.local (ignored) or in Wrangler secrets, never in the repository.\n"
  )
  process.exit(1)
}

if (import.meta.main) {
  main(process.argv.slice(2))
}
