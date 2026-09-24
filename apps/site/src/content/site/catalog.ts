import {
  MANDATORY_MODULE_IDS,
  type ModuleCategory,
  type ModuleId,
} from "@pupitre/shared/catalog"
import type { Localized } from "../../lib/i18n"

export interface CatalogEntry {
  id: ModuleId
  name: Localized
  detail: Localized
}

export interface CatalogGroup {
  id: ModuleCategory
  label: Localized
  entries: CatalogEntry[]
}

export const REQUIRED_LABEL: Localized = { en: "Required", fr: "Obligatoire" }

export function isRequired(id: ModuleId): boolean {
  return (MANDATORY_MODULE_IDS as readonly ModuleId[]).includes(id)
}

export const CATALOG: CatalogGroup[] = [
  {
    id: "core",
    label: { en: "Base", fr: "Socle" },
    entries: [
      {
        id: "core.system",
        name: { en: "System", fr: "Système" },
        detail: {
          en: "Base packages, sized swap, memory guard, a dev user with sudo, zsh, tmux, git identity, the dev command.",
          fr: "Paquets de base, swap dimensionné, garde-fou mémoire, utilisateur dev avec sudo, zsh, tmux, identité git, la commande dev.",
        },
      },
      {
        id: "core.hardening",
        name: { en: "Hardening", fr: "Durcissement" },
        detail: {
          en: "ufw on SSH only, fail2ban, root closed and passwords off once a key opens dev.",
          fr: "ufw sur SSH seul, fail2ban, root fermé et mots de passe désactivés une fois qu’une clé ouvre dev.",
        },
      },
      {
        id: "core.backup",
        name: { en: "Backups", fr: "Sauvegardes" },
        detail: {
          en: "Configuration, secrets, databases and projects, encrypted on the server and sent to your own S3 bucket on the interval you set.",
          fr: "Configuration, secrets, bases et projets, chiffrés sur le serveur et envoyés dans votre propre seau S3 à l’intervalle que vous choisissez.",
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
        name: { en: "Node.js", fr: "Node.js" },
        detail: {
          en: "Node, Bun, pnpm and Yarn through mise, at the versions you choose, in every shell.",
          fr: "Node, Bun, pnpm et Yarn via mise, aux versions choisies, dans tous les shells.",
        },
      },
      {
        id: "runtime.java",
        name: { en: "Java", fr: "Java" },
        detail: {
          en: "Temurin through mise, Gradle daemon sized for the RAM.",
          fr: "Temurin via mise, daemon Gradle dimensionné pour la RAM.",
        },
      },
      {
        id: "runtime.python",
        name: { en: "Python", fr: "Python" },
        detail: {
          en: "uv and the Python version you choose, through mise.",
          fr: "uv et la version de Python choisie, via mise.",
        },
      },
      {
        id: "runtime.go",
        name: { en: "Go", fr: "Go" },
        detail: {
          en: "Go at the version you choose, through mise, with GOPATH and go install binaries on the path.",
          fr: "Go à la version choisie, via mise, avec GOPATH et les binaires de go install sur le PATH.",
        },
      },
      {
        id: "runtime.php",
        name: { en: "PHP", fr: "PHP" },
        detail: {
          en: "PHP at the version you choose, built by mise, Composer optional, memory limit yours.",
          fr: "PHP à la version choisie, compilé par mise, Composer en option, limite mémoire à votre main.",
        },
      },
      {
        id: "runtime.ruby",
        name: { en: "Ruby", fr: "Ruby" },
        detail: {
          en: "Ruby at the version you choose, built by mise, Bundler optional.",
          fr: "Ruby à la version choisie, compilé par mise, Bundler en option.",
        },
      },
      {
        id: "runtime.docker",
        name: { en: "Docker", fr: "Docker" },
        detail: {
          en: "Docker Engine and Compose, dev in the group so no command needs sudo, images where you want them.",
          fr: "Docker Engine et Compose, dev dans le groupe pour qu’aucune commande ne demande sudo, images là où vous voulez.",
        },
      },
      {
        id: "runtime.rust",
        name: { en: "Rust", fr: "Rust" },
        detail: {
          en: "Rust at the chosen version through mise and rustup; cargo, rustc and what cargo install builds on every shell’s path.",
          fr: "Rust à la version choisie par mise et rustup ; cargo, rustc et ce que cargo install construit sur le PATH de tous les shells.",
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
        name: { en: "MySQL or MariaDB", fr: "MySQL ou MariaDB" },
        detail: {
          en: "Bound to 127.0.0.1 on the port you pick, app and remote accounts you name, dumps in ~/dumps imported for you.",
          fr: "Lié à 127.0.0.1 sur le port choisi, comptes applicatif et distant que vous nommez, dumps déposés dans ~/dumps importés pour vous.",
        },
      },
      {
        id: "db.postgres",
        name: { en: "PostgreSQL", fr: "PostgreSQL" },
        detail: {
          en: "The major version you choose, local only, app and remote roles you name, common extensions, dump import.",
          fr: "La version majeure choisie, local seulement, rôles applicatif et distant que vous nommez, extensions courantes, import de dumps.",
        },
      },
      {
        id: "db.mongodb",
        name: { en: "MongoDB", fr: "MongoDB" },
        detail: {
          en: "The major version you choose, local only, the app user you name, mongodump import.",
          fr: "La version majeure choisie, local seulement, l’utilisateur applicatif que vous nommez, import de mongodump.",
        },
      },
      {
        id: "db.redis",
        name: { en: "Redis", fr: "Redis" },
        detail: {
          en: "Local only, a password it refuses to work without, persistence and a memory ceiling you set.",
          fr: "Local seulement, un mot de passe sans lequel il refuse de répondre, persistance et plafond mémoire à votre main.",
        },
      },
      {
        id: "db.mailpit",
        name: { en: "Mailpit", fr: "Mailpit" },
        detail: {
          en: "A local SMTP server that catches everything your projects send, and the interface that shows it, both on the loopback.",
          fr: "Un serveur SMTP local qui capture tout ce que vos projets envoient, et l’interface qui le montre, tous deux sur la boucle locale.",
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
        name: { en: "Claude Code", fr: "Claude Code" },
        detail: {
          en: "The native binary, checksum verified, with the machine context, the Pupitre skills and your own subscription.",
          fr: "Le binaire natif, somme de contrôle vérifiée, avec le contexte machine, les skills Pupitre et votre propre abonnement.",
        },
      },
      {
        id: "ai.codex",
        name: { en: "Codex", fr: "Codex" },
        detail: {
          en: "Installed through mise, same machine context and same skills, on your own subscription.",
          fr: "Posé par mise, même contexte machine et mêmes skills, sur votre propre abonnement.",
        },
      },
      {
        id: "ai.cursor",
        name: { en: "Cursor CLI", fr: "Cursor CLI" },
        detail: {
          en: "Cursor’s own package under its version, the agent and cursor-agent commands, the Pupitre skills, on your Cursor subscription.",
          fr: "Le paquet de Cursor sous sa version, les commandes agent et cursor-agent, les skills Pupitre, sur votre abonnement Cursor.",
        },
      },
      {
        id: "ai.gemini",
        name: { en: "Gemini CLI", fr: "Gemini CLI" },
        detail: {
          en: "Google’s open-source agent through mise, same machine context and same skills, on your Google account — the free tier is enough — or an API key.",
          fr: "L’agent open source de Google posé par mise, même contexte machine et mêmes skills, sur votre compte Google — le niveau gratuit suffit — ou une clé d’API.",
        },
      },
      {
        id: "ai.copilot",
        name: { en: "GitHub Copilot CLI", fr: "GitHub Copilot CLI" },
        detail: {
          en: "Copilot’s terminal agent through mise, same machine context and same skills, on your Copilot subscription.",
          fr: "L’agent de terminal de Copilot posé par mise, même contexte machine et mêmes skills, sur votre abonnement Copilot.",
        },
      },
      {
        id: "ai.opencode",
        name: { en: "OpenCode", fr: "OpenCode" },
        detail: {
          en: "The open-source agent, its binary checked against the digest GitHub publishes, tied to no provider: a Claude, ChatGPT or Copilot subscription, or any key.",
          fr: "L’agent open source, binaire vérifié par la somme que GitHub publie, sans fournisseur imposé : un abonnement Claude, ChatGPT ou Copilot, ou n’importe quelle clé.",
        },
      },
      {
        id: "ai.hermes",
        name: { en: "Hermes Agent", fr: "Hermes Agent" },
        detail: {
          en: "Nous Research’s agent through Python, the model providers you configure, a systemd service if always on.",
          fr: "L’agent de Nous Research via Python, les fournisseurs de modèles que vous configurez, service systemd si toujours actif.",
        },
      },
      {
        id: "ai.openclaw",
        name: { en: "OpenClaw", fr: "OpenClaw" },
        detail: {
          en: "The personal assistant reached from Telegram, Discord or WhatsApp, its gateway as a systemd service, the model providers you configure.",
          fr: "L’assistant personnel joignable depuis Telegram, Discord ou WhatsApp, sa passerelle en service systemd, les fournisseurs de modèles que vous configurez.",
        },
      },
      {
        id: "ai.browser",
        name: { en: "Browser and gallery", fr: "Navigateur et galerie" },
        detail: {
          en: "Headless Chrome and the Playwright libraries, the shot command, and a gallery served on the loopback.",
          fr: "Chrome sans interface et les bibliothèques Playwright, la commande shot, et une galerie servie sur la boucle locale.",
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
        name: { en: "JetBrains Remote Dev", fr: "JetBrains Remote Dev" },
        detail: {
          en: "Remote backend preinstalled for IntelliJ IDEA, WebStorm, PyCharm, PhpStorm or GoLand, JVM sized, your licence.",
          fr: "Backend distant préinstallé pour IntelliJ IDEA, WebStorm, PyCharm, PhpStorm ou GoLand, JVM dimensionnée, votre licence.",
        },
      },
      {
        id: "editor.vscode",
        name: { en: "VS Code Remote SSH", fr: "VS Code Remote SSH" },
        detail: {
          en: "code CLI and remote server preinstalled so the first connection is immediate; same for Cursor and Windsurf.",
          fr: "CLI code et serveur distant préinstallés pour que la première connexion soit immédiate ; idem pour Cursor et Windsurf.",
        },
      },
      {
        id: "editor.zed",
        name: { en: "Zed Remote Server", fr: "Zed Remote Server" },
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
        name: { en: "Cloudflare Tunnel", fr: "Cloudflare Tunnel" },
        detail: {
          en: "One tunnel on your own Cloudflare account, one route per project, DNS and certificate managed.",
          fr: "Un tunnel sur votre compte Cloudflare, une route par projet, DNS et certificat gérés.",
        },
      },
      {
        id: "exposure.caddy",
        name: { en: "Caddy", fr: "Caddy" },
        detail: {
          en: "Reverse proxy with automatic Let’s Encrypt certificates, one route per project, for a domain outside Cloudflare.",
          fr: "Reverse proxy avec certificats Let’s Encrypt automatiques, une route par projet, pour un domaine hors Cloudflare.",
        },
      },
      {
        id: "exposure.tailscale",
        name: { en: "Tailscale", fr: "Tailscale" },
        detail: {
          en: "The machine on your tailnet through an auth key: SSH and preview URLs from your phone or another computer, nothing exposed publicly. Lives beside Caddy or the tunnel.",
          fr: "La machine sur votre tailnet par une clé d’authentification : SSH et URL de preview depuis votre téléphone ou un autre poste, rien d’exposé publiquement. Cohabite avec Caddy ou le tunnel.",
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
        name: { en: "GitHub", fr: "GitHub" },
        detail: {
          en: "gh, HTTPS clone without a key, the server’s key registered on your account.",
          fr: "gh, clone HTTPS sans clé, clé du serveur enregistrée sur votre compte.",
        },
      },
      {
        id: "tool.1password",
        name: { en: "1Password", fr: "1Password" },
        detail: {
          en: "CLI and service account token, checked at install time, so a project builds its env file from your vault.",
          fr: "CLI et jeton de compte de service, vérifié à l’installation, pour qu’un projet construise son fichier d’environnement depuis votre coffre.",
        },
      },
      {
        id: "tool.neon",
        name: { en: "Neon", fr: "Neon" },
        detail: {
          en: "The Neon CLI and your API key in the dev shell; your projects and branches stay yours to create.",
          fr: "Le CLI Neon et votre clé d’API dans le shell de dev ; vos projets et vos branches restent les vôtres à créer.",
        },
      },
      {
        id: "tool.wrangler",
        name: { en: "Wrangler", fr: "Wrangler" },
        detail: {
          en: "Cloudflare’s CLI and your API token in the dev shell; Workers, D1 and Pages deploy from the server.",
          fr: "Le CLI de Cloudflare et votre jeton d’API dans le shell de dev ; Workers, D1 et Pages se déploient depuis le serveur.",
        },
      },
      {
        id: "tool.vercel",
        name: { en: "Vercel", fr: "Vercel" },
        detail: {
          en: "The Vercel CLI and your token in the dev shell; deploy, env and logs answer from the server.",
          fr: "Le CLI Vercel et votre jeton dans le shell de dev ; deploy, env et logs répondent depuis le serveur.",
        },
      },
      {
        id: "tool.supabase",
        name: { en: "Supabase", fr: "Supabase" },
        detail: {
          en: "The Supabase CLI, its release binary checksum verified, and your access token in the dev shell; migrations, types and functions push from the server.",
          fr: "Le CLI Supabase, binaire de release vérifié par sa somme, et votre jeton d’accès dans le shell de dev ; migrations, types et fonctions se poussent depuis le serveur.",
        },
      },
      {
        id: "tool.stripe",
        name: { en: "Stripe", fr: "Stripe" },
        detail: {
          en: "The Stripe CLI, its release binary checksum verified, and a restricted key in the dev shell; stripe listen forwards webhooks to a project on the machine.",
          fr: "Le CLI Stripe, binaire de release vérifié par sa somme, et une clé restreinte dans le shell de dev ; stripe listen relaie les webhooks vers un projet de la machine.",
        },
      },
    ],
  },
]

export const CATALOG_ENTRIES: CatalogEntry[] = CATALOG.flatMap(
  (group) => group.entries
)
