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
| `apps/agent/internal/modules/` | l'interface `Module`, le `Context`, le registre, le moteur, le journal (AGT-03) |
| `apps/agent/internal/modules/modtest/` | `FakeSys`, `NewContext`, les modules de démonstration `Passing` et `Failing` |
| `apps/agent/internal/sys/{apt,systemd,file,user,env}/` | les helpers système, tous sur `sys.Context` |
| `apps/agent/internal/contract/schema.json` | le JSON Schema exporté de `packages/shared` ; les types Go en dérivent |
| `apps/agent/test/staging/<catégorie>_test.go` | les tests d'intégration contre le VPS de staging |
| `apps/agent/package.json` | `build`, `test`, `lint`, `staging:reset` |
| `server/bootstrap.sh`, `server/bin/dev`, `docs/SETUP.md` | la spécification des étapes, en bash ; jamais une dépendance |
| `docs/contracts/service-catalog.md` | manifeste, catégories, champs, préréglages |
| `docs/contracts/agent-protocol.md` | `install`, `uninstall`, `upgrade`, `report`, événements `step`, flux secret |

## État du dépôt

Au 2026-09-04, AGT-03 est fusionnée : `apps/agent/internal/modules` contient l'interface `Module`, le `Context`, le registre, le moteur (`Install`, `Upgrade`, `Uninstall`, `Report`, `Catalog`) et le journal ; `internal/sys` contient les cinq helpers ; `modtest` contient le système factice. Les signatures ci-dessous sont celles du code livré, `modtest/passing.go` en est la référence exécutable. Aucun module du catalogue n'existe encore. `apps/agent/test/staging/` et `staging:reset` n'existent pas : la section « Test de staging » décrit la cible, la tâche qui livre le premier module livre aussi le harnais.

## Interdictions

Tirées de `apps/agent/CLAUDE.md` et `docs/security.md`. Une PR qui viole l'une d'elles est refusée.

- **Aucun script déposé sur le disque du client.** Pas de `.sh`, pas de fichier source, pas d'archive. Un binaire, `/etc/pupitre/` en 0600 root, des unités systemd générées, des fichiers de configuration.
- **Aucun `os/exec` avec une chaîne construite.** Toujours un `argv` : `user.Run(ctx, "dev", "redis-cli", "ping")`. Jamais `sh -c` avec une valeur venue du protocole, d'un manifeste ou d'un fichier.
- **Aucun secret journalisé.** Ni dans `/var/log/pupitre.log`, ni dans un événement `step`, ni dans le rapport, ni dans une erreur. Le journal remplace par `[secret]` toute valeur secrète connue du contexte ; on n'écrit quand même jamais un secret dans un message.
- **Aucune connexion entrante, aucun appel réseau hors HTTPS sortant** vers la plateforme ou un dépôt de paquets.
- **Rien sans droit d'usage valide** : le moteur refuse `install` avec `entitlement_required` ; un module ne contourne pas ce contrôle.
- **Le contrat vient de `packages/shared`** par `internal/contract/schema.json` : on ne redéclare pas un type du protocole ou du manifeste à la main.

## Anatomie d'un module

```
internal/modules/db/redis/
├── manifest.go      le manifeste et l'identifiant
├── module.go        le type, init() qui l'enregistre, les sept méthodes, les étapes
└── module_test.go   idempotence, absence de secret, échec d'une étape
```

Le dossier suit la catégorie du manifeste : `core/`, `runtime/`, `db/`, `ai/`, `editor/`, `exposure/`, `tool/`. L'identifiant est `<catégorie>.<nom>` (`db.redis`), la catégorie du manifeste est celle du contrat (`database`). `modules.Register(Module{})` dans `init()` valide le manifeste contre le schéma et refuse un doublon.

### L'interface

```go
type Module interface {
	Manifest() contract.Manifest
	Check(ctx *Context) (Status, error)
	Install(ctx *Context) error
	Configure(ctx *Context) error
	Upgrade(ctx *Context) error
	Uninstall(ctx *Context) error
	Status(ctx *Context) (Status, error)
}

type Status struct {
	Installed   bool
	Configured  bool
	Version     string
	Upgradable  bool
	State       contract.ServiceState
	Port        int
	Unit        string
	Credentials map[string]string
}
```

| Méthode | Fait | Ne fait pas |
| --- | --- | --- |
| `Manifest` | renvoie le manifeste, constant | lire le système |
| `Check` | renseigne `Installed`, `Version`, `Configured`, `Upgradable` ; sert à la sonde, au rejeu et à `upgrade` | modifier quoi que ce soit |
| `Install` | paquets, binaires, dossiers | la configuration qui dépend des valeurs de l'utilisateur |
| `Configure` | fichiers de configuration, comptes, secrets, unité systemd | réinstaller |
| `Upgrade` | met à jour le paquet ou la version, puis rejoue `Configure` | changer les valeurs choisies |
| `Uninstall` | retire ce que le module a installé : paquet, configuration, clé de `/etc/pupitre/env` | toucher aux données ou à ce que le client a installé lui-même |
| `Status` | complète `Check` avec `State`, `Port`, `Unit` et `Credentials`, dont les valeurs sont des **clés** de `/etc/pupitre/env`, jamais des secrets | déclencher une action |

`Status.Service(manifest)` convertit un `modules.Status` en `contract.ServiceStatus` pour `service.status` et `snapshot` ; un module ne construit pas ce type lui-même.

Le moteur résout `requires` et `conflicts`, ordonne, enchaîne `Install` puis `Configure` pour chaque module demandé, et écrit le rapport dans `/var/lib/pupitre/report.json`. `upgrade` ne touche que les modules dont `Check` dit `Installed`. Un module ne parle jamais à un autre module : ce dont il a besoin, il le déclare dans `requires`.

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

`ctx.Step` émet l'événement `step` du protocole avec `status: "start"`, puis `"ok"`, `"skip"` ou `"fail"`, et la durée `ms`. Une étape qui échoue (`Failed`, une erreur, ou une panique) arrête **ce module**, le note dans `failed[]` avec sa commande de rejeu `sudo pupitred install --only=db.redis`, et renvoie une `*modules.StepError` ; les modules suivants continuent. Un problème non bloquant se signale par `ctx.Warn("…")`, qui alimente `warned[]` et passe le module en `warn`. C'est la comptabilité de `server/bootstrap.sh` (`fail`, `soft`, lignes 140 à 157), transposée.

Noms d'étapes en kebab-case, un verbe et un objet : `install-package`, `write-config`, `create-app-user`, `enable-service`, `import-dumps`. Une étape qui dépasse une vingtaine de lignes se découpe.

`ctx.Once("apt-update", fn)` n'exécute `fn` qu'une fois par installation, tous modules confondus ; `ctx.Logf` écrit dans le journal du module.

### Valeurs et secrets

Les champs du manifeste arrivent dans le contexte : `ctx.Value("engine")`, `ctx.String`, `ctx.Int`, `ctx.Bool` pour `text`, `number`, `select`, `version`, `boolean`, avec le `default` du manifeste quand l'app n'a rien envoyé ; `ctx.Secret("password")` pour `secret`.

Un secret vient du flux secret du protocole, jamais de `params`. La ligne secrète d'`install` a la forme de `config`, groupée par identifiant de module (schéma `InstallSecrets` de `docs/contracts/agent-protocol.md`) :

```json
{ "db.redis": { "password": "…" }, "db.postgres": { "app_password": "…" } }
```

Le moteur ne donne à chaque module que sa propre entrée ; une ligne mal formée est refusée en `bad_request` avant toute installation. Le moteur conserve modules, `config` et secrets dans `/etc/pupitre/install.json` (0600 root) pour que `sudo pupitred install --only=<module>` rejoue avec les mêmes valeurs ; un module ne lit pas ce fichier.

Un secret s'écrit dans `/etc/pupitre/env` par `env.Set(ctx, "REDIS_PASSWORD", value)`, qui renvoie `(changed, err)` — `changed` vaut `false` si la valeur y est déjà, ce qui donne le `Skipped` de l'étape — et dans le fichier de configuration qui en a besoin, en 0600 ou 0640 root ; il n'apparaît nulle part ailleurs. Un champ `secret` avec `generate: true` arrive déjà généré par l'app.

### Les helpers `internal/sys`

Tous prennent `ctx` en premier argument : un `sys.Context` (`Sys()`, `Logf`, `Once`), que `*modules.Context` satisfait. Ils journalisent la commande et le chemin, jamais un contenu.

| Package | Fonctions | Ce qu'il garantit |
| --- | --- | --- |
| `apt` | `Installed(ctx, pkg) bool`, `Version(ctx, pkg) (string, error)`, `Update(ctx) error`, `Install(ctx, pkgs...) error`, `Remove(ctx, pkgs...) error`, `Upgrade(ctx, pkg) (bool, error)` | `-o DPkg::Lock::Timeout=600 -o Dpkg::Use-Pty=0`, `DEBIAN_FRONTEND=noninteractive`, `-y -qq` ; attend le verrou d'`unattended-upgrades` au lieu d'échouer (`bootstrap.sh` ligne 80) ; `Upgrade` dit si une nouvelle version a été posée |
| `systemd` | `Enable(ctx, unit)`, `Disable(ctx, unit)`, `Restart(ctx, unit)`, `Reload(ctx, unit)`, `Active(ctx, unit) bool`, `State(ctx, unit) contract.ServiceState`, `WriteUnit(ctx, name, content []byte) error` | `enable --now`, `daemon-reload` après `WriteUnit`, état lu par `is-active` |
| `file` | `Read(ctx, path) ([]byte, error)`, `Exists(ctx, path) bool`, `Same(ctx, path, content []byte) bool`, `WriteAtomic(ctx, path, content []byte, mode) error`, `EnsureLine(ctx, path, line) (bool, error)`, `Chown(ctx, path, owner, group) error`, `Remove(ctx, path) (bool, error)` | écriture dans un temporaire du même dossier puis `rename` ; `Same` compare le contenu pour rendre l'étape idempotente ; `EnsureLine` et `Remove` disent s'ils ont changé quelque chose |
| `user` | `Home(name) string`, `Run(ctx, name, argv...) (string, error)`, `Exists(ctx, name) bool`, `Create(ctx, name, shell) error`, `Groups(ctx, name) ([]string, error)` | `Run` exécute avec l'environnement complet de l'utilisateur (`HOME`, `PATH` de mise et de bun, `MISE_YES=1`, `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`), `argv` seulement, renvoie la sortie standard ; la commande et sa sortie sont journalisées, secrets masqués |
| `env` | `Get(ctx, key) (string, bool, error)`, `Keys(ctx) ([]string, error)`, `Set(ctx, key, value) (bool, error)`, `Unset(ctx, key) (bool, error)` | `/etc/pupitre/env` en 0600 root, clés `^[A-Z][A-Z0-9_]*$`, valeurs jamais journalisées ; `Set` et `Unset` disent si le fichier a changé |

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

import "pupitre.studio/agent/internal/contract"

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
			{Key: "password", Kind: contract.FieldSecret, Label: "Mot de passe", Required: true, Generate: true},
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

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
	"pupitre.studio/agent/internal/sys/user"
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

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !apt.Installed(ctx, pkg) {
		return modules.Status{}, nil
	}

	version, err := apt.Version(ctx, pkg)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Version: version, Configured: file.Exists(ctx, dropIn)}, nil
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
		if file.Same(ctx, dropIn, content) {
			return modules.Skipped, nil
		}

		if err := file.WriteAtomic(ctx, dropIn, content, 0o640); err != nil {
			return modules.Failed, err
		}

		changed = true

		return modules.Done, file.Chown(ctx, dropIn, "root", "redis")
	}); err != nil {
		return err
	}

	if err := ctx.Step("include-config", func() (modules.Outcome, error) {
		added, err := file.EnsureLine(ctx, confPath, "include "+dropIn)
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
		stored, err := env.Set(ctx, envKey, ctx.Secret("password"))
		if err != nil {
			return modules.Failed, err
		}

		if !stored {
			return modules.Skipped, nil
		}

		return modules.Done, nil
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

	if err := ctx.Step("remove-config", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, dropIn)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return ctx.Step("forget-password", func() (modules.Outcome, error) {
		removed, err := env.Unset(ctx, envKey)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = systemd.State(ctx, unit)
	status.Port = port
	status.Unit = unit
	status.Credentials = map[string]string{"Mot de passe": envKey}

	return status, nil
}

func renderConfig(password string) []byte {
	return []byte(fmt.Sprintf(configTemplate, port, password))
}
```

Ce que l'exemple montre : `verify-auth` passe le mot de passe en argument à `redis-cli` par `argv`, et le journal remplace la valeur par `[secret]` dans la commande et sa sortie ; `store-password` s'appuie sur le `changed` d'`env.Set` pour être `skip` au rejeu ; `Uninstall` ne touche pas à `/var/lib/redis`, qui appartient au client ; `Status` cite la clé d'environnement, jamais la valeur, et le moteur construit `service.status` par `status.Service(manifest)`.

`internal/modules/db/redis/module_test.go` :

```go
package redis

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
)

const password = "s3cret-de-test"

func newContext(t *testing.T, sys *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, sys, modtest.Options{
		Manifest: manifest(),
		Secrets:  modtest.Secrets{"password": password},
	})
}

func TestInstallAndConfigureAreIdempotent(t *testing.T) {
	sys := modtest.NewFakeSys()
	sys.Packages[pkg] = "7.0.15"
	sys.Files[dropIn] = renderConfig(password)
	sys.Files[confPath] = []byte("include " + dropIn + "\n")
	sys.Files["/etc/pupitre/env"] = []byte(envKey + "=" + password + "\n")
	sys.Units[unit] = modtest.UnitActive
	sys.Replies["redis-cli"] = "PONG\n"
	ctx := newContext(t, sys)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, event := range ctx.Events() {
		if event.Step != "verify-auth" && event.Status != contract.StepSkip {
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
	ctx := newContext(t, sys)

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
	if sys.EnvValue(envKey) != password {
		t.Fatal("password must be stored in /etc/pupitre/env")
	}
}

func TestFailedStepReportsReplay(t *testing.T) {
	sys := modtest.NewFakeSys()
	sys.FailPackage(pkg, "E: Unable to locate package redis-server")
	ctx := newContext(t, sys)

	err := (Module{}).Install(ctx)
	if err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=db.redis" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

var _ modules.Module = Module{}
```

`modtest.NewContext(t, sys, modtest.Options{…})` prend le manifeste (`Manifest`, ou `Module` pour un simple identifiant), les valeurs (`Values`), les secrets (`Secrets`), un `Emit` optionnel et une horloge `Now` ; sans `Now`, l'horloge avance de 10 ms par lecture. `FakeSys` enregistre les commandes (`Calls`, `Commands()`), les fichiers (`Files`, `Modes`, `Owners`), les paquets (`Packages`, `Upgrades`, `FailPackage`), les unités (`Units`, `Restarts`), les réponses par programme (`Replies`, `FailProgram`) et lit `/etc/pupitre/env` par `EnvValue` ; il ne touche jamais à la machine qui exécute `go test`. `ctx.Events()` renvoie les événements `ok`, `skip` et `fail` (pas les `start`), `ctx.Output()` les lignes du journal, secrets déjà masqués. Trois tests minimum par module : idempotence sur une machine installée, aucun secret dans la sortie, échec d'une étape avec sa commande de rejeu.

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
- Avant une campagne : `bun --cwd=apps/agent run staging:reset` réinstalle le VPS depuis une image Ubuntu vierge et y pousse le binaire fraîchement construit. Ni le harnais, ni `staging:reset` n'existent au 2026-09-04 : la tâche qui livre le premier module les livre, et ce skill se met à jour avec les noms retenus.
- Les helpers `install`, `ssh`, `lastReport` vivent dans `test/staging/staging_test.go` et parlent au staging par le même protocole que l'app, ligne secrète comprise.

## Avant de passer la tâche en « en revue »

1. Le manifeste correspond ligne à ligne à `docs/contracts/service-catalog.md` : id, catégorie, champs, `requires`, `conflicts`, `provides`.
2. Chaque étape a un nom, vérifie avant d'agir, et `install` rejoué sur le staging n'émet que des `skip`.
3. Aucun `sh -c`, aucun script écrit sur le disque, aucun secret dans `ctx.Output()`, le rapport ou une erreur.
4. `Uninstall` ne retire que ce que le module a installé.
5. Trois tests unitaires sur `modtest`, un test de staging par critère d'acceptation.
6. `bun --cwd=apps/agent run lint` (`gofmt`, `go vet`), `go test ./...` et `go test -tags staging ./test/staging/...` verts.
7. Le module lit `server/bootstrap.sh` comme une spécification et n'en importe rien.
