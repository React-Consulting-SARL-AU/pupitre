# apps/agent — Guidelines

`pupitred`, l'agent Go installé sur le VPS du client. Monorepo → [`../../CLAUDE.md`](../../CLAUDE.md) · protocole → [`docs/contracts/agent-protocol.md`](../../docs/contracts/agent-protocol.md) · catalogue → [`docs/contracts/service-catalog.md`](../../docs/contracts/service-catalog.md) · sécurité → [`docs/security.md`](../../docs/security.md).

## Stack imposée

Go 1.25, bibliothèque standard d'abord. Binaire statique (`CGO_ENABLED=0`), `-trimpath -ldflags="-s -w"`, garble en release. Cibles `linux/amd64` et `linux/arm64`. `gofmt`, `go vet`, `staticcheck`. Pas de framework, pas d'ORM, pas de shell-out là où un appel système suffit.

**Banned** : tout script déposé sur le disque du client, `os/exec` avec une chaîne construite depuis une entrée du protocole, journalisation d'un secret.

## Principes

- **Rien de lisible sur le serveur.** Le binaire, `/etc/pupitre/` en 0600 root, des unités systemd générées, des fichiers de configuration. `server/` du dépôt est la spécification des modules, jamais une dépendance.
- **Idempotence.** Chaque étape vérifie avant d'agir. `install` rejoué sur une machine installée ne change rien et finit en moins de 30 secondes.
- **La configuration est validée avant la première étape.** Le moteur applique les contraintes du manifeste — `format`, `pattern`, bornes, options, requis — et refuse en `invalid_config` sans rien toucher. Un module ne vérifie plus ses propres champs. Ce que seule la machine sait — un port écouté, un dossier occupé — s'ajoute par `Preflight`, que `install.check` appelle.
- **Les mêmes règles des deux côtés.** `internal/contract/fields.go` et `packages/shared/src/catalog/validate.ts` sont vérifiés contre `fields.fixtures.json`, exporté par `contracts:export`. Une règle changée d'un seul côté casse ce test.
- **Un échec n'arrête pas les autres.** Il est noté avec sa commande de rejeu ; le rapport dit tout en une fois.
- **Root se ferme en dernier**, et seulement si une clé ouvre `dev`. Jamais l'inverse.
- **Aucune connexion entrante.** Le seul canal de commande est `pupitred serve` sur la session SSH du client. Vers la plateforme : HTTPS sortant, jeton de serveur, rien d'autre.
- **Le droit d'usage gouverne.** Sans jeton valide ni tolérance, les modules et les commandes de pilotage refusent avec `entitlement_required`. Le build `-tags dev` embarque un droit d'usage de développement.
- **Le contrat vient de `packages/shared`** via `internal/contract/schema.json`, régénéré par `bun run contracts:export`. On ne redéclare pas un type du protocole à la main.

## Architecture

```
cmd/pupitred/            main.go : serve · daemon · enroll · install · probe · upgrade · dev · version
internal/protocol/       enveloppe, dispatch, événements, flux secret, appel direct d'une commande
internal/devcli/         grammaire et rendu de pupitred dev, la même que completions rend
internal/probe/          probe.sh (sh POSIX, embarqué) et la sonde Go
internal/modules/        interface Module ; un dossier par module : core/, runtime/, db/, ai/, editor/, exposure/, tool/
internal/registry/       projets, projects.conf
internal/tmux/           session, fenêtres, logs
internal/platform/       client HTTPS de la plateforme
internal/selfupdate/     agent.upgrade : téléchargement, signature, remplacement, retour arrière
internal/entitlement/    droit d'usage, cache, mode restreint
internal/daemon/         pupitred daemon : lecture de /agent/state, clés, heartbeat, unité systemd, enrôlement
internal/keys/           bloc balisé d'authorized_keys, écriture atomique
internal/sys/            apt, systemd, fichiers, utilisateurs
test/staging/            tests d'intégration contre le VPS de staging
```

Un module = un dossier avec `manifest.go`, `module.go`, `module_test.go`. Les étapes sont des fonctions courtes et nommées ; le moteur les enchaîne et émet les événements.

## Tests

`go test ./...` pour l'unitaire. `go test ./test/staging/...` réinstalle le staging (`bun run staging:reset`) puis joue les modules ; jamais contre une machine du propriétaire. Un module sans test de staging n'est pas fini.

## Commandes

```bash
bun run build            # go build multi-arch
bun run build:dev        # même chose avec -tags dev : droit d'usage intégré, ni jeton ni plateforme
bun run test
bun run lint             # gofmt, go vet, staticcheck
bun run staging:reset    # réinstalle le VPS de staging
bun run release          # garble + signature, CI seulement
```
