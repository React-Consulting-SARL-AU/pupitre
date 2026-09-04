import type { HomeContent } from "./home"

export const homeEn: HomeContent = {
  meta: {
    title: "Pupitre — a machine for your AI agents",
    description:
      "A desktop app that turns any Ubuntu VPS into a workshop for AI agents, and a compiled agent installed on that server.",
  },
  hero: {
    headline:
      "Your AI agents get a machine of their own. Your laptop cools down.",
    lead: "Pupitre turns any Ubuntu VPS into a workshop for your agents: it inspects the machine, installs the services you pick and hardens it. Your projects, terminals, databases and Claude Code run there, and you see all of it from a desktop app.",
    download: "Download the app",
    order: "Order",
    note: "Built by someone who runs his own agents on a VPS every day.",
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
          "You lose the app: the dashboard, the catalogue, updates, backups and alerts. The server keeps going as a normal server — projects, databases, services and tunnels stay in place, and you connect over SSH as before. Subscribe again and the app picks up where it left off.",
      },
    ],
  },
  pricing: {
    label: "Pricing",
    title: "One price per server",
    perServer:
      "{price} € per server per month, excluding VAT, on {solo} as on {team}.",
    annual: "Yearly, {months} months are free: {yearly} € per server per year.",
    trial: "{days}-day trial, no card.",
    hosted:
      "{hosted}, a server provided by Pupitre, from {price} € per month. Later.",
    link: "See the pricing",
  },
}
