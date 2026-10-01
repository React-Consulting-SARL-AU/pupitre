# Product

## Register

product

## What Pupitre is

A desktop app that turns any Ubuntu VPS into a workshop for AI agents, and a compiled agent installed on that server. The customer brings the machine; Pupitre inspects it, installs the services they choose, hardens it, and becomes the window onto that machine: projects, terminals, agents, databases, remote editors.

The laptop of a developer who puts agents to work saturates: builds, headless browsers, parallel worktrees. The answer is a Linux machine of one's own, persistent, reachable over SSH. Pupitre makes it usable in ten minutes for someone who does not want to administer a server, and pleasant day to day for someone who knows how.

## Users

**Primary — the freelancer.** On a Mac, a Claude Max or Codex subscription, two to six client projects. Their laptop runs hot, their agents stop when they close the lid, every new project costs them an hour of setup. They want zero administration and a machine that works at night.

**Primary — the small agency.** Three to ten developers. Everyone tinkers with their own machine, nobody knows what runs where, a departure leaves open access behind. They want one server per developer, a single organization, a reproducible configuration, and one-click revocation.

**Tertiary — the owner of Pupitre.** Support and operations from the admin console: see enrolled servers, versions, revoke, impersonate to help. Never access to customers' machines.

Jobs-to-be-done:
- **Freelancer**: have a machine where my agents work without me, my projects as URLs, my databases within reach, without reading three tmux guides.
- **Agency**: give each developer their own machine, know what runs, cut off someone who leaves, one licence for the whole team beyond the free servers.
- **Owner**: drive adoption, grant licences, update, help, without ever entering a customer server.

## What the customer does, what Pupitre does

| The customer | Pupitre |
| --- | --- |
| Rents an Ubuntu 22.04 or 24.04 VPS wherever they like, 4 GB of RAM minimum, root or sudo | Inspects it, says what fits and what is missing, clearly refuses what it cannot manage |
| Chooses their services from the catalogue | Installs, configures, monitors, updates and uninstalls them |
| Adds their projects by git URL or folder | Clones, installs the dependencies, starts in tmux, exposes the URL, shows the logs |
| Connects to their agents with their own subscriptions | Opens Claude Code, Codex, Cursor, Gemini, Copilot, OpenCode or Hermes in the right folder, with the project context and skills |
| Enrols up to three servers for free, asks for a licence beyond that | Provides the app, the agent, the updates and the alerts |

## Offer

Pupitre is **free for any organization up to three servers** (`FREE_SERVERS` of `@pupitre/shared/plans`): no card, no trial, no subscription, no time limit. The whole catalogue and everything the app can do come with it, members, roles and audit included: there is no paid edition and no reserved feature. React Consulting SARL AU pays for hosting the platform.

Beyond three servers, an organization needs a **licence**. A licence adds seats to the free servers; today, it is obtained by writing to `support@pupitre.studio`, and the team grants it from the admin console (`granted` product). Nothing is sold: the platform runs with `BILLING_MODE=off`, and the Stripe code lies dormant ([decision 0018](../decisions/0018-source-available-and-free.md)). No price is set, and the site displays none.

The **source code is public**, under the Apache 2.0 licence with the Commons Clause. We say "source available" (in French, « code source disponible »), never "open source": anyone can read, modify and self-host Pupitre, nobody can sell it, nor sell a service that draws the essence of its value from it — a host that charges for a one-click Pupitre installation, for example.

When a server leaves Pupitre — licence withdrawn, agent uninstalled —, it keeps working as a normal server: its projects, its databases, its services remain. It loses Pupitre, nothing else. This is written in the terms and on the site.

The Pupitre organization itself has neither a licence nor an onboarding: its own is permanent, with `PLATFORM_ORGANIZATION_SEATS` machines.

**Affiliate links.** The owner creates `pupitre.studio/?ref=<code>` links from the admin console. The site sets the code as a cookie on the domain, and the console attaches it to the organization at sign-up. A link serves only to track a project with a public code: visits per day, sign-ups, and servers enrolled by the organizations it brought in. No offer is attached to it. A link is deactivated, never deleted: its sign-ups stay counted.

**Admin console.** Access comes from membership of the Pupitre organization (`org_pupitre`), which the owner manages from its Members page like any other organization: a member reads everything, an `admin` or `owner` acts. The console shows there the counters (accounts, organizations, servers and licences by status, links and referrals), the inbox of `pupitre.studio` emails with replies from the contact addresses, the detailed records of accounts, organizations and servers, the licences, the platform log, the versions to promote, the team, and the affiliate links. Suspending or restoring a server, banning an account, creating a link, replying to a mail are reserved to `admin` and `owner`. The team also grants a licence — a `granted` product, with the seats and expiry it chooses —, stops or deletes a licence, and deletes a server or revokes a device, each gesture with its reason in the log. Never access to the machines.

## The journey

1. **The site.** The visitor reads what Pupitre does, that it is free up to three servers, and that its code is public.
2. **The account.** They sign up on `app.pupitre.studio`; a personal organization is born with them, already licensed for its first three servers.
3. **The download.** The console gives them the app for their system.
4. **The link.** They open the app, link it to their account with the code displayed on `/auth/device`.
5. **The server.** They enrol their VPS, and the onboarding begins.

The order cannot be bypassed: each step assumes the previous one.

## The MVP

A complete desktop app, which the owner uses on their own VPS with their real projects, from an account and within their free servers, like any customer. The six-step onboarding: add a server, inspect, choose the services, configure, install, harden and switch from root to `dev`. Projects are created afterwards, as needs arise. Then day to day: dashboard, projects, terminals, agents, services, update.

The MVP is successful when the owner works every day with their projects on a server the app installed entirely, without opening a terminal outside the app.

## Brand Personality

**Voice.** Precise, calm, technical without jargon. Things are called by their real name: tmux, `authorized_keys`, PostgreSQL 17. We never say "AI-powered", "seamless", "blazing fast".

**Tone.** That of a serious tool for people who work, in the register of Linear, Raycast or Zed. The product talks about what it does, never about what it promises.

**Three words.** Precise. Sober. Reliable.

**Emotional goal.** "My machine is ready, my agents are working, I see everything."

**Reasons to believe.**
- Built by someone who runs their own agents on a VPS every day. One sentence, once, never a badge.
- The customer keeps everything if they leave Pupitre, and can read every line of the code they install. No inbound connection, no private key outside their laptop, no support access to their machine.
- The real standards named: SSH ed25519, ufw, fail2ban, tmux, systemd. Never "bank-grade".

## Anti-references

- Generic AI SaaS: purple gradients, identical icon-title cards, fake testimonials, urgency banners, "AI-powered" everywhere.
- Trust theatre: padlocks, "military-grade security", vault imagery.
- Terminal cosplay: black background with neon green, a blinking cursor as decoration.
- The discount host: struck-through prices, stock counters, "best choice" badges.

## Design Principles

1. **State is read from shape.** A server online, a project stopped, an installation failed: the shape says so before the colour.
2. **The server is the truth.** The app shows what the agent returns. It guesses nothing and invents no data.
3. **Every wait says what is happening.** "Installing PostgreSQL, step 3 of 7, 40 s", never a spinner alone.
4. **Every failure says the remedy.** A check that fails displays the command that repairs it.
5. **Nothing decorative.** One line, one step of grey, one weight. No shadow, no gradient, no illustration.
