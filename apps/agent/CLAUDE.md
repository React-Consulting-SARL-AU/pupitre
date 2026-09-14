# apps/agent — Guidelines

`pupitred`, l'agent Go installé sur le VPS du client. Monorepo → [`../../CLAUDE.md`](../../CLAUDE.md) · protocole → [`docs/contracts/agent-protocol.md`](../../docs/contracts/agent-protocol.md) · catalogue → [`docs/contracts/service-catalog.md`](../../docs/contracts/service-catalog.md) · migrations → [`docs/contracts/config-migrations.md`](../../docs/contracts/config-migrations.md) · sécurité → [`docs/security.md`](../../docs/security.md).

## Stack imposée

Go 1.26 (la version de `go.mod`), bibliothèque standard d'abord. Binaire statique (`CGO_ENABLED=0`), `-trimpath -ldflags="-s -w"`, garble en release. Cibles `linux/amd64` et `linux/arm64`. `gofmt`, `go vet`, `staticcheck`. Pas de framework, pas d'ORM, pas de shell-out là où un appel système suffit.

**Banned** : tout script déposé sur le disque du client, `os/exec` avec une chaîne construite depuis une entrée du protocole, journalisation d'un secret.

## Principes

- **Rien de lisible sur le serveur.** Le binaire, `/etc/pupitre/` en 0600 root, des unités systemd générées, des fichiers de configuration. `server/` du dépôt est la spécification des modules, jamais une dépendance.
- **Idempotence.** Chaque étape vérifie avant d'agir. `install` rejoué sur une machine installée ne change rien et finit en moins de 30 secondes.
- **La configuration est validée avant la première étape.** Le moteur applique les contraintes du manifeste — `format`, `pattern`, bornes, options, requis — et refuse en `invalid_config` sans rien toucher. Un module ne vérifie plus ses propres champs. Ce que seule la machine sait — un port écouté, un dossier occupé — s'ajoute par `Preflight`, que `install.check` appelle.
- **Les mêmes règles des deux côtés.** `internal/contract/fields.go` et `packages/shared/src/catalog/validate.ts` sont vérifiés contre `fields.fixtures.json`, exporté par `contracts:export`. Une règle changée d'un seul côté casse ce test.
- **Un échec n'arrête pas les autres.** Il est noté avec sa commande de rejeu ; le rapport dit tout en une fois.
- **Un binaire ne lit jamais une configuration qu'il n'a pas migrée.** Changer la forme d'un fichier de `/etc/pupitre` — un champ d'`install.json` renommé, un identifiant de module scindé, une colonne du registre des projets — coûte une entrée dans `internal/migrate/migrations.go` : idempotente, sans effet sur un fichier absent, lisant du JSON brut et jamais un type d'aujourd'hui, à l'identifiant fixé pour toujours. Le moteur sauvegarde avant le lot et remet tout en l'état si une migration refuse. Un fichier qu'un module possède se porte dans l'`Upgrade` de ce module, pas ici.
- **Root se ferme en dernier**, et seulement si une clé ouvre `dev`. Jamais l'inverse.
- **Aucune connexion entrante.** Le seul canal de commande est `pupitred serve` sur la session SSH du client. Vers la plateforme : HTTPS sortant, jeton de serveur, rien d'autre.
- **Le droit d'usage gouverne.** Sans jeton valide ni tolérance, les modules et les commandes de pilotage refusent avec `entitlement_required`. Le build `-tags dev` embarque un droit d'usage de développement.
- **Le contrat vient de `packages/shared`** via `internal/contract/schema.json`, régénéré par `bun run contracts:export`. On ne redéclare pas un type du protocole à la main.

## Architecture

```
cmd/pupitred/            main.go : version · serve · daemon · enroll · install · migrate · report · probe · gallery · dev ; un cli_*.go par sous-commande
internal/contract/       schema.json exporté de packages/shared, codes d'erreur, règles des champs, feuille de compatibilité
internal/daemon/         pupitred daemon : lecture de /agent/state, clés, heartbeat, unité systemd, enrôlement, keys.list
internal/devcli/         grammaire et rendu de pupitred dev, élévation sudo ; la même grammaire que completions rend
internal/entitlement/    droit d'usage, cache, mode restreint ; build_dev.go porte le droit d'usage du tag dev
internal/golden/         enregistre ce qu'une transcription de test a produit, au lieu d'échouer dessus
internal/i18n/           toutes les phrases de l'agent, en français et en anglais, un catalogue par domaine
internal/keys/           bloc balisé d'authorized_keys, écriture atomique
internal/migrate/        le registre des migrations de configuration : révision, sauvegardes, rejeu, restauration ; migrations.go est la liste
internal/modules/        interface Module, moteur, validation, préflight, journal, verrou ; un dossier par catégorie : core/, runtime/, db/, ai/, editor/, exposure/, tool/ ; modtest/ pour les tests
internal/platform/       client HTTPS de la plateforme, jeton de serveur
internal/probe/          probe.sh (sh POSIX, embarqué), son analyse et le verdict
internal/protocol/       enveloppe, dispatch, sessions, événements, flux secret
internal/registry/       projets et leurs processus, projects.local.json, projects.conf du dépôt
internal/release/        signature et publication des binaires par la chaîne de release ; rien n'en est lié dans pupitred
internal/selfupdate/     agent.upgrade : téléchargement, empreinte et signature, plancher de version, remplacement
internal/shots/          la galerie de captures et son serveur en lecture seule
internal/state/          snapshot, status, projets, git, agents, complétions, détection d'un dépôt
internal/sys/            apt, systemd, fichiers, réseau, utilisateurs, environnement ; sys.Real et le faux des tests
internal/tmux/           session, une fenêtre <projet>/<processus> par processus, logs
tools/release/           la commande release : keygen, public-key, sign, publish, promote
test/catalog/            idempotence de chaque module du catalogue
test/staging/            tests d'intégration contre le VPS de staging, derrière -tags staging
test/vps/                le faux VPS : conteneur Ubuntu sous systemd, sur le Mac
```

Un module = un dossier avec `manifest.go`, `module.go`, `module_test.go`. Les étapes sont des fonctions courtes et nommées ; le moteur les enchaîne et émet les événements.

## Tests

`go test ./...` pour l'unitaire. Les tests d'intégration sont derrière le tag de build `staging` et visent un VPS réinstallable, jamais une machine du propriétaire :

```bash
PUPITRE_STAGING_HOST=root@<adresse> go test -tags staging ./test/staging/...
```

Sans la variable, ils se sautent au lieu d'échouer. La réinstallation du VPS est manuelle, chez l'hébergeur. Un module sans test de staging n'est pas fini.

## Commandes

```bash
bun run build            # go build multi-arch
bun run build:dev        # même chose avec -tags dev : droit d'usage intégré, ni jeton ni plateforme
bun run test
bun run lint             # gofmt, go vet, staticcheck
bun run tools:install    # staticcheck et govulncheck, épinglés ; le bin de Go doit être dans le PATH
bun run release          # garble + signature, appelé par scripts/release sur le runner de release.yml
```
