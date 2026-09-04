import type { ModuleCategory, ModuleId } from "@pupitre/shared/catalog"
import type { Localized } from "../../lib/i18n"

export type Availability = "mvp" | "later"

export interface CatalogEntry {
  id: ModuleId
  availability: Availability
  name: Localized
  detail: Localized
}

export interface CatalogGroup {
  id: ModuleCategory
  label: Localized
  note?: Localized
  entries: CatalogEntry[]
}

export const AVAILABILITY_LABELS: Record<Availability, Localized> = {
  mvp: { en: "Available", fr: "Disponible" },
  later: { en: "Soon", fr: "Bientôt" },
}

export const CATALOG: CatalogGroup[] = [
  {
    id: "core",
    label: { en: "Base", fr: "Socle" },
    note: { en: "Required", fr: "Obligatoire" },
    entries: [
      {
        id: "core.system",
        availability: "mvp",
        name: { en: "System", fr: "Système" },
        detail: {
          en: "Base packages, sized swap, memory guard, a dev user with sudo, tmux, zsh, git identity.",
          fr: "Paquets de base, swap dimensionné, garde-fou mémoire, utilisateur dev avec sudo, tmux, zsh, identité git.",
        },
      },
      {
        id: "core.hardening",
        availability: "mvp",
        name: { en: "Hardening", fr: "Durcissement" },
        detail: {
          en: "ufw on SSH only, fail2ban, root closed and passwords off once a key opens dev.",
          fr: "ufw sur SSH seul, fail2ban, root fermé et mots de passe désactivés une fois qu’une clé ouvre dev.",
        },
      },
    ],
  },
  {
    id: "runtime",
    label: { en: "Runtimes", fr: "Runtimes" },
    entries: [
      {
        id: "runtime.node",
        availability: "mvp",
        name: { en: "Node.js", fr: "Node.js" },
        detail: {
          en: "Node, Bun and pnpm through mise, at the versions you choose, in every shell.",
          fr: "Node, Bun et pnpm via mise, aux versions choisies, dans tous les shells.",
        },
      },
      {
        id: "runtime.java",
        availability: "mvp",
        name: { en: "Java", fr: "Java" },
        detail: {
          en: "Temurin through mise, Gradle daemon sized for the RAM.",
          fr: "Temurin via mise, daemon Gradle dimensionné pour la RAM.",
        },
      },
      {
        id: "runtime.python",
        availability: "mvp",
        name: { en: "Python", fr: "Python" },
        detail: {
          en: "uv and one Python version.",
          fr: "uv et une version de Python.",
        },
      },
      {
        id: "runtime.go",
        availability: "later",
        name: { en: "Go", fr: "Go" },
        detail: { en: "Through mise.", fr: "Via mise." },
      },
      {
        id: "runtime.php",
        availability: "later",
        name: { en: "PHP", fr: "PHP" },
        detail: { en: "Through mise.", fr: "Via mise." },
      },
      {
        id: "runtime.ruby",
        availability: "later",
        name: { en: "Ruby", fr: "Ruby" },
        detail: { en: "Through mise.", fr: "Via mise." },
      },
      {
        id: "runtime.docker",
        availability: "later",
        name: { en: "Docker", fr: "Docker" },
        detail: {
          en: "Docker Engine and Compose, dev in the group.",
          fr: "Docker Engine et Compose, dev dans le groupe.",
        },
      },
    ],
  },
  {
    id: "database",
    label: { en: "Databases", fr: "Bases de données" },
    entries: [
      {
        id: "db.mysql",
        availability: "mvp",
        name: { en: "MySQL 8 or MariaDB", fr: "MySQL 8 ou MariaDB" },
        detail: {
          en: "Bound to 127.0.0.1, app and remote accounts through SSH, dumps in ~/dumps/ imported for you.",
          fr: "Lié à 127.0.0.1, comptes applicatif et distant à travers SSH, dumps déposés dans ~/dumps/ importés pour vous.",
        },
      },
      {
        id: "db.postgres",
        availability: "mvp",
        name: { en: "PostgreSQL 17", fr: "PostgreSQL 17" },
        detail: {
          en: "Local only, app and remote roles, common extensions, dump import.",
          fr: "Local seulement, rôles applicatif et distant, extensions courantes, import de dumps.",
        },
      },
      {
        id: "db.mongodb",
        availability: "mvp",
        name: { en: "MongoDB 8", fr: "MongoDB 8" },
        detail: {
          en: "Local only, app user, mongodump import.",
          fr: "Local seulement, utilisateur applicatif, import de mongodump.",
        },
      },
      {
        id: "db.redis",
        availability: "later",
        name: { en: "Redis", fr: "Redis" },
        detail: {
          en: "Local only, password, persistence.",
          fr: "Local seulement, mot de passe, persistance.",
        },
      },
    ],
  },
  {
    id: "ai",
    label: { en: "AI agents", fr: "Agents IA" },
    entries: [
      {
        id: "ai.claude",
        availability: "mvp",
        name: { en: "Claude Code", fr: "Claude Code" },
        detail: {
          en: "Sign in with the URL shown in the app terminal, project context, Pupitre skills.",
          fr: "Connexion par l’URL affichée dans le terminal de l’app, contexte du projet, skills Pupitre.",
        },
      },
      {
        id: "ai.codex",
        availability: "mvp",
        name: { en: "Codex", fr: "Codex" },
        detail: {
          en: "Same mechanism as Claude Code, with your own subscription.",
          fr: "Même mécanisme que Claude Code, avec votre propre abonnement.",
        },
      },
      {
        id: "ai.hermes",
        availability: "mvp",
        name: { en: "Hermes Agent", fr: "Hermes Agent" },
        detail: {
          en: "Nous Research’s agent through Python, model providers configured, a systemd service if always on.",
          fr: "L’agent de Nous Research via Python, fournisseurs de modèles configurés, service systemd si toujours actif.",
        },
      },
      {
        id: "ai.browser",
        availability: "mvp",
        name: { en: "Headless Chrome", fr: "Chrome headless" },
        detail: {
          en: "Playwright dependencies, a capture command that files images in the gallery.",
          fr: "Dépendances Playwright, commande de capture qui range les images dans la galerie.",
        },
      },
    ],
  },
  {
    id: "editor",
    label: { en: "Remote editors", fr: "Éditeurs distants" },
    entries: [
      {
        id: "editor.jetbrains",
        availability: "mvp",
        name: { en: "JetBrains Gateway", fr: "JetBrains Gateway" },
        detail: {
          en: "Remote backend preinstalled for IntelliJ IDEA, WebStorm, PyCharm, PhpStorm or GoLand, JVM sized, your licence.",
          fr: "Backend distant préinstallé pour IntelliJ IDEA, WebStorm, PyCharm, PhpStorm ou GoLand, JVM dimensionnée, votre licence.",
        },
      },
      {
        id: "editor.vscode",
        availability: "mvp",
        name: { en: "VS Code Remote SSH", fr: "VS Code Remote SSH" },
        detail: {
          en: "code CLI and remote server preinstalled so the first connection is immediate; same for Cursor and Windsurf.",
          fr: "CLI code et serveur distant préinstallés pour que la première connexion soit immédiate ; idem pour Cursor et Windsurf.",
        },
      },
      {
        id: "editor.zed",
        availability: "mvp",
        name: { en: "Zed", fr: "Zed" },
        detail: {
          en: "Remote server preinstalled for your version, opened through zed://ssh.",
          fr: "Serveur distant préinstallé pour votre version, ouverture par zed://ssh.",
        },
      },
    ],
  },
  {
    id: "exposure",
    label: { en: "Exposure", fr: "Exposition" },
    entries: [
      {
        id: "exposure.cloudflare",
        availability: "mvp",
        name: { en: "Cloudflare Tunnel", fr: "Cloudflare Tunnel" },
        detail: {
          en: "One tunnel, one route per project, DNS and certificate managed.",
          fr: "Un tunnel, une route par projet, DNS et certificat gérés.",
        },
      },
      {
        id: "exposure.ssh",
        availability: "mvp",
        name: { en: "SSH only", fr: "SSH seul" },
        detail: {
          en: "No public exposure: each project on its port, through the SSH session the app holds.",
          fr: "Sans exposition publique : chaque projet sur son port, à travers la session SSH que l’app tient.",
        },
      },
      {
        id: "exposure.caddy",
        availability: "later",
        name: { en: "Caddy", fr: "Caddy" },
        detail: {
          en: "Reverse proxy with automatic certificates for a domain outside Cloudflare.",
          fr: "Reverse proxy avec certificats automatiques pour un domaine hors Cloudflare.",
        },
      },
    ],
  },
  {
    id: "tool",
    label: { en: "Tools", fr: "Outils" },
    entries: [
      {
        id: "tool.github",
        availability: "mvp",
        name: { en: "GitHub", fr: "GitHub" },
        detail: {
          en: "gh, HTTPS clone without a key, the server’s key registered on your account.",
          fr: "gh, clone HTTPS sans clé, clé du serveur enregistrée sur votre compte.",
        },
      },
      {
        id: "tool.1password",
        availability: "mvp",
        name: { en: "1Password", fr: "1Password" },
        detail: {
          en: "CLI and service account, .env.local generated from the templates in your repositories.",
          fr: "CLI et compte de service, .env.local générés depuis les gabarits de vos dépôts.",
        },
      },
      {
        id: "tool.neon",
        availability: "later",
        name: { en: "Neon", fr: "Neon" },
        detail: {
          en: "One branch per project that declares it.",
          fr: "Une branche par projet qui le déclare.",
        },
      },
    ],
  },
]

export const CATALOG_ENTRIES: CatalogEntry[] = CATALOG.flatMap(
  (group) => group.entries
)
