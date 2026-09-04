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
  { id: "runtime.java", slug: "openjdk", monochrome: true },
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
]

/** A module with no logo, and why. Inlined into the generated `src/logos/index.ts`. */
export const EXEMPTIONS: Readonly<Partial<Record<ModuleId, string>>> = {
  "core.system": "Socle système : aucun produit de marque à nommer.",
  "core.hardening":
    "Durcissement du système : aucun produit de marque à nommer.",
  "exposure.ssh":
    "OpenSSH ne publie pas de marque figurative et ne figure pas dans Simple Icons.",
  "ai.codex":
    "OpenAI a été retiré de Simple Icons et son kit de marque n'est pas redistribuable.",
  "ai.hermes":
    "Nous Research ne publie pas de kit de marque ; le « Hermes » de Simple Icons est le moteur JavaScript de Meta, une autre marque.",
  "editor.vscode":
    "Les marques Microsoft ont été retirées de Simple Icons et le kit Visual Studio Code n'est pas sous licence libre.",
}
