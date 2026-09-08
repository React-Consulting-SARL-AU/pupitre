import type { PricingContent } from "./pricing"

export const pricingEn: PricingContent = {
  meta: {
    title: "Pricing — Pupitre",
    description:
      "{price} per server per month on Solo and Team, excluding tax. {months} months free on the yearly plan, a {days}-day trial without a card. When you stop, your server keeps running.",
  },
  hero: {
    label: "Pricing",
    headline: "One price per server. The server stays yours.",
    lead: "Solo and Team cost the same per server: {price} a month, excluding tax. Yearly, {months} months are free. The trial lasts {days} days and asks for no card. When you stop paying, your server keeps working without Pupitre.",
    unit: "per server, per month",
  },
  billing: {
    legend: "Billing",
    month: "Monthly",
    year: "Yearly",
    yearNote: "{months} months free",
  },
  plans: {
    label: "Offers",
    title: "Solo, Team, and later Hosted",
    perServerMonth: "per server, per month, excl. tax",
    perServerYear: "per server, per year, excl. tax",
    perMonth: "per month, excl. tax",
    from: "From",
    later: "Later",
    serversUpTo: "Up to {count} servers you bring",
    serversUnlimited: "As many servers as you bring",
    trial: "Start the {days}-day trial",
    sameRate:
      "The price per server is the same on Solo and Team: an agency buys the organisation, not a discount.",
    download: "Download the app",
    items: {
      solo: {
        audience: "One person",
        includes: [
          "The desktop app, and the agent on each server",
          "The whole catalogue: runtimes, databases, agents, editors, exposure",
          "Updates and alerts",
          "Your own Claude, Codex or Hermes subscriptions",
        ],
        cta: "Start the trial",
      },
      team: {
        audience: "An organisation",
        includes: [
          "Everything in Solo",
          "Members and roles, one server assigned to one person",
          "An audit log of who did what",
          "Revocation in one click when someone leaves",
          "One invoice for the whole team",
        ],
        cta: "Start the trial",
      },
      hosted: {
        audience: "Whoever does not want to rent",
        includes: [
          "A server provided by Pupitre; you rent nothing",
          "Everything in Solo",
          "Not open yet: it comes after Solo and Team",
        ],
      },
    },
  },
  stop: {
    label: "When it stops",
    title: "Stop paying, keep the server",
    lead: "When the subscription stops, your server keeps running as an ordinary Ubuntu server. Projects, databases and services stay where they are. You lose Pupitre, nothing else.",
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
    note: "Pupitre leaves one binary and a few configuration files, which you can delete. Subscribe again and the app picks up where it left off. It is written in the terms.",
  },
  diy: {
    label: "Doing it yourself",
    title: "What you pay for, what you still pay",
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
      title: "What it does not replace",
      lines: [
        "The VPS: you rent it where you like and pay the host directly",
        "Your Claude, Codex or Hermes subscriptions: the agents run on your accounts",
        "Your judgement: Pupitre runs what you ask, on the machine you chose",
      ],
    },
  },
  catalog: {
    label: "Catalogue",
    title: "Included in every offer",
    lead: "The whole catalogue comes with each server, whatever the offer. Twenty-six modules, all available, by category.",
    available: "{count} available",
    link: "See the full catalogue",
  },
}
