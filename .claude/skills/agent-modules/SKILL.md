---
name: agent-modules
description: "Écrire un module Go de `pupitred` dans `apps/agent/internal/modules/<catégorie>/<nom>` — `manifest.go`, `module.go`, `module_test.go`, interface `Module`, étapes idempotentes courtes et nommées, helpers `internal/sys`, événements `step`, comptabilité `failed`/`warned` et commande de rejeu, lecture de la spécification dans `server/bootstrap.sh`, test unitaire et test de staging. À utiliser pour toute tâche `AGT` qui ajoute ou modifie un module du catalogue."
---

# Modules de l'agent

Un service du catalogue est un **module** : une unité Go qui sait se vérifier, s'installer, se configurer, se mettre à jour, se désinstaller et rapporter son état, sur Ubuntu 22.04 et 24.04, `amd64` et `arm64`. L'app ne connaît aucun module par son nom : elle affiche les manifestes que `catalog` renvoie. Un module ajouté ici apparaît dans l'app sans rebuild de l'app.

## Fichiers gouvernés

| Fichier | Rôle |
| --- | --- |
| `apps/agent/internal/modules/<catégorie>/<nom>/manifest.go` | le manifeste, conforme à `docs/contracts/service-catalog.md` |
| `apps/agent/internal/modules/<catégorie>/<nom>/module.go` | l'implémentation de `Module` |
| `apps/agent/internal/modules/<catégorie>/<nom>/module_test.go` | le test unitaire sur un système factice |
| `apps/agent/internal/modules/` | l'interface `Module`, le `Context`, le registre, le moteur (AGT-03) |
| `apps/agent/internal/modules/modtest/` | système factice et contexte de test |
| `apps/agent/internal/sys/{apt,systemd,file,user,env}/` | les helpers système |
| `apps/agent/internal/contract/schema.json` | le JSON Schema exporté de `packages/shared` ; les types Go en dérivent |
| `apps/agent/test/staging/<catégorie>_test.go` | les tests d'intégration contre le VPS de staging |
| `apps/agent/package.json` | `build`, `test`, `lint`, `staging:reset` |
| `server/bootstrap.sh`, `server/bin/dev`, `docs/SETUP.md` | la spécification des étapes, en bash ; jamais une dépendance |
| `docs/contracts/service-catalog.md` | manifeste, catégories, champs, préréglages |
| `docs/contracts/agent-protocol.md` | `install`, `uninstall`, `upgrade`, `report`, événements `step` |

## État du dépôt

Au 2026-09-04, `apps/agent` contient `cmd/pupitred/main.go` qui répond `ping`. L'interface `Module`, le `Context`, le moteur, les helpers `internal/sys` et `modtest` sont livrés par **AGT-03** ; le protocole et le JSON Schema par **AGT-01** et **INF-04**. `staging:reset` n'est pas encore dans `apps/agent/package.json`. Ce skill décrit la cible : si AGT-03 a retenu d'autres noms, son code gagne et ce skill est mis à jour dans la même tâche.

## Interdictions

Tirées de `apps/agent/CLAUDE.md` et `docs/security.md`. Une PR qui viole l'une d'elles est refusée.

- **Aucun script déposé sur le disque du client.** Pas de `.sh`, pas de fichier source, pas d'archive. Un binaire, `/etc/pupitre/` en 0600 root, des unités systemd générées, des fichiers de configuration.
- **Aucun `os/exec` avec une chaîne construite.** Toujours un `argv` : `user.Run(ctx, "dev", "redis-cli", "ping")`. Jamais `sh -c` avec une valeur venue du protocole, d'un manifeste ou d'un fichier.
- **Aucun secret journalisé.** Ni dans `/var/log/pupitre.log`, ni dans un événement `step`, ni dans le rapport, ni dans une erreur. Les helpers journalisent la commande et le chemin, jamais un contenu.
- **Aucune connexion entrante, aucun appel réseau hors HTTPS sortant** vers la plateforme ou un dépôt de paquets.
- **Rien sans droit d'usage valide** : le moteur refuse `install` avec `entitlement_required` ; un module ne contourne pas ce contrôle.
- **Le contrat vient de `packages/shared`** par `internal/contract/schema.json` : on ne redéclare pas un type du protocole ou du manifeste à la main.

## Anatomie d'un module

```
internal/modules/db/redis/
├── manifest.go      le manifeste et l'identifiant
├── module.go        le type, init() qui l'enregistre, les six méthodes, les étapes
└── module_test.go   idempotence, absence de secret, échec d'une étape
```

Le dossier suit la catégorie du manifeste : `core/`, `runtime/`, `db/`, `ai/`, `editor/`, `exposure/`, `tool/`. L'identifiant est `<catégorie>.<nom>` (`db.redis`), la catégorie du manifeste est celle du contrat (`database`).

### L'interface

```go
type Module interface {
	Manifest() contract.Manifest
	Check(ctx *Context) (Check, error)
	Install(ctx *Context) error
	Configure(ctx *Context) error
	Upgrade(ctx *Context) error
	Uninstall(ctx *Context) error
	Status(ctx *Context) (contract.ServiceStatus, error)
}
```

| Méthode | Fait | Ne fait pas |
| --- | --- | --- |
| `Manifest` | renvoie le manifeste, constant | lire le système |
| `Check` | dit si le module est présent, sa version, s'il faut une mise à jour ; sert à la sonde et au rejeu | modifier quoi que ce soit |
| `Install` | paquets, binaires, dossiers | la configuration qui dépend des valeurs de l'utilisateur |
| `Configure` | fichiers de configuration, comptes, secrets, unité systemd | réinstaller |
| `Upgrade` | met à jour le paquet ou la version, puis rejoue `Configure` | changer les valeurs choisies |
| `Uninstall` | retire ce que le module a installé : paquet, configuration, clé de `/etc/pupitre/env` | toucher aux données ou à ce que le client a installé lui-même |
| `Status` | état de l'unité, version, port, identifiants **masqués** | déclencher une action |

Le moteur (AGT-03) résout `requires` et `conflicts`, ordonne, enchaîne `Install` puis `Configure` pour chaque module demandé, et écrit le rapport dans `/var/lib/pupitre/report.json`. Un module ne parle jamais à un autre module : ce dont il a besoin, il le déclare dans `requires`.

### Les étapes

Une méthode est une suite d'étapes **courtes et nommées**. Chaque étape vérifie avant d'agir et renvoie `Skipped` si le travail est déjà fait ; c'est ce qui rend `install` rejouable en moins de 30 secondes sur une machine installée.

```go
func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-package", func() (modules.Outcome, error) {
		if apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, pkg)
	})
}
```

`ctx.Step` émet l'événement `step` du protocole avec `status: "start"`, puis `"ok"`, `"skip"` ou `"fail"`, et la durée `ms`. Une étape qui échoue arrête **ce module** et le note dans `failed[]` avec sa commande de rejeu (`sudo pupitred install db.redis`) ; les modules suivants continuent. Un problème non bloquant se signale par `ctx.Warn("…")`, qui alimente `warned[]`. C'est la comptabilité de `server/bootstrap.sh` (`fail`, `soft`, lignes 140 à 157), transposée.

Noms d'étapes en kebab-case, un verbe et un objet : `install-package`, `write-config`, `create-app-user`, `enable-service`, `import-dumps`. Une étape qui dépasse une vingtaine de lignes se découpe.

### Valeurs et secrets

Les champs du manifeste arrivent dans le contexte : `ctx.Value("engine")` pour `text`, `number`, `select`, `version` ; `ctx.Secret("password")` pour `secret`. Un secret vient du flux secret du protocole, jamais de `params`. Il s'écrit dans `/etc/pupitre/env` par `env.Set(ctx, "REDIS_PASSWORD", value)` et dans le fichier de configuration qui en a besoin, en 0600 ou 0640 root ; il n'apparaît nulle part ailleurs. Un champ `secret` avec `generate: true` arrive déjà généré par l'app.

### Les helpers `internal/sys`

| Package | Fonctions | Ce qu'il garantit |
| --- | --- | --- |
| `apt` | `Installed`, `Install`, `Remove`, `Upgrade`, `Update` | `-o DPkg::Lock::Timeout=600 -o Dpkg::Use-Pty=0`, `DEBIAN_FRONTEND=noninteractive`, `-y -qq` ; attend le verrou d'`unattended-upgrades` au lieu d'échouer (`bootstrap.sh` ligne 80) |
| `systemd` | `Enable`, `Disable`, `Restart`, `Reload`, `Active`, `State`, `WriteUnit` | `enable --now`, `daemon-reload` après `WriteUnit`, état lu par `is-active` |
| `file` | `WriteAtomic`, `Same`, `EnsureLine`, `Chown`, `Exists` | écriture dans un temporaire du même dossier puis `rename` ; `Same` compare le contenu pour rendre l'étape idempotente |
| `user` | `Run(ctx, user, argv...)`, `Exists`, `Create`, `Home` | exécution avec l'environnement complet de `dev` (`PATH` de mise et de bun, `HOME`), `argv` seulement, sortie journalisée, jamais l'entrée |
| `env` | `Set`, `Unset`, `Keys` | `/etc/pupitre/env` en 0600 root, écriture atomique, valeurs jamais journalisées |

`bootstrap.sh` lignes 286 à 295 (`as_dev`) est la spécification de `user.Run` : `cd $HOME`, `PATH` étendu, `MISE_YES=1`, `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`.

## Lire la spécification

`server/bootstrap.sh` (1772 lignes) et `server/bin/dev` décrivent ce que chaque module reproduit : ordre, options apt, pièges, rapport. On les lit, on ne les appelle pas. Numéros de ligne approximatifs au 2026-09-04 :

| Phase bash | Lignes | Module cible |
| --- | --- | --- |
| Préflight (`preflight`) | 337–500 | la sonde, AGT-02 |
| `system` | 505–604 | `core.system` : dpkg réparé, apt, paquets de base, fuseau, swap, garde-fou mémoire, `sysctl` pour les watchers |
| `user` | 608–663 | `core.system` : utilisateur `dev`, sudo sans mot de passe, zsh, `authorized_keys` |
| `runtimes` | 668–760 | `runtime.node`, `runtime.java`, `runtime.python` via mise ; `.zshenv` lu par les shells non interactifs |
| `database` | 765–903 | `db.mysql` ; modèle pour `db.postgres`, `db.mongodb`, `db.redis` : liaison `127.0.0.1`, comptes, import des dumps (`import_dumps`, 870) |
| `secrets` | 912–1008 | `tool.1password`, `tool.github`, `tool.neon` |
| `tunnel` | 1017–1215 | `exposure.cloudflare` : tunnel, `write_ingress` (1177), DNS |
| `gallery` | 1220–1308 | `ai.browser` : Chrome headless, `shot`, serveur de galerie |
| `agents` | 1313–1368 | `ai.claude`, `ai.codex` : installation, contexte machine |
| `skills` | 1378–1445 | `ai.*` : skills Pupitre dans `~/.agents/skills`, liens pour Claude Code |
| `projects` | 1450–1535 | registre et `project.env`, AGT-10 |
| `tooling` | 1540–1637 | `core.system` : `.zshrc` de `dev`, marqueurs OSC 133 (`server/bin/pupitre.zsh`), commande `dev` → `pupitred dev`, AGT-12 |
| `harden` | 1642–1686 | `core.hardening` : ufw, fail2ban, root fermé **seulement si** `authorized_keys` de `dev` est non vide, `sshd -t` avant `reload` |
| Rapport (`report`) | 1691–1750 | le rapport JSON du moteur : `failed[]` avec rejeu, `warned[]`, adresses |

Ce qu'on garde de la spec : l'ordre des étapes, les options apt, les fichiers écrits et leurs chemins, la condition de fermeture de root, les marqueurs d'idempotence. Ce qu'on ne garde pas : les variables `STACK_*`, `/etc/dev-stack.env`, `/var/lib/dev-stack` — le module lit ses valeurs du manifeste et écrit sous `/etc/pupitre/` et `/var/lib/pupitre/`.

## Exemple complet : `db.redis`

Catalogue : `db.redis`, « local seulement, mot de passe, persistance », champ `password`, après le MVP. Le module installe `redis-server` d'Ubuntu, écrit une configuration incluse depuis `/etc/redis/redis.conf`, range le mot de passe dans `/etc/pupitre/env`, active l'unité.

`internal/modules/db/redis/manifest.go` :

```go
package redis

import "pupitre.sh/agent/internal/contract"

const ID = "db.redis"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "database",
		Name:      "Redis 7",
		Summary:   "Cache et files d'attente, local seulement, avec mot de passe et persistance.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 128, DiskMB: 64},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "password", Kind: "secret", Label: "Mot de passe", Required: true, Generate: true},
		},
		Provides:  []string{"db:redis"},
		Mandatory: false,
		Since:     "0.2.0",
	}
}
```

`internal/modules/db/redis/module.go` :

```go
package redis

import (
	"fmt"
	"strings"

	"pupitre.sh/agent/internal/contract"
	"pupitre.sh/agent/internal/modules"
	"pupitre.sh/agent/internal/sys/apt"
	"pupitre.sh/agent/internal/sys/env"
	"pupitre.sh/agent/internal/sys/file"
	"pupitre.sh/agent/internal/sys/systemd"
	"pupitre.sh/agent/internal/sys/user"
)

const (
	pkg      = "redis-server"
	unit     = "redis-server"
	confPath = "/etc/redis/redis.conf"
	dropIn   = "/etc/redis/pupitre.conf"
	envKey   = "REDIS_PASSWORD"
	port     = 6379
)

const configTemplate = `bind 127.0.0.1 ::1
port %d
protected-mode yes
requirepass %s
appendonly yes
appendfsync everysec
maxmemory-policy noeviction
`

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Check, error) {
	if !apt.Installed(ctx, pkg) {
		return modules.Check{Installed: false}, nil
	}

	version, err := redisVersion(ctx)
	if err != nil {
		return modules.Check{}, err
	}

	return modules.Check{Installed: true, Version: version, Configured: file.Exists(dropIn)}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-package", func() (modules.Outcome, error) {
		if apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, pkg)
	})
}

func (Module) Configure(ctx *modules.Context) error {
	content := renderConfig(ctx.Secret("password"))
	changed := false

	if err := ctx.Step("write-config", func() (modules.Outcome, error) {
		if file.Same(dropIn, content) {
			return modules.Skipped, nil
		}

		if err := file.WriteAtomic(dropIn, content, 0o640); err != nil {
			return modules.Failed, err
		}

		changed = true
		return modules.Done, file.Chown(dropIn, "root", "redis")
	}); err != nil {
		return err
	}

	if err := ctx.Step("include-config", func() (modules.Outcome, error) {
		added, err := file.EnsureLine(confPath, "include "+dropIn)
		if err != nil {
			return modules.Failed, err
		}

		if !added {
			return modules.Skipped, nil
		}

		changed = true
		return modules.Done, nil
	}); err != nil {
		return err
	}

	if err := ctx.Step("store-password", func() (modules.Outcome, error) {
		return modules.Done, env.Set(ctx, envKey, ctx.Secret("password"))
	}); err != nil {
		return err
	}

	if err := ctx.Step("enable-service", func() (modules.Outcome, error) {
		if systemd.Active(ctx, unit) && !changed {
			return modules.Skipped, nil
		}

		if err := systemd.Enable(ctx, unit); err != nil {
			return modules.Failed, err
		}

		return modules.Done, systemd.Restart(ctx, unit)
	}); err != nil {
		return err
	}

	return ctx.Step("verify-auth", func() (modules.Outcome, error) {
		out, err := user.Run(ctx, "root", "redis-cli", "-a", ctx.Secret("password"), "--no-auth-warning", "ping")
		if err != nil || strings.TrimSpace(out) != "PONG" {
			return modules.Failed, fmt.Errorf("redis refuse le mot de passe : journalctl -u %s -n 40", unit)
		}

		return modules.Done, nil
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-package", func() (modules.Outcome, error) {
		upgraded, err := apt.Upgrade(ctx, pkg)
		if err != nil {
			return modules.Failed, err
		}

		if !upgraded {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("stop-service", func() (modules.Outcome, error) {
		if !systemd.Active(ctx, unit) {
			return modules.Skipped, nil
		}

		return modules.Done, systemd.Disable(ctx, unit)
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-package", func() (modules.Outcome, error) {
		if !apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, pkg)
	}); err != nil {
		return err
	}

	return ctx.Step("forget-password", func() (modules.Outcome, error) {
		return modules.Done, env.Unset(ctx, envKey)
	})
}

func (Module) Status(ctx *modules.Context) (contract.ServiceStatus, error) {
	version, err := redisVersion(ctx)
	if err != nil {
		return contract.ServiceStatus{}, err
	}

	return contract.ServiceStatus{
		ID:          ID,
		State:       systemd.State(ctx, unit),
		Version:     version,
		Port:        port,
		Unit:        unit,
		Credentials: []contract.Credential{{Label: "Mot de passe", EnvKey: envKey}},
	}, nil
}

func renderConfig(password string) []byte {
	return []byte(fmt.Sprintf(configTemplate, port, password))
}

func redisVersion(ctx *modules.Context) (string, error) {
	out, err := user.Run(ctx, "root", "redis-server", "--version")
	if err != nil {
		return "", err
	}

	for _, field := range strings.Fields(out) {
		if v, ok := strings.CutPrefix(field, "v="); ok {
			return v, nil
		}
	}

	return "", fmt.Errorf("version illisible : %q", out)
}
```

Ce que l'exemple montre : `verify-auth` passe le mot de passe en argument à `redis-cli` par `argv`, et `user.Run` ne journalise que le nom du programme quand un argument est un secret connu du contexte ; `Uninstall` ne touche pas à `/var/lib/redis`, qui appartient au client ; `Status` cite la clé d'environnement, jamais la valeur ; `Credentials` reste masqué dans `service.status`.

`internal/modules/db/redis/module_test.go` :

```go
package redis

import (
	"strings"
	"testing"

	"pupitre.sh/agent/internal/modules"
	"pupitre.sh/agent/internal/modules/modtest"
)

const password = "s3cret-de-test"

func TestInstallAndConfigureAreIdempotent(t *testing.T) {
	sys := modtest.NewFakeSys()
	sys.Packages[pkg] = "7.0.15"
	sys.Files[dropIn] = renderConfig(password)
	sys.Files[confPath] = []byte("include " + dropIn + "\n")
	sys.Units[unit] = modtest.UnitActive
	sys.Replies["redis-cli"] = "PONG\n"
	ctx := modtest.NewContext(t, sys, modtest.Secrets{"password": password})

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, event := range ctx.Events() {
		if event.Step != "store-password" && event.Step != "verify-auth" && event.Status != "skip" {
			t.Fatalf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
	if sys.Restarts[unit] != 0 {
		t.Fatalf("redis restarted %d times on an installed machine", sys.Restarts[unit])
	}
}

func TestSecretNeverLeaks(t *testing.T) {
	sys := modtest.NewFakeSys()
	sys.Packages[pkg] = "7.0.15"
	sys.Replies["redis-cli"] = "PONG\n"
	ctx := modtest.NewContext(t, sys, modtest.Secrets{"password": password})

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, password) {
			t.Fatalf("secret in output: %s", line)
		}
	}
	if !strings.Contains(string(sys.Files[dropIn]), "requirepass "+password) {
		t.Fatal("config must carry the password")
	}
	if sys.Env[envKey] != password {
		t.Fatal("password must be stored in /etc/pupitre/env")
	}
}

func TestFailedStepReportsReplay(t *testing.T) {
	sys := modtest.NewFakeSys()
	sys.FailPackage(pkg, "E: Unable to locate package redis-server")
	ctx := modtest.NewContext(t, sys, nil)

	err := (Module{}).Install(ctx)
	if err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != "fail" || last.Replay != "sudo pupitred install db.redis" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

var _ modules.Module = Module{}
```

Le système factice enregistre les commandes, les fichiers, les unités et l'environnement ; il ne touche jamais à la machine qui exécute `go test`. Trois tests minimum par module : idempotence sur une machine installée, aucun secret dans la sortie, échec d'une étape avec sa commande de rejeu.

## Test de staging

Un module sans test de staging n'est pas fini (`apps/agent/CLAUDE.md`). Le staging est un VPS réinstallable, jamais la machine du propriétaire.

`apps/agent/test/staging/db_test.go` :

```go
//go:build staging

package staging

import (
	"strings"
	"testing"
)

func TestRedisListensLocallyWithPassword(t *testing.T) {
	host := stagingHost(t)
	install(t, host, "db.redis", secrets{"password": "s3cret-de-test"})

	listening := ssh(t, host, "ss", "-ltn")
	if !strings.Contains(listening, "127.0.0.1:6379") || strings.Contains(listening, "0.0.0.0:6379") {
		t.Fatalf("redis must listen on 127.0.0.1 only:\n%s", listening)
	}

	if out := ssh(t, host, "redis-cli", "ping"); !strings.Contains(out, "NOAUTH") {
		t.Fatalf("redis must require a password, got %q", out)
	}

	report := lastReport(t, host)
	if strings.Contains(report, "s3cret-de-test") {
		t.Fatal("password leaked into the report")
	}
}
```

- `stagingHost(t)` lit `PUPITRE_STAGING_HOST` (`root@203.0.113.10`) et appelle `t.Skip` si elle est absente, pour que `go test ./...` reste vert sur un poste sans staging. La clé SSH est celle de l'agent SSH local.
- Le tag de build `staging` sépare ces tests de l'unitaire : `go test -tags staging ./test/staging/...`.
- Avant une campagne : `bun --cwd=apps/agent run staging:reset` réinstalle le VPS depuis une image Ubuntu vierge et y pousse le binaire fraîchement construit. Le nom de la variable et le script `staging:reset` sont livrés par AGT-02 ou AGT-03 ; si leurs noms diffèrent, ce skill se met à jour.
- Les helpers `install`, `ssh`, `lastReport` vivent dans `test/staging/staging_test.go` et parlent au staging par le même protocole que l'app.

## Avant de passer la tâche en « en revue »

1. Le manifeste correspond ligne à ligne à `docs/contracts/service-catalog.md` : id, catégorie, champs, `requires`, `conflicts`, `provides`.
2. Chaque étape a un nom, vérifie avant d'agir, et `install` rejoué sur le staging n'émet que des `skip`.
3. Aucun `sh -c`, aucun script écrit sur le disque, aucun secret dans `ctx.Output()`, le rapport ou une erreur.
4. `Uninstall` ne retire que ce que le module a installé.
5. Trois tests unitaires sur `modtest`, un test de staging par critère d'acceptation.
6. `bun --cwd=apps/agent run lint` (`gofmt`, `go vet`, `staticcheck`), `go test ./...` et `go test -tags staging ./test/staging/...` verts.
7. Le module lit `server/bootstrap.sh` comme une spécification et n'en importe rien.
