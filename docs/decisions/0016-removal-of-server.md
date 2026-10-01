# 0016 — The original bash stack leaves the repository

Date: 2026-09-25 · Status: accepted

The `server/` folder is removed from the repository, along with `docs/SETUP.md`, the guide to installing it by hand. It contained:

- `bootstrap.sh`, the installation in twelve replayable phases;
- the `dev` command in zsh and its companions: `dev-tui`, `dev-diag`, `dev-env`, `dev-shots-server`, `shot`, `pupitre.zsh`;
- the `projects.conf` registry and the `env.example` template;
- the skills, the sub-agent and the preferences installed for AI agents, and the list of third-party skills;
- the Mac scripts: `setup-mac.sh`, `deploy.sh`, `push-secrets.sh`, `ghostty.conf`.

[Decision 0003](./0003-compiled-go-agent.md) made it the specification of `pupitred`'s modules, due to disappear module by module. The catalogue is complete: the modules under `apps/agent/internal/modules/` are now the reference, and the `agent-modules` skill points to them.

What the agent covers:

- **The phases of `bootstrap.sh`**: `core.system`, `core.hardening`, the runtimes, the databases with dump import, the tools, exposure, the AI agents and the browser.
- **The `dev` command**: `pupitred dev`, also callable as `dev`, on the same handlers as the app. `dev doctor` replaces `dev-diag`.
- **Shell integration**: the `.zshrc` block that `core.system` writes carries `pupitre.zsh`'s OSC 133 and OSC 7 markers.
- **Screenshots**: `internal/shots` replaces `shot` and the gallery.
- **The in-house skills, the `git-shipper` sub-agent and the preferences**: they are embedded in `ai/agents`.
- **`.env.local` files through the 1Password path**: `project.env` injects `.env.1password.tpl` through `op inject`, or copies `.env.example`.
- **The registry**: a `projects.conf` that an old server still carries under `/etc/pupitre/` is still read, and the fixture `apps/agent/internal/registry/testdata/projects.conf` keeps its shape.
- **The Mac scripts**: the app replaces SSH configuration, the terminal, upload and secrets.

Two things are not taken over by the agent.

**The third-party skills and the `claude-seo` plugin.** The `skills` phase installed for Claude Code and Codex, from `agents/external-skills.conf`:

| Source | Skills retained |
| --- | --- |
| `pbakaus/impeccable` | the whole repository |
| `AgriciDaniel/claude-seo` | the whole repository |
| `anthropics/skills` | `frontend-design`, `skill-creator` |
| `vercel-labs/agent-skills` | `web-design-guidelines`, `vercel-react-best-practices`, `vercel-composition-patterns` |

For Claude Code, it added the full `claude-seo@agricidaniel-seo` plugin, from the `AgriciDaniel/claude-seo` marketplace, with its agents, its hooks and its Python runtime. Today, the customer installs them themselves, as `dev`, in a terminal on the server:

```bash
npx -y skills add <source> -g -y [-s <skill> …] -a claude-code codex
claude plugin marketplace add AgriciDaniel/claude-seo
claude plugin install claude-seo@agricidaniel-seo --scope user
```

The plugin's first session is started with `/seo setup`, and `npx skills update` updates the skills.

**The repository's script for `.env.local`.** `dev-env` first ran the script that the repository provides, `bootstrap:local` or failing that `dev:prepare`. It ran it through the package manager designated by the lockfile, with standard input closed, for at most 240 seconds. The 1Password path came only second. `dev-env` then rewrote the project's local addresses to its public address and added the latter to `AUTH_TRUSTED_ORIGINS`. `project.env` does neither. Today, the customer runs the script as `dev`, in the project folder: `bun run bootstrap:local < /dev/null`, or `pnpm`/`npm run`, or `dev:prepare`. They fix the addresses in the resulting `.env.local` if they publish the project.

Why: two sources for the same installation, and the less accurate one ends up guiding an agent. The bash was no longer called anywhere, and its line numbers cited by the skill aged without anything flagging it. The two gaps are written down here rather than kept in a dead script, so that a takeover in the agent starts from them.

Ruled out: keeping `server/` read-only, which leaves a specification that nothing verifies any more; porting the two gaps into the agent before the removal, which deserves its own decision, since installing third-party code on the customer's server is not neutral.
