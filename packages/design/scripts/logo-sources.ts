import type { ModuleId } from "@pupitre/shared/catalog"

interface LogoSource {
  id: ModuleId
  slug: string
  // Published black by Simple Icons: it takes `currentColor` and follows the theme.
  monochrome: boolean
}

export const SOURCES: readonly LogoSource[] = [
  { id: "runtime.node", slug: "nodedotjs", monochrome: false },
  { id: "runtime.python", slug: "python", monochrome: false },
  { id: "db.mysql", slug: "mysql", monochrome: false },
  { id: "db.postgres", slug: "postgresql", monochrome: false },
  { id: "db.mongodb", slug: "mongodb", monochrome: false },
  { id: "ai.claude", slug: "claudecode", monochrome: false },
  { id: "ai.cursor", slug: "cursor", monochrome: true },
  { id: "ai.gemini", slug: "googlegemini", monochrome: false },
  { id: "ai.copilot", slug: "githubcopilot", monochrome: true },
  { id: "ai.opencode", slug: "opencode", monochrome: true },
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
  { id: "tool.vercel", slug: "vercel", monochrome: true },
  { id: "tool.supabase", slug: "supabase", monochrome: false },
  { id: "tool.stripe", slug: "stripe", monochrome: false },
  { id: "exposure.tailscale", slug: "tailscale", monochrome: true },
  { id: "runtime.rust", slug: "rust", monochrome: true },
]

interface VendorSource {
  id: string
  title: string
  source: string
  monochrome: boolean
  // A brand the catalogue does not name: keyed in `MARKS`, filed as `mark-<id>`.
  mark?: boolean
  // When this file was taken from the source, if not on the sweep date.
  retrieved?: string
}

// Committed so the build stays offline; unlike Simple Icons, not under the CC0 licence.
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
    id: "db.mailpit",
    title: "Mailpit",
    source:
      "https://github.com/axllent/mailpit/blob/56999e97e220fa20f294cd2c51de404bfa5e67c0/server/ui/mailpit.svg",
    monochrome: false,
    retrieved: "2026-09-13",
  },
  {
    id: "ai.openclaw",
    title: "OpenClaw",
    source: "https://svgl.app/library/openclaw.svg",
    monochrome: false,
    retrieved: "2026-09-13",
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

export const EXEMPTIONS: Readonly<Partial<Record<ModuleId, string>>> = {
  "core.system": "Socle système : aucun produit de marque à nommer.",
  "core.hardening":
    "Durcissement du système : aucun produit de marque à nommer.",
}
