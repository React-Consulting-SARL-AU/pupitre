import type {
  CatalogResult,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import type { Manifest, Preset } from "@pupitre/shared/catalog";

/**
 * Two catalogues, as two agents would answer them.
 *
 * They are written here rather than derived from the contract on purpose: the
 * app must render whatever the agent declares, so a test that read the app's
 * own list would prove nothing. The second catalogue is the first plus a module
 * this codebase has never heard of.
 */

const BOTH = ["amd64", "arm64"] as const;

export const CORE_SYSTEM: Manifest = {
  id: "core.system",
  category: "core",
  name: "Socle système",
  summary:
    "Paquets de base, fuseau, mises à jour de sécurité, utilisateur dev, identité git.",
  requires: [],
  conflicts: [],
  resources: { ram_mb: 256, disk_mb: 1200 },
  arch: [...BOTH],
  fields: [
    {
      key: "timezone",
      kind: "select",
      label: "Fuseau horaire",
      required: true,
      default: "Europe/Paris",
      options: ["Europe/Paris", "UTC", "Africa/Casablanca"],
    },
    {
      key: "git_name",
      kind: "text",
      label: "Nom git",
      help: "Ce que les commits porteront comme auteur.",
      required: true,
    },
    { key: "git_email", kind: "text", label: "Adresse git", required: true },
    {
      key: "projects_dir",
      kind: "text",
      label: "Dossier des projets",
      required: true,
      default: "/home/dev/projects",
    },
  ],
  provides: ["system"],
  mandatory: true,
  since: "0.1.0",
};

export const CORE_HARDENING: Manifest = {
  id: "core.hardening",
  category: "core",
  name: "Durcissement",
  summary: "ufw, fail2ban, root fermé une fois qu'une clé ouvre dev.",
  requires: ["core.system"],
  conflicts: [],
  resources: { ram_mb: 64, disk_mb: 50 },
  arch: [...BOTH],
  fields: [
    {
      key: "ssh_443",
      kind: "boolean",
      label: "Écouter aussi SSH sur 443",
      help: "Utile derrière un réseau qui filtre le port 22.",
      required: false,
      default: false,
    },
  ],
  provides: ["hardening"],
  mandatory: true,
  since: "0.1.0",
};

export const RUNTIME_JAVA: Manifest = {
  id: "runtime.java",
  category: "runtime",
  name: "Java",
  summary: "Temurin par mise, daemon Gradle dimensionné pour la mémoire.",
  requires: ["core.system"],
  conflicts: [],
  resources: { ram_mb: 512, disk_mb: 900 },
  arch: [...BOTH],
  fields: [
    {
      key: "java_version",
      kind: "version",
      label: "Version de Java",
      options: ["21", "17"],
      default: "21",
    },
  ],
  provides: ["runtime:java"],
  mandatory: false,
  since: "0.1.0",
};

export const RUNTIME_NODE: Manifest = {
  id: "runtime.node",
  category: "runtime",
  name: "Node.js",
  summary: "mise, Node, Bun et pnpm, activés dans tous les shells.",
  requires: ["core.system"],
  conflicts: [],
  resources: { ram_mb: 256, disk_mb: 700 },
  arch: [...BOTH],
  fields: [
    {
      key: "node_version",
      kind: "version",
      label: "Version de Node",
      options: ["24", "22"],
      default: "24",
    },
    {
      key: "bun",
      kind: "boolean",
      label: "Installer Bun",
      required: false,
      default: true,
    },
  ],
  provides: ["runtime:node"],
  mandatory: false,
  since: "0.1.0",
};

export const DB_POSTGRES: Manifest = {
  id: "db.postgres",
  category: "database",
  name: "PostgreSQL 17",
  summary: "Local seulement, rôles applicatif et distant, import de dumps.",
  requires: ["core.system"],
  conflicts: [],
  resources: { ram_mb: 1024, disk_mb: 900 },
  arch: [...BOTH],
  fields: [
    {
      key: "app_password",
      kind: "secret",
      label: "Mot de passe applicatif",
      required: true,
      generate: true,
    },
    {
      key: "remote_password",
      kind: "secret",
      label: "Mot de passe distant",
      help: "Pour le client de bureau, à travers la session SSH.",
      required: true,
      generate: true,
    },
  ],
  provides: ["db:postgres"],
  mandatory: false,
  since: "0.1.0",
};

export const DB_MYSQL: Manifest = {
  id: "db.mysql",
  category: "database",
  name: "MySQL 8",
  summary: "Lié à 127.0.0.1, comptes applicatif et distant, import de dumps.",
  requires: ["core.system"],
  conflicts: [],
  resources: { ram_mb: 768, disk_mb: 800 },
  arch: [...BOTH],
  fields: [
    {
      key: "engine",
      kind: "select",
      label: "Moteur",
      required: true,
      default: "mysql",
      options: ["mysql", "mariadb"],
    },
    {
      key: "buffer_pool",
      kind: "number",
      label: "Buffer pool (Mo)",
      required: false,
      default: 512,
    },
    {
      key: "app_password",
      kind: "secret",
      label: "Mot de passe applicatif",
      required: true,
      generate: true,
    },
  ],
  provides: ["db:mysql"],
  mandatory: false,
  since: "0.1.0",
};

/**
 * A database the presets never mention: what a reader adds to a server that is
 * already running, long after the onboarding.
 */
export const DB_MONGODB: Manifest = {
  id: "db.mongodb",
  category: "database",
  name: "MongoDB 8",
  summary: "Local seulement, utilisateur applicatif, import de mongodump.",
  requires: ["core.system"],
  conflicts: [],
  resources: { ram_mb: 512, disk_mb: 700 },
  arch: [...BOTH],
  fields: [
    {
      key: "app_password",
      kind: "secret",
      label: "Mot de passe applicatif",
      required: true,
      generate: true,
    },
  ],
  provides: ["db:mongodb"],
  mandatory: false,
  since: "0.1.0",
};

export const EDITOR_JETBRAINS: Manifest = {
  id: "editor.jetbrains",
  category: "editor",
  name: "JetBrains Gateway",
  summary: "Backend distant préinstallé, JVM dimensionnée, ouverture directe.",
  requires: ["runtime.java"],
  conflicts: [],
  resources: { ram_mb: 3072, disk_mb: 4000 },
  arch: [...BOTH],
  fields: [
    {
      key: "ide",
      kind: "select",
      label: "IDE",
      required: true,
      default: "idea",
      options: ["idea", "webstorm", "pycharm", "phpstorm", "goland"],
    },
    {
      key: "version",
      kind: "version",
      label: "Version",
      options: ["2026.2", "2026.1"],
      default: "2026.2",
    },
  ],
  provides: ["editor:jetbrains"],
  mandatory: false,
  since: "0.1.0",
};

export const EDITOR_VSCODE: Manifest = {
  id: "editor.vscode",
  category: "editor",
  name: "VS Code Remote",
  summary: "CLI et serveur distant préinstallés, extensions de base.",
  requires: ["core.system"],
  conflicts: [],
  resources: { ram_mb: 512, disk_mb: 600 },
  arch: [...BOTH],
  fields: [
    {
      key: "extensions",
      kind: "list",
      label: "Extensions",
      help: "Un identifiant par ligne, tel que le marketplace le nomme.",
      required: false,
      items: "text",
      min: 0,
      max: 8,
    },
    {
      key: "tunnel",
      kind: "boolean",
      label: "Activer Remote Tunnel",
      required: false,
      default: false,
    },
  ],
  provides: ["editor:vscode"],
  mandatory: false,
  since: "0.1.0",
};

export const AI_HERMES: Manifest = {
  id: "ai.hermes",
  category: "ai",
  name: "Hermes Agent",
  summary: "Agent Python, fournisseurs de modèles, service systemd optionnel.",
  requires: ["core.system"],
  conflicts: [],
  resources: { ram_mb: 512, disk_mb: 1500 },
  arch: [...BOTH],
  fields: [
    {
      key: "providers",
      kind: "list",
      label: "Clés des fournisseurs",
      required: true,
      items: "secret",
      min: 1,
      max: 3,
    },
    {
      key: "always_on",
      kind: "boolean",
      label: "Garder l'agent actif",
      required: false,
      default: false,
    },
  ],
  provides: ["agent:hermes"],
  mandatory: false,
  since: "0.1.0",
};

export const EXPOSURE_CLOUDFLARE: Manifest = {
  id: "exposure.cloudflare",
  category: "exposure",
  name: "Cloudflare Tunnel",
  summary: "Un tunnel, une route par projet, DNS et certificat gérés.",
  requires: ["core.system"],
  conflicts: ["exposure.caddy"],
  resources: { ram_mb: 128, disk_mb: 120 },
  arch: [...BOTH],
  fields: [
    {
      key: "api_token",
      kind: "secret",
      label: "Jeton d'API",
      required: true,
    },
    { key: "zone_name", kind: "text", label: "Zone", required: true },
  ],
  provides: ["exposure:public"],
  mandatory: false,
  since: "0.1.0",
};

export const EXPOSURE_CADDY: Manifest = {
  id: "exposure.caddy",
  category: "exposure",
  name: "Caddy",
  summary: "Reverse proxy et certificats automatiques pour un domaine à soi.",
  requires: ["core.system"],
  conflicts: ["exposure.cloudflare"],
  resources: { ram_mb: 128, disk_mb: 100 },
  arch: [...BOTH],
  fields: [{ key: "domain", kind: "text", label: "Domaine", required: true }],
  provides: ["exposure:public"],
  mandatory: false,
  since: "0.1.0",
};

/** Only amd64: the arm64 machines have nothing to run it. */
export const TOOL_LEGACY: Manifest = {
  id: "tool.legacy",
  category: "tool",
  name: "Outil hérité",
  summary: "Binaire propriétaire livré pour amd64 seulement.",
  requires: ["core.system"],
  conflicts: [],
  resources: { ram_mb: 64, disk_mb: 200 },
  arch: ["amd64"],
  fields: [],
  provides: ["tool:legacy"],
  mandatory: false,
  since: "0.2.0",
};

const PRESETS: Preset[] = [
  {
    id: "web-js",
    name: "Web JavaScript",
    modules: [
      "core.system",
      "core.hardening",
      "runtime.node",
      "db.mysql",
      "editor.vscode",
    ],
  },
  {
    id: "full",
    name: "Tout le catalogue",
    modules: [
      "core.system",
      "core.hardening",
      "runtime.node",
      "runtime.java",
      "db.mysql",
      "db.postgres",
      "editor.jetbrains",
      "editor.vscode",
      "ai.hermes",
      "exposure.cloudflare",
    ],
  },
  {
    id: "minimal",
    name: "Minimal",
    modules: ["core.system", "core.hardening"],
  },
];

export const CATALOG: CatalogResult = {
  modules: [
    CORE_SYSTEM,
    CORE_HARDENING,
    RUNTIME_NODE,
    RUNTIME_JAVA,
    DB_MYSQL,
    DB_POSTGRES,
    AI_HERMES,
    EDITOR_JETBRAINS,
    EDITOR_VSCODE,
    EXPOSURE_CLOUDFLARE,
    EXPOSURE_CADDY,
    TOOL_LEGACY,
  ],
  presets: PRESETS,
};

/**
 * A module no line of this codebase knows about, added by a newer agent. If the
 * screen shows it, nothing about the catalogue is written in the app.
 */
export const DB_CLICKHOUSE: Manifest = {
  id: "db.clickhouse",
  category: "database",
  name: "ClickHouse",
  summary: "Base analytique en colonnes, locale, pour les tableaux de bord.",
  requires: ["core.system"],
  conflicts: [],
  resources: { ram_mb: 2048, disk_mb: 2500 },
  arch: [...BOTH],
  fields: [
    {
      key: "app_password",
      kind: "secret",
      label: "Mot de passe applicatif",
      required: true,
      generate: true,
    },
  ],
  provides: ["db:clickhouse"],
  mandatory: false,
  since: "0.5.0",
};

export const CATALOG_NEXT: CatalogResult = {
  modules: [...CATALOG.modules, DB_CLICKHOUSE],
  presets: PRESETS,
};

const UBUNTU = {
  os: "ubuntu",
  version: "24.04",
  sudo: true,
  ports: [{ port: 22, process: "sshd" }],
  docker: false,
  panel: null,
  agent_version: null,
  installed_modules: [] as string[],
  verdict: {
    level: "ready" as const,
    kind: "bare" as const,
    reasons: [],
    fixes: [],
  },
};

/** Four gigabytes, the smallest machine the probe still calls ready. */
export const SMALL_MACHINE: ProbeResult = {
  ...UBUNTU,
  arch: "amd64",
  ram_mb: 4096,
  disk_free_gb: 38.4,
};

export const LARGE_MACHINE: ProbeResult = {
  ...UBUNTU,
  arch: "amd64",
  ram_mb: 32_768,
  disk_free_gb: 240,
};

/** Room in memory, none on disk. */
export const FULL_DISK_MACHINE: ProbeResult = {
  ...UBUNTU,
  arch: "amd64",
  ram_mb: 32_768,
  disk_free_gb: 3.5,
};

export const ARM_MACHINE: ProbeResult = {
  ...UBUNTU,
  arch: "arm64",
  ram_mb: 16_384,
  disk_free_gb: 120,
};
