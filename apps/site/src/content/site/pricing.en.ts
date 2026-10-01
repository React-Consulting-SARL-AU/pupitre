import type { PricingContent } from "./pricing"

export const pricingEn: PricingContent = {
  meta: {
    title: "Pricing — Pupitre",
    description:
      "Pupitre is free for every organisation up to {count} servers: no card, no trial, no subscription. Beyond that, a licence is granted on request. The source is public, and when you stop, your server keeps running.",
  },
  offer: "Free up to {count} servers per organisation",
  hero: {
    label: "Pricing",
    headline: "Free. Up to {count} servers per organisation.",
    lead: "The app, the agent and the whole catalogue cost nothing for your first {count} servers. No card, no trial that runs out, no subscription. You pay your host for the server, and nothing to us.",
    figure: "Free",
    unit: "up to {count} servers per organisation",
  },
  free: {
    label: "What is free",
    title: "Everything, on {count} servers",
    lead: "There is no paid edition and no feature held back: the free servers get what Pupitre knows how to do.",
    included: {
      title: "What you get",
      lines: [
        "The desktop app, and the agent on each server",
        "The whole catalogue: runtimes, databases, agents, editors, exposure",
        "Updates and alerts",
        "Members and roles, and an audit log of who did what",
        "Your own Claude, ChatGPT, Cursor, Google or Copilot subscriptions",
      ],
    },
    asked: {
      title: "What we ask of you",
      lines: [
        "An account, with an email address",
        "No card, at sign-up or later",
        "No time limit: the free servers stay free",
      ],
    },
    signUp: "Create an account",
    download: "Download the app",
  },
  beyond: {
    label: "Beyond {count} servers",
    title: "A licence, on request",
    lead: "An organisation that needs more than {count} servers asks for a licence. It adds the servers it needs to the free ones, and the platform grants it.",
    note: "Licences are granted on request today, and no payment is taken. Write to us with the name of your organisation and the number of servers you need.",
    contact: "Ask for a licence",
  },
  source: {
    label: "Source code",
    title: "The source is public",
    lead: "Pupitre is published under the Apache 2.0 licence with the Commons Clause. That makes it source-available, not open source: you may read, change and run it, but not sell it.",
    allowed: {
      title: "What you may do",
      lines: [
        "Read the code of the app, the agent and the platform",
        "Change it, for yourself or for your company",
        "Run it, including a platform of your own",
        "Redistribute it, modified or not, with the licence and the Commons Clause",
      ],
    },
    forbidden: {
      title: "What you may not do",
      lines: [
        "Sell Pupitre, or a service whose value comes mainly from it",
        "Charge your customers for installing Pupitre on their servers",
        "Use the Pupitre name or logo for a product of your own",
      ],
    },
    licence: "Read the licence",
    repository: "See the source",
  },
  stop: {
    label: "When it stops",
    title: "Leave, and keep the server",
    lead: "When you remove Pupitre, your server keeps running as an ordinary Ubuntu server. Projects, databases and services stay where they are. You lose Pupitre, nothing else.",
    keep: {
      title: "What stays",
      lines: [
        "The server, with SSH access as before",
        "Your projects, in their folders, started by tmux and systemd",
        "PostgreSQL, MySQL, MongoDB and their data",
        "Cloudflare tunnels, runtimes, remote editors, the dev user",
      ],
    },
    lose: {
      title: "What you lose",
      lines: [
        "The desktop app: dashboard, projects, terminals",
        "The catalogue: installing, updating, removing services",
        "Updates of the agent and alerts",
        "Support",
      ],
    },
    note: "Pupitre leaves one binary and a few configuration files, which you can delete. Enrol the server again and the app picks up where it left off.",
  },
  diy: {
    label: "Doing it yourself",
    title: "What Pupitre replaces, what you still pay",
    lead: "Everything Pupitre installs is standard: Ubuntu, systemd, tmux, ufw, fail2ban. You can do it by hand. Pupitre replaces the hours, not the machine.",
    replaces: {
      title: "What Pupitre replaces",
      lines: [
        "The tmux guides, and the evening spent making sessions survive a closed laptop",
        "The install scripts you copy from one server to the next and stop maintaining",
        "Key management: ed25519 pairs, authorized_keys, root closed, passwords off",
        "Updates of runtimes, databases and agents, and what breaks after them",
        "The hour every new project costs: clone, dependencies, port, URL, logs",
      ],
    },
    keeps: {
      title: "What you still pay",
      lines: [
        "The VPS: you rent it where you like and pay the host directly",
        "Your Claude, ChatGPT, Cursor, Google or Copilot subscriptions: the agents run on your accounts",
      ],
    },
  },
  catalog: {
    label: "Catalogue",
    title: "Included on every server",
    lead: "The whole catalogue comes with each server, free or licensed. {count} modules, all available, by category.",
    available: "{count} available",
    link: "See the full catalogue",
  },
}
