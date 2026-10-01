import type { SecurityContent } from "./security"

export const securityEn: SecurityContent = {
  meta: {
    title: "Security — Pupitre",
    description:
      "What Pupitre can and cannot do on your server, what the platform knows about it, and the command that checks each claim. Where to read the code, what happens if Pupitre stops, and how to remove it.",
  },
  hero: {
    label: "Security",
    headline:
      "You install our agent as root. Here is what it can and cannot do.",
    lead: "Pupitre puts a compiled binary on a server of yours, with root rights. That asks for trust, so the source is public, and every claim below comes with the command that checks it on your own machine.",
    cta: "Read the security docs",
  },
  guarantees: {
    label: "Guarantees",
    title: "Seven claims, each one checkable",
    lead: "Run the command on the server, or on your computer where it says so.",
    checkLabel: "Check it",
    items: [
      {
        statement: "Nothing connects to your server.",
        proof:
          "The app opens an SSH session from your computer; the agent only makes outbound HTTPS calls. Neither the platform nor support opens a connection to the machine. The firewall lets in SSH, and ports 80 and 443 only once you install Caddy.",
        check: "sudo ufw status",
      },
      {
        statement: "Your private keys stay on your computer.",
        proof:
          "The app makes its ed25519 keys in its own folder, in mode 0600. Only the public halves leave it: to the server's authorized_keys, and to the platform, which passes them to your organisation's servers.",
        check: "cat ~/.ssh/authorized_keys",
      },
      {
        statement: "The platform cannot let anyone in.",
        proof:
          "The agent adds a key only if a device it already trusts has signed an approval for it. The platform holds no private key, so it cannot make one up: a breach of our platform or of an admin session does not open your server.",
        check: "sudo cat /etc/pupitre/signers.json",
      },
      {
        statement: "Your coding agents do not become root.",
        proof:
          "Everything that runs as dev, your agents included, runs unattended. The hardening gives dev a sudo password that only your computer holds. Two exact command lines run without it, both the agent's own, and the session they open refuses whatever configures the machine.",
        check: "sudo -l",
      },
      {
        statement: "Your published projects open only with a key.",
        proof:
          "Every address the tunnel or Caddy publishes goes through a gate in the agent, and answers 401 to whoever has no access key. Keys are drawn on your computer, the server keeps only their hash, and opening a project to everyone takes your sudo password. Run the check from any machine.",
        check: "curl -sI https://your-project.example.com",
      },
      {
        statement: "Nothing readable is left on the server.",
        proof:
          "One compiled binary, generated systemd units and configuration files readable by root only. No script, no source. Your service passwords live in one file, on your server, and never reach the platform.",
        check: "sudo ls -la /etc/pupitre",
      },
      {
        statement: "Your server does not need us to run.",
        proof:
          "Stop the agent and everything else keeps running: projects, databases, services, SSH. Start it again with systemctl start. Cut off from the platform, the agent keeps working for seven days, then only stops accepting changes. It never shuts down what runs.",
        check: "sudo systemctl stop pupitred",
      },
    ],
  },
  platform: {
    label: "The platform",
    title: "What we know about your server, and what we never see",
    knows: {
      title: "What the platform stores",
      items: [
        "Your account, your organisation and the public keys of your devices.",
        "For each server: its name, address, architecture and agent version.",
        "The services and terminal sessions it runs, and its health readings over seven days.",
        "The status of its backups: when, how big, whether they succeeded.",
      ],
    },
    never: {
      title: "What it never receives",
      items: [
        "Your code, your files, your databases.",
        "Your conversations with your agents. They go from your server to the model provider you chose, on your account.",
        "Your passwords, tokens and API keys.",
        "A shell, a support key or any other way into the machine.",
      ],
    },
  },
  questions: {
    label: "Questions",
    title: "The questions worth asking before you install",
    items: [
      {
        id: "source",
        question: "Can I read the code?",
        paragraphs: [
          "Yes. The code of the app, the agent and the platform is public, under the Apache 2.0 licence with the Commons Clause: you may read it, change it, build the agent yourself and run your own platform. The one thing the licence forbids is selling Pupitre, or a service built mainly on it.",
          "You do not have to read the source to know what the agent did to your machine. Everything it installs is standard software, configured in ordinary files you can open, such as /etc/ssh/sshd_config.d/10-pupitre.conf or the Caddyfile. The documentation says what every module installs, changes and removes.",
        ],
        link: { href: "/legal/licence/", label: "What the licence allows" },
      },
      {
        id: "shutdown",
        question: "What if Pupitre shuts down?",
        paragraphs: [
          "We cannot promise the company will be here forever. We built Pupitre so that your machine does not depend on it.",
          "Without the platform, the app and the agent keep working for seven days. After that, the agent stops accepting changes and keeps everything that runs. You keep your server, with SSH as dev using your key, your editors and Claude or Codex over SSH, your services, databases and projects, and your backups in your own bucket. Nothing on it needs us to start, run or reboot.",
        ],
      },
      {
        id: "removal",
        question: "How do I remove Pupitre?",
        paragraphs: [
          "One command on the server removes the agent, its services and its state. Your services, databases, projects, the dev user and the hardening stay, and so do your keys. Delete the server in the app or the console to free its seat.",
        ],
        command: "sudo pupitred uninstall",
        link: {
          href: "/docs/account/uninstall/",
          label: "What is removed, and what stays",
        },
      },
      {
        id: "builder",
        question: "Who builds Pupitre?",
        paragraphs: [
          "{owner}, a Belgian developer based in Morocco, working alone, who runs coding agents on a VPS every day. Pupitre is the tool built for that work.",
          "The rules on this page are written into the specifications the code is tested against. Each change goes through tests and is tried on throwaway Ubuntu servers, and {owner} approves each release before it ships.",
        ],
      },
    ],
  },
  closing: {
    title: "Found a vulnerability?",
    body: "Write to {email}, in English or in French. We acknowledge within five working days, agree a disclosure date with you, and thank you by name in the release notes if you wish.",
    policy: "Disclosure policy",
    docs: "Security in the documentation",
  },
}
