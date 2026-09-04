import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const IMPORT_RE =
  /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g

const IMPORT_STATEMENT_RE =
  /\bimport\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g

const SOURCE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/
const APP_DIR_RE = /^apps\/([^/]+)\//
const APP_PACKAGE_RE = /^@pupitre\/(site|web|desktop|agent)(\/|$)/
const WORKSPACE_PACKAGE_RE = /^@pupitre\//
const API_PRIVATE_IMPORT_RE = /^@pupitre\/api\/lib(\/|$)/
const NAMED_BINDINGS_RE = /\{([\s\S]*)\}/

const NODE_PRISMA_ENTRYPOINTS = new Set([
  "@pupitre/db/client",
  "@pupitre/db/enums",
  "@pupitre/db/models",
])

const EDGE_SOURCE_ROOTS = ["packages/api/src", "apps/web/src"]

const AGENT_APP = "agent"
const API_PACKAGE_DIR = "packages/api/"

export interface TFinding {
  file: string
  spec: string
  reason: string
}

interface TSource {
  file: string
  rel: string
  content: string
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) {
    return out
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue
    }

    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (SOURCE_FILE_RE.test(entry.name)) {
      out.push(full)
    }
  }

  return out
}

function sourceFiles(root: string, dir: string): TSource[] {
  return walk(path.join(root, dir))
    .filter((file) => !file.endsWith(".d.ts"))
    .map((file) => ({
      file,
      rel: path.relative(root, file),
      content: readFileSync(file, "utf8"),
    }))
}

function isTestOrTooling(rel: string): boolean {
  return (
    rel.includes("__tests__/") ||
    rel.includes("/testing/") ||
    rel.includes("/scripts/") ||
    TEST_FILE_RE.test(rel)
  )
}

function appOf(rel: string): string | null {
  const match = rel.match(APP_DIR_RE)
  return match ? match[1] : null
}

function importedSpecs(content: string): string[] {
  const specs: string[] = []

  for (const match of content.matchAll(IMPORT_RE)) {
    const spec = match[1] ?? match[2]
    if (spec) {
      specs.push(spec)
    }
  }

  return specs
}

function resolveRelative(root: string, file: string, spec: string): string {
  const resolved = path.resolve(path.dirname(file), spec)
  return path.relative(root, resolved)
}

function reachesDirectory(resolvedRel: string, dir: string): boolean {
  return resolvedRel === dir || resolvedRel.startsWith(`${dir}${path.sep}`)
}

function classifyPackageImport(
  root: string,
  spec: string,
  file: string
): string | null {
  const appMatch = spec.match(APP_PACKAGE_RE)
  if (appMatch) {
    return `imports the application \`apps/${appMatch[1]}\``
  }

  if (spec.startsWith("@/")) {
    return "uses an application `@/` path alias"
  }

  if (
    spec.startsWith(".") &&
    reachesDirectory(resolveRelative(root, file, spec), "apps")
  ) {
    return "reaches into apps/ via a relative path"
  }

  return null
}

function classifyCrossApp(
  root: string,
  spec: string,
  file: string,
  owner: string
): string | null {
  const packageMatch = spec.match(APP_PACKAGE_RE)
  if (packageMatch && packageMatch[1] !== owner) {
    return `imports the sibling app \`apps/${packageMatch[1]}\``
  }

  if (spec.startsWith(".")) {
    const target = appOf(`${resolveRelative(root, file, spec)}/`)
    if (target && target !== owner) {
      return `reaches into \`apps/${target}\` via a relative path`
    }
  }

  return null
}

function classifyAgentImport(
  root: string,
  spec: string,
  file: string
): string | null {
  if (WORKSPACE_PACKAGE_RE.test(spec)) {
    return "imports a TypeScript package from `apps/agent` — consume the exported JSON Schema instead"
  }

  if (
    spec.startsWith(".") &&
    reachesDirectory(resolveRelative(root, file, spec), "packages")
  ) {
    return "reaches into `packages/` from `apps/agent` — consume the exported JSON Schema instead"
  }

  return null
}

function isEdgeSource(rel: string): boolean {
  return EDGE_SOURCE_ROOTS.some((dir) => rel.startsWith(`${dir}/`))
}

function isTypeOnlyImport(
  typeKeyword: string | undefined,
  clause: string
): boolean {
  if (typeKeyword) {
    return true
  }

  const named = clause.match(NAMED_BINDINGS_RE)
  if (!named) {
    return false
  }

  const bindings = named[1]
    .split(",")
    .map((binding) => binding.trim())
    .filter(Boolean)

  return bindings.length > 0 && bindings.every((b) => b.startsWith("type "))
}

function collectNodePrismaValueImports(
  source: TSource,
  findings: TFinding[]
): void {
  if (!isEdgeSource(source.rel) || isTestOrTooling(source.rel)) {
    return
  }

  for (const match of source.content.matchAll(IMPORT_STATEMENT_RE)) {
    const spec = match[3]
    if (
      !NODE_PRISMA_ENTRYPOINTS.has(spec) ||
      isTypeOnlyImport(match[1], match[2])
    ) {
      continue
    }

    const edgeSpec = spec.replace("@pupitre/db/", "@pupitre/db/cloudflare/")
    findings.push({
      file: source.rel,
      spec,
      reason: `bundles the Node Prisma client into edge code — import \`${edgeSpec}\` instead (or make it \`import type\`)`,
    })
  }
}

function collectApiPrivateImports(
  source: TSource,
  spec: string,
  findings: TFinding[]
): void {
  if (
    source.rel.startsWith(API_PACKAGE_DIR) ||
    !API_PRIVATE_IMPORT_RE.test(spec)
  ) {
    return
  }

  findings.push({
    file: source.rel,
    spec,
    reason:
      "deep-imports `@pupitre/api/lib` — use `./server`, `./client` or `./testing`",
  })
}

function collectPackageFindings(root: string, findings: TFinding[]): void {
  for (const source of sourceFiles(root, "packages")) {
    collectNodePrismaValueImports(source, findings)

    for (const spec of importedSpecs(source.content)) {
      const reason = classifyPackageImport(root, spec, source.file)
      if (reason) {
        findings.push({ file: source.rel, spec, reason })
      }

      collectApiPrivateImports(source, spec, findings)
    }
  }
}

function collectAppFindings(root: string, findings: TFinding[]): void {
  for (const source of sourceFiles(root, "apps")) {
    const owner = appOf(source.rel)
    if (!owner) {
      continue
    }

    collectNodePrismaValueImports(source, findings)

    for (const spec of importedSpecs(source.content)) {
      const reason =
        owner === AGENT_APP
          ? classifyAgentImport(root, spec, source.file)
          : classifyCrossApp(root, spec, source.file, owner)

      if (reason) {
        findings.push({ file: source.rel, spec, reason })
      }

      collectApiPrivateImports(source, spec, findings)
    }
  }
}

export function collectFindings(root: string): TFinding[] {
  const findings: TFinding[] = []

  collectPackageFindings(root, findings)
  collectAppFindings(root, findings)

  return findings
}

function main(): void {
  const findings = collectFindings(process.cwd())

  if (findings.length > 0) {
    process.stderr.write("Package boundary guard failed:\n")
    for (const finding of findings) {
      process.stderr.write(
        `- ${finding.file}: "${finding.spec}" ${finding.reason}\n`
      )
    }
    process.exit(1)
  }

  process.stdout.write("Package boundaries OK.\n")
}

if (import.meta.main) {
  main()
}
