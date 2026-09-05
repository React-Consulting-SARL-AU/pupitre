import type { HomeContent } from "./home"

export const homeEn: HomeContent = {
  meta: {
    title: "Pupitre — a machine for your AI agents",
    description:
      "A desktop app that turns any Ubuntu VPS into a workshop for AI agents, and a compiled agent installed on that server.",
  },
  hero: {
    eyebrow: "Desktop app · Ubuntu server · your own keys",
    headline:
      "Your AI agents get a machine of their own. Your laptop cools down.",
    lead: "Pupitre turns any Ubuntu VPS into a workshop for your agents: it inspects the machine, installs the services you pick and hardens it. Your projects, terminals, databases and Claude Code run there, and you see all of it from a desktop app.",
    download: "Download the app",
    order: "Order",
    note: "Built by someone who runs his own agents on a VPS every day.",
    specs: [
      "Ubuntu 22.04 / 24.04",
      "4 GB RAM",
      "SSH ed25519",
      "macOS · Windows · Linux",
    ],
    report: {
      title: "Install report",
      caption:
        "The report the agent returns when an install ends. The app shows this and nothing it did not receive.",
      lines: [
        {
          mark: "on",
          module: "core.system",
          detail: "swap 4 GB · user dev · tmux · zsh",
        },
        {
          mark: "on",
          module: "core.hardening",
          detail: "ufw · fail2ban · root closed",
        },
        {
          mark: "on",
          module: "runtime.node",
          detail: "node 24.4.0 · bun 1.3.14 · pnpm 10.4.1",
        },
        {
          mark: "on",
          module: "db.postgres",
          detail: "17.4 · 127.0.0.1:5432 · local only",
        },
        {
          mark: "warn",
          module: "ai.claude",
          detail: "signed out — open the terminal to sign in",
        },
        {
          mark: "off",
          module: "exposure.cloudflare",
          detail: "not installed",
        },
      ],
      footer: "6 modules · 4 min 12 s · 1 to finish",
    },
  },
  steps: {
    label: "Onboarding",
    title: "Seven steps, once",
    lead: "The app walks the machine from empty to working. Every step says what it is doing and what it changed; you can stop after any of them.",
    items: [
      {
        title: "Add the server",
        detail:
          "Its address and a root or sudo account. The app generates an ed25519 key for this device; the private half never leaves your laptop.",
      },
      {
        title: "Inspect",
        detail:
          "Distribution, RAM, disk, architecture, what is already installed. Pupitre says what works, what is missing, and what it will not manage.",
      },
      {
        title: "Choose the services",
        detail:
          "Runtimes, databases, agents, remote editors, exposure, tools. Each one states what it installs and what it will ask you for.",
      },
      {
        title: "Configure",
        detail:
          "Versions, ports, accounts, secrets. Secrets travel over the SSH session and are never written to a file you did not ask for.",
      },
      {
        title: "Install",
        detail:
          "Step by step, live: the module, the step, the counter, the elapsed time. A failure names the command that repairs it.",
      },
      {
        title: "Harden and switch to dev",
        detail:
          "ufw on SSH only, fail2ban, passwords off, root closed last — after the app has verified that your key opens the dev account.",
      },
      {
        title: "First project",
        detail:
          "A git URL or a folder. Clone, dependencies, tmux, the port, the URL, the logs. From there it is just your machine.",
      },
    ],
  },
  features: {
    label: "What it does",
    title: "Ten minutes to a working machine, then every day",
    items: [
      {
        title: "Inspect and install",
        lines: [
          "Rent an Ubuntu 22.04 or 24.04 VPS wherever you like, 4 GB of RAM, root or sudo.",
          "Pupitre inspects it, says what works and what is missing, and refuses clearly what it cannot manage.",
          "Pick your services: it installs and configures them, hardens the machine with ufw, fail2ban and SSH ed25519, then moves you from root to dev.",
        ],
      },
      {
        title: "Run it every day",
        lines: [
          "Add a project by git URL or folder: it clones, installs dependencies, starts it in tmux and shows the URL and the logs.",
          "Open Claude Code, Codex or Hermes in the right folder, with the project’s context and skills, on your own subscriptions.",
          "Every wait says what is happening — “Installing PostgreSQL, step 3 of 7, 40 s” — and every failure shows the command that fixes it.",
        ],
      },
      {
        title: "Keep control",
        lines: [
          "The app shows what the agent reports, nothing else: services, versions, projects, what runs and what is stopped.",
          "For a team: one server per developer, roles, an audit log, one invoice. Someone leaves, you revoke them in one click.",
          "Support sees that your server is enrolled and which version it runs. It never enters your machine.",
        ],
      },
    ],
  },
  clients: {
    label: "Your own client",
    title: "Work from the app you already use",
    lead: "Claude and ChatGPT both ship a desktop app that opens a session on a remote machine over SSH. Point one at your server and it lands in your projects, on the runtimes Pupitre installed, next to the database the project needs. Pupitre’s own terminal becomes a choice.",
    items: [
      {
        title: "Claude",
        lines: [
          "Add the server as a remote connection in the Claude desktop app and Claude Code runs there, not on your laptop.",
          "It works in the project folder, with the project’s own instruction files and the Pupitre skills already on the machine.",
          "Your subscription, your session. Nothing is proxied and nothing of yours is stored on our platform.",
        ],
      },
      {
        title: "ChatGPT and Codex",
        lines: [
          "The same over SSH from the ChatGPT desktop app: Codex runs on the server, with your own subscription.",
          "Claude Code and Codex live on the same machine and see the same projects, the same runtimes, the same databases.",
          "Both were installed and kept up to date by Pupitre, so there is nothing to set up on the server side.",
        ],
      },
      {
        title: "Editors, and plain ssh",
        lines: [
          "VS Code, Cursor and Windsurf over Remote SSH, Zed through zed://ssh, JetBrains through Gateway — the backends are preinstalled.",
          "Or your own terminal: it is an ordinary Ubuntu machine, reached as dev with a key, running systemd and tmux.",
          "Pupitre installs no lock. Anything that speaks SSH can attach to the server it set up.",
        ],
      },
    ],
    note: "You sign an agent in once, from whichever session you are in. After that, the Pupitre app is where the install, the services and the logs live — not a terminal you are made to work in.",
  },
  catalog: {
    label: "Catalogue",
    title: "What it installs",
    lead: "A library of the stacks people actually use, chosen because they install and manage cleanly. What is not here, you install yourself; Pupitre does not stand in the way.",
  },
  promise: {
    label: "The promise",
    title: "Three things you can check",
    items: [
      {
        statement: "No inbound connection.",
        proof:
          "The app opens an SSH session from your laptop. The server listens for nothing on Pupitre’s behalf; ufw lets SSH through and nothing else.",
      },
      {
        statement: "No private key leaves your laptop.",
        proof:
          "Your ed25519 key stays on your machine. The server only receives its public half in authorized_keys, and the platform never sees either.",
      },
      {
        statement: "You keep everything if you leave.",
        proof:
          "When the subscription stops, the server keeps running as an ordinary server: projects, databases and services stay. You lose Pupitre, nothing else. It is written in the terms.",
      },
    ],
  },
  faq: {
    label: "Questions",
    title: "Honest answers",
    items: [
      {
        question: "Why not Claude Code on the web?",
        answer:
          "The web version fits an isolated task on one repository. It does not give you a machine: no database next to the code, no headless browser, no service running overnight, nothing that persists once the session ends. Pupitre gives you the machine, and your Claude or Codex subscription works there as it is.",
      },
      {
        question: "What if I want to leave?",
        answer:
          "Uninstall the app. The server stays yours, with its projects, databases and services: it is an ordinary Ubuntu set up with standard tools — systemd, tmux, ufw, fail2ban. Pupitre leaves one binary and a few configuration files, which you can delete.",
      },
      {
        question: "Which VPS should I choose?",
        answer:
          "Ubuntu 22.04 or 24.04, 4 GB of RAM at least, root or sudo, amd64 or arm64, at the host of your choice. Take more RAM if you plan a remote JetBrains IDE or several databases. Pupitre inspects the machine before installing anything and tells you if it falls short.",
      },
      {
        question: "Does it work on Windows?",
        answer:
          "The desktop app runs on macOS, Windows 11 and Ubuntu desktop. The server is always Ubuntu: Pupitre installs nothing on a Windows VPS. Visual Studio has no Linux backend; the app says so and points you to VS Code Remote SSH.",
      },
      {
        question: "What happens if the subscription stops?",
        answer:
          "You lose the app: the dashboard, the catalogue, updates and alerts. The server keeps going as a normal server — projects, databases, services and tunnels stay in place, and you connect over SSH as before. Subscribe again and the app picks up where it left off.",
      },
      {
        question: "Do I have to work inside Pupitre?",
        answer:
          "No. The server is an ordinary Ubuntu machine you reach over SSH as dev. The Claude desktop app and the ChatGPT desktop app both open a session on a remote machine, and so do VS Code, Cursor, Zed and JetBrains Gateway — point any of them at your server and you are in your projects, on the runtimes Pupitre installed. The app is where the install, the services, the alerts and the logs live; the terminal in it is there for the day you want it.",
      },
      {
        question: "Can support get onto my machine?",
        answer:
          "No. Nothing connects inward to your server, not the platform and not support. The agent only makes outbound HTTPS calls for its licence, the public half of your keys and its own updates. Support sees that a server is enrolled and which version it runs; that is the whole of it.",
      },
    ],
  },
  pricing: {
    label: "Pricing",
    title: "One price per server",
    perServer:
      "{price} per server per month, excluding tax, on {solo} as on {team}.",
    annual: "Yearly, {months} months are free: {yearly} per server per year.",
    trial: "{days}-day trial, no card.",
    hosted:
      "{hosted}, a server provided by Pupitre, from {price} per month. Later.",
    link: "See the pricing",
  },
  cta: {
    title: "Give your agents a machine.",
    lead: "Download the app, point it at a fresh Ubuntu VPS, and read along while it works. Nothing is installed on your laptop but the app itself.",
    download: "Download the app",
    docs: "Read the docs",
  },
}
