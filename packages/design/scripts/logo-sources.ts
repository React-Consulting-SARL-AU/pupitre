import type { ModuleId } from "@pupitre/shared/catalog"

export interface LogoSource {
  id: ModuleId
  slug: string
  monochrome: boolean
}

/**
 * A brand keeps its own colour, except where the mark has no chromatic
 * identity: Simple Icons publishes it as black, so it takes `currentColor` and
 * follows the theme like any other ink.
 */
export const SOURCES: readonly LogoSource[] = [
  { id: "runtime.node", slug: "nodedotjs", monochrome: false },
  { id: "runtime.python", slug: "python", monochrome: false },
  { id: "db.mysql", slug: "mysql", monochrome: false },
  { id: "db.postgres", slug: "postgresql", monochrome: false },
  { id: "db.mongodb", slug: "mongodb", monochrome: false },
  { id: "ai.claude", slug: "claudecode", monochrome: false },
  { id: "ai.browser", slug: "googlechrome", monochrome: false },
  { id: "editor.jetbrains", slug: "jetbrains", monochrome: true },
  { id: "editor.zed", slug: "zedindustries", monochrome: true },
  { id: "exposure.cloudflare", slug: "cloudflare", monochrome: false },
  { id: "tool.github", slug: "github", monochrome: true },
  { id: "tool.1password", slug: "1password", monochrome: false },
  { id: "runtime.go", slug: "go", monochrome: false },
  { id: "runtime.php", slug: "php", monochrome: false },
  { id: "runtime.ruby", slug: "ruby", monochrome: false },
  { id: "runtime.docker", slug: "docker", monochrome: false },
  { id: "db.redis", slug: "redis", monochrome: false },
  { id: "exposure.caddy", slug: "caddy", monochrome: false },
  { id: "tool.neon", slug: "neon", monochrome: false },
  { id: "tool.wrangler", slug: "cloudflareworkers", monochrome: false },
]

export interface VendorSource {
  /** Names both the module and the file under `scripts/vendor`. */
  id: string
  title: string
  source: string
  monochrome: boolean
  /** A brand the catalogue does not name: keyed in `MARKS`, filed as `mark-<id>`. */
  mark?: boolean
  /** When this file was taken from the source, if not on the sweep date. */
  retrieved?: string
}

/**
 * A mark Simple Icons does not publish, taken from the brand's own SVG as
 * collected by [svgl](https://svgl.app) and committed under `scripts/vendor`
 * so the build stays offline. Same nominative use as the rest, but the path is
 * not under the CC0 licence the Simple Icons ones are.
 */
export const VENDOR_SOURCES: readonly VendorSource[] = [
  {
    id: "editor.vscode",
    title: "Visual Studio Code",
    source: "https://svgl.app/library/vscode.svg",
    monochrome: false,
  },
  {
    id: "runtime.java",
    title: "Java",
    source: "https://svgl.app/library/java.svg",
    monochrome: false,
  },
  {
    id: "ai.codex",
    title: "Codex",
    source: "https://svgl.app/library/codex_light.svg",
    monochrome: true,
  },
  {
    id: "ai.hermes",
    title: "Nous Research",
    source: "https://lobehub.com/icons/nousresearch",
    monochrome: true,
    retrieved: "2026-09-07",
  },
  {
    id: "bun",
    title: "Bun",
    source: "https://svgl.app/library/bun.svg",
    monochrome: false,
    mark: true,
  },
]

/** A module with no logo, and why. Inlined into the generated `src/logos/index.ts`. */
export const EXEMPTIONS: Readonly<Partial<Record<ModuleId, string>>> = {
  "core.system": "Socle système : aucun produit de marque à nommer.",
  "core.hardening":
    "Durcissement du système : aucun produit de marque à nommer.",
}
