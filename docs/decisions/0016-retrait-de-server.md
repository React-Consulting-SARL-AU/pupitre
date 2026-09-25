# 0016 — La stack bash d'origine quitte le dépôt

Date : 2026-09-25 · Statut : acceptée

Le dossier `server/` est retiré du dépôt, avec `docs/SETUP.md`, le guide de son installation à la main. Il contenait :

- `bootstrap.sh`, l'installation en douze phases rejouables ;
- la commande `dev` en zsh et ses compagnons : `dev-tui`, `dev-diag`, `dev-env`, `dev-shots-server`, `shot`, `pupitre.zsh` ;
- le registre `projects.conf` et le gabarit `env.example` ;
- les skills, le sous-agent et les préférences posés pour les agents IA, et la liste des skills tiers ;
- les scripts du Mac : `setup-mac.sh`, `deploy.sh`, `push-secrets.sh`, `ghostty.conf`.

La [décision 0003](./0003-compiled-go-agent.md) en faisait la spécification des modules de `pupitred`, appelée à disparaître module par module. Le catalogue est complet : les modules sous `apps/agent/internal/modules/` sont désormais la référence, et le skill `agent-modules` renvoie à eux.

Ce que l'agent couvre :

- **Les phases de `bootstrap.sh`** : `core.system`, `core.hardening`, les runtimes, les bases avec l'import des dumps, les outils, l'exposition, les agents IA et le navigateur.
- **La commande `dev`** : `pupitred dev`, aussi appelable `dev`, sur les mêmes gestionnaires que l'app. `dev doctor` remplace `dev-diag`.
- **L'intégration du shell** : le bloc `.zshrc` que `core.system` écrit porte les marqueurs OSC 133 et OSC 7 de `pupitre.zsh`.
- **Les captures** : `internal/shots` remplace `shot` et la galerie.
- **Les skills maison, le sous-agent `git-shipper` et les préférences** : ils sont embarqués dans `ai/agents`.
- **Les `.env.local` par le chemin 1Password** : `project.env` injecte `.env.1password.tpl` par `op inject`, ou copie `.env.example`.
- **Le registre** : un `projects.conf` qu'un ancien serveur porte encore sous `/etc/pupitre/` reste lu, et la fixture `apps/agent/internal/registry/testdata/projects.conf` en garde la forme.
- **Les scripts du Mac** : l'app remplace la configuration SSH, le terminal, l'envoi et les secrets.

Deux choses ne sont pas reprises par l'agent.

**Les skills tiers et le plugin `claude-seo`.** La phase `skills` installait pour Claude Code et Codex, depuis `agents/external-skills.conf` :

| Source | Skills retenus |
| --- | --- |
| `pbakaus/impeccable` | tout le dépôt |
| `AgriciDaniel/claude-seo` | tout le dépôt |
| `anthropics/skills` | `frontend-design`, `skill-creator` |
| `vercel-labs/agent-skills` | `web-design-guidelines`, `vercel-react-best-practices`, `vercel-composition-patterns` |

Pour Claude Code, elle ajoutait le plugin complet `claude-seo@agricidaniel-seo`, du marketplace `AgriciDaniel/claude-seo`, avec ses agents, ses hooks et son runtime Python. Aujourd'hui, le client les pose lui-même, en `dev`, dans un terminal du serveur :

```bash
npx -y skills add <source> -g -y [-s <skill> …] -a claude-code codex
claude plugin marketplace add AgriciDaniel/claude-seo
claude plugin install claude-seo@agricidaniel-seo --scope user
```

La première session du plugin se lance par `/seo setup`, et `npx skills update` met les skills à jour.

**Le script du dépôt pour le `.env.local`.** `dev-env` lançait d'abord le script que le dépôt fournit, `bootstrap:local` ou à défaut `dev:prepare`. Il le lançait par le gestionnaire de paquets que désigne le lockfile, l'entrée standard fermée, avec 240 secondes au plus. Le chemin 1Password ne venait qu'en second. `dev-env` réécrivait ensuite les adresses locales du projet vers son adresse publique et ajoutait celle-ci à `AUTH_TRUSTED_ORIGINS`. `project.env` ne fait ni l'un ni l'autre. Aujourd'hui, le client lance le script en `dev`, dans le dossier du projet : `bun run bootstrap:local < /dev/null`, ou `pnpm`/`npm run`, ou `dev:prepare`. Il corrige les adresses du `.env.local` produit s'il publie le projet.

Pourquoi : deux sources pour une même installation, c'est la moins vraie qui finit par guider un agent. Le bash n'était plus appelé nulle part, et ses numéros de ligne cités par le skill vieillissaient sans que rien ne le signale. Les deux manques sont écrits ici plutôt que gardés dans un script mort, pour qu'une reprise dans l'agent parte d'eux.

Écarté : garder `server/` en lecture seule, qui laisse une spécification que plus rien ne vérifie ; porter les deux manques dans l'agent avant le retrait, qui mérite sa propre décision, car installer du code tiers sur le serveur du client n'est pas neutre.
