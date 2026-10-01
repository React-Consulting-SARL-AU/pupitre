---
name: config-migrations
description: "Faire passer une configuration d'une version à la suivante sans réinstaller — registre numéroté de l'agent dans `apps/agent/internal/migrate/migrations.go` et des fichiers de l'app dans `apps/desktop/src/main/*-migrations.ts`, `Touches`, JSON brut plutôt qu'un type d'aujourd'hui, idempotence, sauvegarde et remise en l'état, `agent.migrate`, `pupitred migrate`, refus `migration_required`. À utiliser dès qu'on renomme un champ, scinde un module, change une valeur par défaut ou touche à la forme d'un fichier que l'agent ou l'app relit."
---

# Migrations de configuration

Une mise à jour ne réinstalle rien. Le binaire de l'agent est remplacé, l'app se met à jour, et les fichiers qu'ils lisent restent là où ils sont. **Un binaire ne lit jamais une configuration qu'il n'a pas migrée** — c'est la règle, et ce skill dit ce qu'il en coûte de la tenir.

Contrat de référence : [`docs/contracts/config-migrations.md`](../../../docs/contracts/config-migrations.md). Le lire avant d'écrire.

## Quand ce skill s'applique

Dès qu'un changement touche la **forme** de ce qui est déjà écrit sur une machine ou un laptop :

- un champ de manifeste renommé, supprimé, ou dont le type change — les valeurs sont dans `install.json` ;
- un identifiant de module qui bouge, un module scindé en deux, deux modules fusionnés ;
- une valeur par défaut qui change de sens (pas qui change de valeur : un défaut est appliqué à la lecture, il ne se migre pas) ;
- une clé de `/etc/pupitre/env` renommée ;
- un champ ajouté, retiré ou déplacé dans `projects.local.json` ;
- un champ de `servers.json`, `account.json`, `transfers.json`, `forwards.json` ou `preferences.json` côté app.

Ce skill **ne** s'applique **pas** à :

| Cas | Où ça se règle |
| --- | --- |
| Un fichier qu'un module écrit (Caddy, unité systemd, conf d'un service) | l'`Upgrade` de ce module, qui le réécrit depuis ses valeurs |
| Le schéma de la base de la plateforme | migrations Prisma, `bun run db:migrate` |
| Un champ **ajouté** à un résultat du protocole | rien : le contrat le permet, l'app le lit optionnel |
| Un champ retiré ou renommé **dans le protocole** | la feuille de compatibilité (`packages/shared/src/compat`) et l'entier `protocol` |

Un changement peut appeler les deux : renommer un champ dans le manifeste **et** dans le protocole. Ce sont deux gestes distincts, dans deux registres distincts.

## Fichiers gouvernés

| Fichier | Rôle |
| --- | --- |
| `apps/agent/internal/migrate/migrations.go` | la liste des migrations de l'agent, dans l'ordre |
| `apps/agent/internal/migrate/migrate.go` | le moteur : révision, verrou, lot, remise en l'état |
| `apps/agent/internal/migrate/paths.go` | les `Target` et leur résolution |
| `apps/agent/internal/migrate/migrate_test.go` | les tests du moteur ; un test par migration s'y ajoute |
| `apps/agent/internal/i18n/catalog_migrate.go` | toutes les phrases de la migration, FR et EN |
| `apps/desktop/src/main/store-migrations.ts` | le moteur côté app |
| `apps/desktop/src/main/servers-migrations.ts`, `account-migrations.ts`, `transfers-migrations.ts`, `forwards-migrations.ts`, `preferences-migrations.ts`, `connections-migrations.ts`, `access-migrations.ts` | les listes, un fichier par store ; un store nouveau ajoute le sien ici |
| `packages/shared/src/agent-protocol/migrate.ts` | `ConfigRevision`, `AgentMigrateResult` |
| `docs/contracts/config-migrations.md` | le contrat |

## Les cinq règles

Elles ne se négocient pas.

1. **Idempotente.** Rejouée sur une machine déjà migrée, elle ne change rien. C'est ce qui rend sûre une reprise après coupure.
2. **Sans effet sur un fichier absent.** `ctx.JSON` rend `present == false` : on rend `nil` et on s'arrête.
3. **Du JSON brut, jamais un type d'aujourd'hui.** `map[string]any` côté Go, `JsonObject` côté app. Décoder dans la structure du moment ferait tomber au passage tout champ qu'elle ne nomme plus — précisément ce que la migration existe pour porter. Un test le vérifie.
4. **L'identifiant est fixé pour toujours.** C'est ce que la machine retient. On n'en supprime pas, on n'en réordonne pas, on n'en renumérote pas : on en ajoute.
5. **Elle ne touche que ce qu'elle déclare.** `Touches` est ce qui est sauvegardé avant le lot, donc ce qui peut être remis. Un fichier écrit sans être déclaré ne revient pas.

## Écrire une migration de l'agent

### 1. Le numéro

Le suivant dans `All()`. Jamais un trou, jamais un numéro repris. `Since` porte la version de l'agent qui la publie — documentation seule, rien n'en dépend.

### 2. Le fichier

```go
// apps/agent/internal/migrate/migrations.go
func All() []Migration {
	return []Migration{
		{
			ID:      1,
			Slug:    "rename-timezone",
			Since:   "0.5.0",
			Touches: []Target{TargetInstall},
			Apply:   renameTimezone,
		},
	}
}

// The field was `tz` until 0.5.0, where core.system started calling it what the
// form calls it.
func renameTimezone(ctx *Context) error {
	document, present, err := ctx.JSON(TargetInstall)
	if err != nil || !present {
		return err
	}

	config, _ := document["config"].(map[string]any)
	values, _ := config["core.system"].(map[string]any)

	held, named := values["tz"]
	if !named {
		return nil
	}

	values["timezone"] = held
	delete(values, "tz")

	return ctx.SetJSON(TargetInstall, document)
}
```

Les cibles : `TargetInstall` (`install.json`), `TargetEnv` (`env`), `TargetProjects` (`projects.local.json`), `TargetProjectsConf` (`projects.local.conf`, la forme d'avant la révision 1, que seule la migration 1 lit), `TargetLicense` (`/var/lib/pupitre/license.json`, le cache de licence, sous `PUPITRE_LICENSE_PATH`) et `TargetEntitlement` (`entitlement.json` à côté, sa forme d'avant 2.0.0, que seule la migration 8 lit). Une cible non déclarée se résout sous `/etc/pupitre` par son nom — utile pour un marqueur, à n'employer que si le fichier appartient vraiment au registre et non à un module.

Les helpers du `Context` : `JSON`/`SetJSON` pour un document, `Lines`/`SetLines` pour un fichier en lignes, `Read`/`Write` pour des octets, `Exists`, `Remove`, `Logf`.

### 3. Le test

Dans `migrate_test.go`, trois assertions au minimum :

```go
func TestRenameTimezoneCarriesTheValueOver(t *testing.T) {
	machine := newSys()
	machine.Files[installPath] = []byte(`{"config":{"core.system":{"tz":"UTC"}},"legacy":1}`)

	if _, err := runner(machine, All()...).Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	// la valeur est portée…
	// …le champ que le code d'aujourd'hui ne nomme plus est encore là…
	// …et un second passage ne change rien.
}
```

Le troisième point n'est pas décoratif : c'est l'idempotence, et c'est ce qui casse en premier quand une migration est écrite en pensant à une seule machine.

### 4. Les phrases

Toute phrase visible passe par `internal/i18n/catalog_migrate.go`, FR et EN, ni l'une ni l'autre vide. Une migration n'a normalement rien à dire : son message d'erreur, s'il y en a un, doit nommer le fichier et ce qui n'y était pas.

## Écrire une migration de l'app

```ts
// apps/desktop/src/main/servers-migrations.ts
export const SERVERS_MIGRATIONS: readonly StoreMigration[] = [
  {
    apply: (document) => {
      const servers = Array.isArray(document.servers) ? document.servers : [];

      return {
        ...document,
        servers: servers.map((server) => ({ ...(server as JsonObject), port: 22 })),
      };
    },
    id: 4,
    slug: "port-per-server",
  },
];
```

Mêmes règles. `migrate()` estampille le document à la révision attendue, `keepCopy()` garde le fichier d'avant sous `<fichier>.r<révision>`, et un fichier écrit par une version plus récente de l'app n'est **jamais** réécrit — le rejouer ne le réparerait pas et priverait le lecteur de la version qui, elle, le lit.

Le test va dans `src/main/__tests__/store-migrations.test.ts`.

## Ce que le moteur fait autour

À savoir, pour ne pas le refaire à la main :

- **L'agent migre tout seul** au démarrage de `serve` et de `daemon`, avant de servir la première commande. Le chemin rapide ne prend aucun verrou.
- **Le lot est une transaction** : sauvegarde des cibles et du registre avant, remise en l'état complète si une migration refuse.
- **Le registre est écrit après chaque migration**, pas après le lot : une coupure de courant laisse une machine d'accord avec elle-même.
- **Une machine jamais configurée est estampillée à la révision courante** sans que rien ne tourne.
- **Un serveur en retard refuse** tout ce qui lit ou écrit une configuration, en `migration_required`, et laisse ouvertes la vue de la machine et les sorties (`MIGRATION_COMMANDS`).

## L'ordre d'une mise à jour, côté app

`runAgentUpgrade` fait, dans cet ordre : `agent.upgrade` → **fermeture du canal** (le `serve` qui répond tient encore l'ancien binaire, remplacé par un `rename`) → `agent.migrate` → `upgrade` sur les modules. Ne pas réordonner, ne pas retirer la fermeture.

## Vérifier

```bash
bun run contracts:export
```

```bash
cd apps/agent && go test ./internal/migrate/ ./internal/protocol/ ./cmd/... && bun run lint
```

```bash
bun --cwd=apps/desktop run test && bun --cwd=apps/desktop run build
```

Sur le faux VPS (`apps/agent/test/vps`) ou sur le VPS de staging, la vérification qui compte :

```bash
sudo pupitred migrate --status
```

Elle doit dire la révision, ce qui a été appliqué, ce qui reste dû et les sauvegardes gardées, et sortir en 0 quand la machine est à jour.

## Ce qu'on ne fait pas

- Écrire du code qui lit « les deux formes ». C'est une migration reportée, et elle ne se fait jamais.
- Renuméroter, réordonner ou supprimer une entrée existante.
- Décoder `install.json` dans `modules.Request` à l'intérieur d'une migration.
- Migrer depuis l'app en écrivant des fichiers sur le VPS : l'agent porte ses migrations, l'app les déclenche.
- Restaurer une sauvegarde automatiquement, hors de l'unique exception du contrat : quand `agent.upgrade` remet l'ancien binaire parce que le nouveau ne répond pas à `hello`, le lot que le nouveau venait de sauvegarder avant de migrer est remis, révision comprise — il a quelques secondes, rien n'a été configuré depuis. Toute autre restauration (`pupitred migrate --restore`) est un geste du propriétaire, et ce qui a été configuré depuis part avec.
