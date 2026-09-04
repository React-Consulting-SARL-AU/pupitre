# Protocole app ↔ agent

Le canal est une session SSH ouverte par l'app avec la clé du client, qui lance `pupitred serve`. L'app écrit une requête JSON par ligne sur l'entrée standard ; l'agent répond par une ligne JSON, ou par un flux d'événements puis une réponse. Les types vivent dans `packages/shared/src/agent-protocol/` et sont exportés en JSON Schema pour Go.

## Enveloppe

```jsonc
// requête
{ "id": 12, "cmd": "project.up", "params": { "name": "flymate-api" } }

// événement, zéro ou plusieurs, pour une commande longue
{ "id": 12, "event": "log", "line": "vite v7 ready in 412 ms" }

// réponse, exactement une
{ "id": 12, "ok": true, "result": { "state": "online", "port": 5173 } }
{ "id": 12, "ok": false, "error": { "code": "project_not_found", "message": "…", "fix": "…" } }
```

- `id` est choisi par l'app, croissant, jamais réutilisé dans une session.
- Les requêtes sont sérialisées côté app : une seule commande en vol par canal. Les commandes longues (`install`, `upgrade`, `project.sync`) ouvrent un second canal pour ne pas bloquer les lectures d'état.
- Toute erreur porte un `code` stable, un `message` pour l'humain, et un `fix` quand un remède existe.
- La première commande d'une session est `hello` ; l'agent refuse le reste tant qu'elle n'a pas eu lieu.

## Commandes

### Session

| Commande | Paramètres | Résultat |
| --- | --- | --- |
| `hello` | `{ app_version, protocol }` | `{ agent_version, protocol, server_id?, entitlement: "valid" \| "grace" \| "restricted" \| "dev", capabilities[] }`. Un `protocol` incompatible renvoie `protocol_mismatch` avec la version attendue |
| `ping` | — | `{ ts }` |

### Inspection et installation

| Commande | Paramètres | Résultat |
| --- | --- | --- |
| `probe` | — | le rapport de sonde : `os`, `version`, `arch`, `ram_mb`, `disk_free_gb`, `sudo`, `ports[]`, `docker`, `panel`, `agent_version`, `installed_modules[]`, `verdict` |
| `catalog` | — | `{ modules: Manifest[], presets: Preset[] }` d'après [service-catalog.md](./service-catalog.md) |
| `install` | `{ modules[], config: Record<moduleId, values>, secrets_stdin: true }` | événements `step` `{ module, step, status: "start" \| "ok" \| "skip" \| "fail", ms, replay? }` puis `{ failed[], warned[], report_path }`. Les secrets sont lus sur un flux séparé, jamais dans `params` |
| `uninstall` | `{ modules[] }` | événements `step`, puis `{ failed[] }` |
| `harden` | `{ user: "dev" }` | événements `step`, puis `{ root_closed: boolean, next_user, reason? }`. Ne ferme root que si une clé ouvre `dev` |
| `upgrade` | `{ modules?: string[] }` | idem `install`, sur les modules déjà présents |
| `report` | — | le dernier rapport d'installation |

### État

| Commande | Résultat |
| --- | --- |
| `snapshot` | `{ machine, services[], projects[], sessions[], entitlement }` en un appel. C'est ce que le tableau de bord lit toutes les 3 secondes |
| `status` | `{ services[], projects[] }` allégé |
| `service.status` `{ id }` | état, version, port, identifiants (masqués), unité systemd |
| `completions` | la grammaire des commandes, pour l'autocomplétion du terminal |

### Projets

| Commande | Paramètres |
| --- | --- |
| `project.list` | — |
| `project.add` | `{ name, dir, repo?, pkgmgr, host, port, subdomain?, cmd, install? }` |
| `project.remove` | `{ name }` (le dossier reste) |
| `project.up` / `project.down` / `project.restart` | `{ name \| "all" }` |
| `project.logs` | `{ name, lines?, follow? }` → événements `log` si `follow` |
| `project.sync` | `{ name }` : pull puis réinstallation des dépendances |
| `project.install` | `{ name }` |
| `project.env` | `{ name, force? }` : régénère `.env.local` |
| `project.branches` | `{ name }` |
| `project.checkout` | `{ name, branch }` |
| `project.git_status` | `{ name }` : `behind`, `ahead`, `dirty`, `changed`, `last`, `subject`, `problem` |
| `project.working_tree` | `{ name }` : fichiers changés |
| `project.diff` | `{ name, path }` : le patch brut |
| `project.url` | `{ name }` |
| `project.debug` | `{ name }` : redémarrage avec l'agent de débogage JVM |

### Agents, sessions, processus

| Commande | Paramètres |
| --- | --- |
| `agent.open` | `{ kind: "claude" \| "codex" \| "hermes", project }` : renvoie la commande tmux que l'app attache dans un terminal |
| `sessions.list` | — : pid, durée, RAM, kind, commande |
| `sessions.clean` | — |
| `processes.list` | — |
| `process.kill` | `{ pid, force? }` |
| `shots.list` / `shots.url` / `shots.clean` | — |

### Secrets, bases, tunnel

| Commande | Paramètres |
| --- | --- |
| `secrets.status` | — : les clés présentes dans `/etc/pupitre/env`, jamais leurs valeurs |
| `secrets.set` | `{ key }` : valeur lue sur le flux secret |
| `secrets.sync` | `{ project }` |
| `db.dump` / `db.import` / `db.shell` / `db.url` | `{ engine, name? }` |
| `tunnel.status` / `tunnel.sync` / `tunnel.restart` | — |

### Système

| Commande | Paramètres |
| --- | --- |
| `keys.list` | — : les clés du bloc balisé |
| `keys.sync` | — : force une lecture de `/api/v1/agent/state` |
| `agent.upgrade` | `{ version?, signature }` : télécharge, vérifie, remplace, redémarre |
| `reboot` | — |
| `doctor` | — : diagnostic court |
| `diag` | — : rapport complet à coller dans un ticket |

## Le flux secret

Une commande qui porte un secret (`install`, `secrets.set`) annonce `secrets_stdin: true`. L'app écrit ensuite les secrets en JSON sur une ligne, l'agent les consomme sans les journaliser ni les renvoyer. Aucun secret n'apparaît dans `params`, dans un événement ou dans un rapport.

## Versionnage

`protocol` est un entier. L'agent accepte la version courante et la précédente. L'app refuse un agent trop vieux et propose `agent.upgrade`. Un champ ajouté à un résultat n'incrémente pas la version ; un champ retiré ou renommé, oui.

## Mode restreint

Sans droit d'usage valide depuis sept jours, `hello` renvoie `entitlement: "restricted"` et seules `hello`, `ping`, `snapshot`, `status`, `diag` et `agent.upgrade` répondent ; les autres renvoient `entitlement_required` avec le lien vers la console.
