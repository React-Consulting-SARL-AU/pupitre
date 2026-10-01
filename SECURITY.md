# Security policy

Pupitre installs an agent that runs as root on servers people rent, and a desktop app that holds their SSH keys. A vulnerability here can open someone's machine, so reports are taken seriously and handled privately.

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a vulnerability.**

Write to `security@pupitre.studio`, in English or French, with:

- what is affected — the desktop app, the agent (`pupitred`), the console and API at `app.pupitre.studio`, the site, or the release chain;
- the version (`pupitred version`, or the app's Settings › About);
- the steps to reproduce, and what an attacker gains;
- whether you want to be credited, and under which name.

You can also use GitHub's private vulnerability reporting on this repository (**Security › Report a vulnerability**).

What to expect:

- an acknowledgement within 3 working days;
- an assessment, and a fix plan for a confirmed issue, within 10 working days;
- a fixed release as fast as the severity requires, then a public advisory that credits you unless you prefer otherwise.

Please give us a reasonable time to ship a fix before disclosing anything publicly.

## Supported versions

Only the latest released version of the app and of the agent receives security fixes. The app offers its own update, and the app updates the agent on each server.

## Scope

In scope: the code in this repository, the hosted platform at `app.pupitre.studio`, the release artefacts at `dl.pupitre.studio`, and the site at `pupitre.studio`.

Out of scope: the third-party software Pupitre installs from the catalogue (report those upstream), denial of service by volume, social engineering, and findings that need an already compromised laptop or root on the server.

When you test, use your own accounts and your own servers — the hosted platform is free up to three servers. Never access data that is not yours, and stop as soon as you reach someone else's data.

## How Pupitre is built to fail safely

The design rules that security relies on — no private key leaves the laptop, no inbound connection to the server, keys approved by a device signature, signed releases — are described in [`docs/security.md`](./docs/security.md) and [`docs/architecture.md`](./docs/architecture.md). Security never relied on the secrecy of the code.
