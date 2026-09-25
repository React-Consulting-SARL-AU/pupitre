# Monorepo

Même outillage que React-Box, mêmes versions quand elles sont compatibles : ce qui a été vérifié là-bas n'a pas à l'être deux fois.

## Outillage

| Outil | Rôle | Note |
| --- | --- | --- |
| Bun 1.3 | gestionnaire de paquets, runtime des scripts, `bun test` | Bun uniquement, jamais npm ni pnpm. `packageManager` épinglé dans `package.json` |
| Turbo 2 | graphe de tâches, cache, `--affected` | `envMode` strict : une variable non déclarée dans `globalPassThroughEnv` n'atteint aucune tâche |
| Biome via Ultracite | lint et format | `biome.jsonc` racine étend `ultracite/biome/core`, `semicolons: "asNeeded"`. Même épingle qu'React-Box (`7.8.3`) tant que la mise à niveau n'a pas été faite là-bas |
| tsgo | typecheck | `@typescript/native-preview`, TypeScript 6 |
| Husky + commitlint | hooks | pre-commit : `ultracite fix` par workspace sur les fichiers indexés, et seul un fichier entièrement indexé est ré-indexé après la passe — un fichier indexé en partie est formaté sur le disque sans que ses morceaux laissés de côté entrent dans le commit ; pre-push : lint, `check:types`, `test` affectés, que `SKIP_PREPUSH=1` saute quand on sait ce qu'on fait ; commits conventionnels |
| Prisma 7 | schéma et migrations | client généré committé, empreinte `packages/db/src/generated/.prisma-inputs.sha256` vérifiée au lint par `scripts/check-prisma-client-freshness.ts` ; `db:migrate production`, `db:reset production` et `db:seed production` exigent `PUPITRE_ALLOW_MIGRATE_ON=production` sur la ligne de commande |
| Wrangler 4 | Workers, R2, secrets | `secrets.required` déclarés dans `wrangler.jsonc`, vérifiés avant déploiement |
| Go 1.26+ (`apps/agent/go.mod`) | l'agent | `gofmt`, `go vet`, `staticcheck` et `govulncheck` au lint — `go vet` et `staticcheck` une seconde fois avec `-tags dev`, pour que le code du build de développement compile aussi —, `go test` dans les deux variantes aux tests, `go test -race` à la main, `garble` en release. Les trois outils sont épinglés dans `apps/agent/package.json` : `bun --cwd=apps/agent run tools:install` installe `staticcheck` et `govulncheck`, `garble:install` installe garble, tous dans le bin de Go, à mettre dans le `PATH`. Go lui-même est installé par Homebrew sur la machine du propriétaire |
| electron-vite, electron-builder | l'app desktop | bytecode du processus principal, fusibles, signature et notarisation ; un runner par système |

## Développement local

```bash
bun install
bun dev              # site sur :4321, web sur :3000, tunnel de l'agent
bun run dev:desktop  # l'app, pointée sur la console locale
bun run dev:desktop:prod  # l'app, pointée sur app.pupitre.studio : le vrai compte, les vrais serveurs
```

`dev:desktop:prod` est la même app de développement — rechargement à chaud du renderer, traces, devtools — mais dirigée vers la plateforme hébergée par `PUPITRE_PLATFORM_URL`. Elle se conduit alors comme l'app installée : le droit d'usage vient du compte, l'agent poussé sur un serveur nu est la release que la plateforme nomme, et rien n'est accordé par le build lui-même. Elle tient ses données dans `Pupitre Dev (app.pupitre.studio)`, à côté de `Pupitre Dev` (console locale) et de `Pupitre` (l'app installée) : un jeton de l'une n'ouvre rien chez les autres, et les trois peuvent tourner en même temps. Au premier lancement on se connecte par le device flow avec son compte, ce qui enregistre un appareil de plus — sa clé est poussée sur les serveurs du compte à leur prochain battement — et le parcours des flottes ouvre les serveurs déjà enrôlés sans rien réinstaller. C'est ainsi qu'un écran s'essaie sur un vrai VPS sans release ; ce qui n'y est pas essayé, c'est un changement du protocole : l'agent en face est celui de la dernière release. Les préremplissages `PUPITRE_DEV_*` ne s'appliquent qu'à la console locale.

`dev:desktop` et le `build` du desktop construisent d'abord l'agent (`@pupitre/agent#build`, que turbo ne met jamais en cache : le binaire embarque `git describe`, que turbo ne hache pas, et un build repris du cache porterait la version d'un autre commit) : l'app embarque `apps/agent/dist` au démarrage, et c'est ce binaire qu'elle pousse sur un serveur nu. Sans cette dépendance, elle poussait le dernier build manuel, et un écran pouvait attendre un contrat que l'agent installé ne parlait pas encore.

`bun run dev:web` lance Vite et TanStack Start sous le plugin Cloudflare, avec les bindings locaux — la D1 comprise, un fichier SQLite que miniflare tient sous `apps/web/.wrangler/state` et que `dev:prepare` migre. L'agent se teste sur un VPS réinstallable, jamais sur la machine du propriétaire : `PUPITRE_STAGING_HOST=root@<adresse> go test -tags staging ./test/staging/...` depuis `apps/agent`. Sans la variable, ces tests se sautent.

### Lancer un workflow à la main

Les six workflows partent de Cron Triggers, qui ne se déclenchent que sur un Worker déployé : en local, rien ne les appelle jamais. Une ligne révoquée n'y est donc jamais décommissionnée, et tout ce qui dépend d'une échéance reste intestable.

```bash
bun run workflows:run decommission-server
```

Le script frappe le déclencheur interne avec le secret que `dev:prepare` a écrit, et rend l'identifiant de l'instance. Les noms sont ceux de `apps/web/src/workflows/registry.ts`, qui reste la seule liste ; un nom inconnu est refusé par le Worker.

### Poster un email dans la boîte, en local

Email Routing n'existe que sur la zone en ligne : en local, rien n'arrive jamais dans la boîte de la plateforme. `POST /internal/email` ouvre le même chemin que le handler `email` du Worker, derrière le secret des déclencheurs internes.

```bash
curl -X POST http://localhost:3000/internal/email \
  -H "x-pupitre-internal-secret: $INTERNAL_WORKFLOW_SECRET" \
  -H "x-pupitre-envelope-from: camille@exemple.fr" \
  -H "x-pupitre-envelope-to: support@pupitre.studio" \
  -H "content-type: message/rfc822" \
  --data-binary @message.eml
```

Le fil se lit ensuite dans la console, sous `/dashboard/admin`. Ce que devient le message est dans [`contracts/platform-mail.md`](./contracts/platform-mail.md).

### Le temps réel de la boîte, en local

La classe `InboxRealtime` est un Durable Object exporté par `apps/web/src/worker.ts`, comme les workflows ; sa logique est dans `src/realtime/inbox-realtime.ts`. Le plugin Vite Cloudflare porte les Durable Objects en développement : `bun run dev:web` suffit, l'instance est unique (`idFromName("platform")`) et miniflare la tient sous `apps/web/.wrangler/state`.

La console ouvre `GET /api/v1/admin/inbox/events` en WebSocket ; le Worker intercepte ce chemin **avant** Elysia — un routeur Elysia ne peut pas rendre un `101` — résout la session, exige l'appartenance à l'organisation Pupitre, puis passe la requête au stub. L'objet ne garde rien : il accepte la socket en hibernation et diffuse ce qu'une écriture lui pousse sur son chemin interne `/publish`, derrière `INTERNAL_WORKFLOW_SECRET`.

Sans socket, la console reste juste : `INBOX_POLL_INTERVAL_MS` (60 s) rattrape une socket morte, et le harnais e2e, qui n'a pas de Worker, fonctionne ainsi.

### Le tunnel qui rend la console locale joignable

Un VPS ne peut pas atteindre `localhost:3000` : c'est sa propre boucle locale. `bun dev` lance donc `scripts/dev-tunnel.ts`, un tunnel Cloudflare **nommé** — l'adresse ne change pas d'un lancement à l'autre, contrairement à un tunnel jetable.

Le tunnel est géré depuis le tableau de bord et s'exécute depuis son jeton : le script ne fait que `cloudflared tunnel run`, le jeton dans `TUNNEL_TOKEN`. Un jeton désigne un tunnel et rien d'autre, là où `cloudflared tunnel login` liait tout le poste à un seul compte — intenable avec plusieurs projets sur plusieurs tunnels.

| Ce qui existe | Où |
| --- | --- |
| Tunnel `ppt-dev` | Zero Trust → Networks → Tunnels, sur le compte de la zone |
| Nom d'hôte public `dev.pupitre.studio`, chemin `^/api/v1/agent/`, service `http://localhost:3000` | la configuration du tunnel, dans ce tableau de bord ; l'enregistrement CNAME est posé avec lui, et tout autre chemin répond 404 |
| Jeton du tunnel | `PUPITRE_TUNNEL_TOKEN`, dans la note 1Password du poste, injecté par `dev:prepare` |

`apps/web/vite.config.ts` déclare ce nom dans `server.allowedHosts` : Vite refuse par défaut tout hôte qu'il ne connaît pas, et sans cette ligne le tunnel arrive jusqu'à la console pour se faire renvoyer un 403. Pour viser un autre tunnel, `PUPITRE_TUNNEL_TOKEN` et `PUPITRE_TUNNEL_HOSTNAME` suffisent.

Sans jeton le script le dit et s'arrête sans faire échouer `bun dev` — le tunnel ne sert qu'à installer un agent sur un serveur distant.

L'app desktop suit d'elle-même : `agentPlatformUrl()` remplace une console de cet ordinateur par ce nom avant de le donner à l'agent, la console et le flux d'appareil continuant de passer par `localhost:3000`. `PUPITRE_AGENT_PLATFORM_URL` désigne une autre plateforme pour l'agent seul.

## Vérifications

```bash
bun run lint          # boundaries, ultracite, gofmt, go vet, staticcheck, govulncheck
bun run check:types   # tsgo par workspace, les scripts de la racine, go build avec et sans -tags dev
bun run test
bun run build
```

`ci.yml` tourne de deux façons : sur une **pull request** vers `staging` ou `main`, et **appelé par `release.yml`** (`workflow_call`) sur le commit tagué, avant tout build. Un push sur `staging` ne déclenche rien — les minutes se paient, le hook pre-push a déjà passé lint, typecheck et tests affectés, et la release vérifie de toute façon le commit qui part vers `main`. Les workflows tournent sur les runners de **Blacksmith** (app GitHub installée sur l'organisation, labels `blacksmith-*`), pas sur ceux de GitHub, dont la facturation a bloqué une release ; les minutes s'y paient aussi : `ci.yml` tient en un seul job, tout sur Ubuntu, et seule une release — un tag `v*` — occupe un runner macOS ou Windows.

| Job | Quand | Ce qu'il fait |
| --- | --- | --- |
| `quality` | PR vers `staging` ou `main` ; job `ci` de `release.yml` sur le tag | gitleaks sur les commits nouveaux (ceux de la PR, ou `origin/main..HEAD` pour une release) avec `.gitleaks.toml`, migrations appliquées sur une base vide, lint (dont `gofmt`, `go vet`, `staticcheck`, `govulncheck`), typecheck, tests de tous les workspaces (dont `go test`), build hors desktop |

**Ce qui est réellement imposé, et par qui.** `main` n'a **aucune protection côté GitHub** : le dépôt est privé, l'organisation est sur le plan gratuit, et la protection de branche comme les rulesets y répondent 403. Aucun check n'est « requis » au sens de GitHub, et rien n'empêche un humain muni des droits d'écriture de fusionner une pull request rouge. Ce qui tient :

- **Une release ne publie rien sans CI verte.** Dans `release.yml`, le job `ci` appelle `ci.yml` sur le commit tagué ; `agent` en dépend, et tout le reste — signature, seaux, déclaration `stable`, fusion — dépend d'`agent`. Un lint, un typecheck, un test ou gitleaks rouge arrête la release avant la première signature.
- **La fusion dans `main` exige le check.** `bun scripts/release/index.ts merge` lit le commit de tête de la pull request `staging` → `main`, attend jusqu'à cinq minutes le check run `Quality` (ou `CI / Quality`, son nom quand `release.yml` l'appelle) sur ce commit, et refuse de fusionner s'il a échoué, s'il est encore en cours à l'échéance, ou s'il n'existe pas — ce qui arrive quand `staging` a avancé après le tag : ces commits-là n'ont été vérifiés par personne. La fusion se fait avec `--match-head-commit`, donc un push arrivé entre-temps la fait échouer au lieu d'entrer sans vérification.
- **La pull request de la release ne se vérifie pas elle-même.** Elle est ouverte par `GITHUB_TOKEN` ; le run `pull_request` qu'elle provoque attend une approbation que personne ne donne, et expire à la fusion — une croix rouge d'une seconde, « workflow file issue » selon `gh run view`, « required approval but was not approved before it expired » dans l'annotation. Ce n'est pas un échec de la CI : le check qui compte est celui du job `ci` de la release, sur le même commit.
- **Une pull request ouverte à la main** (vers `staging`, ou `staging` → `main` sans release) lance `ci.yml` normalement, mais rien ne bloque sa fusion côté serveur : c'est au propriétaire de ne fusionner qu'au vert.

Ce que la CI ne fait pas, et qui se fait ailleurs : les suites Playwright de la console et de l'app (`bun --cwd=apps/web run test:e2e`, `bun --cwd=apps/desktop run test:e2e`) se passent sur la machine du propriétaire avant une pull request ; `go test -race` se lance à la main depuis `apps/agent` quand une dépendance Go bouge ; aucune couverture n'est mesurée.

Ni macOS ni Windows n'ont de job de CI : l'app s'y construit au moment de la release, `release.yml`, et c'est là qu'elle se voit. Windows n'est de toute façon pas éprouvé : le modèle SSH de l'app — une session maître multiplexée par serveur, clés et sockets en 0600 — n'a pas d'équivalent sur OpenSSH pour Windows ; ça devient une tâche le jour où Windows en est une.

Les actions des workflows sont épinglées par SHA, la version en commentaire à côté ; elles avancent à la main, quand on le décide. Il n'y a pas de Dependabot : ses pull requests n'étaient suivies par personne.

Trois workspaces passent `--timeout=60000` à `bun test` : `apps/web`, `apps/desktop` et `packages/api`. Leurs tests construisent d'abord la base du harnais, un fichier SQLite sur lequel toutes les migrations de `packages/db/migrations` sont rejouées avant le premier cas : les cinq secondes que `bun test` accorde par défaut ne laissent pas de marge à un runner froid.

## Frontières de workspace

`scripts/assert-package-boundaries.ts` refuse : un import entre deux `apps/*` ; un import de `@pupitre/api/lib/*` hors de `packages/api` ; un import des entrées Prisma Node dans `packages/api/src`, `apps/web/src` ; un import de `packages/shared` depuis `apps/agent` autrement que par le JSON Schema exporté.

## Secrets

- Jamais dans le dépôt. Le hook pre-commit (`scripts/assert-no-secrets.ts`) refuse toute chaîne ressemblant à une clé API, un jeton ou une clé privée, sur la machine où il est installé ; gitleaks, binaire épinglé par empreinte, relit en CI les commits nouveaux avec `.gitleaks.toml`, qui sert aussi à relire tout l'historique à la main (`gitleaks git --redact .`). La *push protection* de GitHub n'est pas là pour rattraper un oubli : sur un dépôt privé, elle demande GitHub Secret Protection, que le plan actuel n'a pas.
- Local : `bun run dev:prepare` prépare `.env.local` et les liens que chaque outil attend. Les trois commandes de développement l'appellent d'abord, donc il n'y a rien à lancer à la main. Il ne remplace jamais une valeur déjà écrite : un `.env.local` renseigné reste tel quel.
- **Ce qui se dérive n'est pas stocké.** La base n'a pas d'adresse : c'est un binding. `BETTER_AUTH_SECRET` et `INTERNAL_WORKFLOW_SECRET` sont tirés au hasard par poste, puisqu'ils n'ont pas à être partagés.
- **Ce qui se tire ne se tape pas.** Les secrets qu'on fabrique soi-même — ceux-là pour chaque environnement en ligne, et le `PUPITRE_PUBLISH_TOKEN` commun aux notes des environnements et à celle de la release — sont tirés et déposés dans les notes 1Password par `bun run secrets:draw` (`scripts/draw-secrets.ts`), jamais par `openssl` et un copier-coller. Un champ déjà rempli reste tel quel ; on le vide dans 1Password pour le faire retirer. Un nouveau secret de cette famille s'ajoute à la liste du script, pas à une consigne.
- **Ce qui ne se dérive pas vient de 1Password.** `.env.1password.tpl` est le modèle committé, avec des références `op://` et aucune valeur ; le coffre et la note de chaque environnement sont dans `environments.json` — le poste lit celle de `local` — surchargeables par `OP_VAULT` et `OP_ITEM`. `op inject` échoue en bloc si un champ manque, donc une clé reste **en commentaire** tant que son champ n'existe pas dans la note.
- **Rien n'est bloquant.** `op` absent, session fermée ou champ manquant : le script le dit et retombe sur ce que `.env.local` porte déjà.
- **`secrets.required` de `wrangler.jsonc` fait deux choses à la fois**, et c'est un piège : Cloudflare ne charge dans le Worker local **que** les clés qui y figurent — tout ce que `.dev.vars` porte en plus est silencieusement ignoré — et `wrangler deploy` refuse de partir si l'une d'elles manque. Il n'existe pas de liste « facultative ». Une variable que seul le développement local doit voir se déclare **dans la liste racine seulement** : le bloc `env.production` porte sa propre liste complète et l'emporte entièrement. Les identifiants de connexion sociale figurent dans les deux listes : le produit s'en passe à l'écran, mais la console en ligne les offre. Un secret qui n'apparaît nulle part n'atteint jamais le Worker, quoi qu'il y ait dans `.env.local` — le symptôme est une fonctionnalité qui se croit non configurée alors que la valeur est bien là.
- `STRIPE_WEBHOOK_SECRET` **se dérive** en local, comme la base : `dev:prepare` le lit par `stripe listen --print-secret`, c'est-à-dire le secret de l'endpoint que le CLI tient pour ce compte, et avec lequel `bun run dev:stripe` signe. Il diffère de celui du tableau de bord et n'a donc rien à faire dans 1Password. Sans le CLI, ou sans `stripe login`, le script le dit et ne bloque rien. Il reste requis en production, par secret Wrangler, où le webhook vérifie ses signatures.
- Les valeurs **non secrètes** du développement (`BETTER_AUTH_URL`, `VITE_APP_URL`, `EMAIL_FROM`, `PUPITRE_DOWNLOADS_URL`, `BILLING_MODE`, `LAUNCH_ENDS_AT`) ne sont ni dans 1Password ni écrites à la main : elles vivent dans `vars` de `apps/web/wrangler.jsonc`, et `dev:prepare` les recopie dans `.env.local` quand elles y sont vides. Sans cette copie, `.dev.vars` masquerait `vars` clé par clé et le Worker local démarrerait avec un `BETTER_AUTH_URL` vide.
- `.env.local` est écrit en 0600 et lié en `apps/web/.dev.vars` (que le Worker lit) et `apps/web/.env.local` (que Vite lit) : une seule valeur à tenir à jour. `.env.example` reste la liste de référence des noms.
- Déployés : secrets Wrangler, un jeu par environnement. `apps/web/wrangler.jsonc` déclare `env.<environnement>.secrets.required` ; `scripts/check-worker-secrets.ts <environnement>` compare cette liste avec ce qui est lié au Worker et refuse le déploiement en nommant ce qui manque. Il refuse aussi un secret requis déclaré en clair dans `vars`.
- Le script lit les secrets liés par `wrangler secret list`. `PUPITRE_WORKER_SECRETS` (liste de noms) ou `--bound-from <fichier|->` remplacent cette lecture, pour les tests et pour une CI qui a déjà la liste.
- Signature : le certificat Developer ID et la clé de notarisation dans la note 1Password de la release, recopiés en secrets du dépôt par `release secrets` pour les runners — jamais dans un fichier du dépôt ni sur un disque.

## Branches

Deux branches longues, et rien d'autre qui vive plus qu'une pull request.

| Branche | Ce qu'elle est | Ce qu'elle déploie |
| --- | --- | --- |
| `staging` | la branche de travail : tout y arrive, directement ou par pull request. Elle ne déploie rien : tout s'essaie en local, de bout en bout | rien |
| `main` | la production, et rien d'autre : elle ne change que par la pull request `staging` → `main`, celle qu'une release ouvre et fusionne, ou une ouverte à la main quand ni l'app ni l'agent ne changent | `app.pupitre.studio`, `pupitre.studio` |

- **`main` ne se commite ni ne se pousse en local.** `.husky/pre-commit` et `.husky/pre-push` appellent `scripts/assert-branch-writable.ts`, qui refuse l'un et l'autre et dit quoi faire à la place. `PUPITRE_ALLOW_MAIN=1` ouvre l'exception, une fois, en le sachant. Un hook local ne protège que celui qui l'a installé, et il n'y a pas d'autre garde-fou côté GitHub : sur le plan gratuit, `main` n'a ni protection de branche ni ruleset (voir [Vérifications](#vérifications)). La seule vérification imposée par le serveur est celle de la release.
- **`main` avance par release, ou par une pull request quand ni l'app ni l'agent ne changent.** Le dernier job de `release.yml` ouvre la pull request `staging` → `main` et la fusionne, une fois la version téléchargeable et la CI verte sur son commit de tête. Un changement qui ne touche que la console, le site ou les mails n'a pas besoin d'un numéro : `gh pr create --base main --head staging`, `gh pr checks --watch` jusqu'au vert, puis `gh pr merge --merge`, et Cloudflare Builds reconstruit les deux Workers. Rien n'empêche côté serveur de fusionner avant le vert : c'est une discipline, pas une règle. Un correctif de l'app ou de l'agent, lui, sort avec la version suivante.
- **La pull request `staging` → `main` se fusionne par un merge commit.** Ni squash, ni rebase : ils réécrivent les commits, et le commit tagué d'une version sortirait de l'historique de `main` — `git describe` ne le verrait plus, et `next` compterait depuis le mauvais tag. Le dépôt n'autorise que `merge` dans *Settings* → *General* → *Pull Requests*, et `gh pr merge --merge` le demande explicitement.
- **Les tags n'appartiennent à aucune branche.** `git push origin vX.Y.Z` les rend visibles partout, tout de suite : une pull request n'a rien à « rapatrier ». La seule question qui compte est de savoir si le commit tagué est accessible depuis `main`, ce que le merge commit garantit et que le squash casse.

## Déploiement de la plateforme

### Le préfixe des ressources Cloudflare

**Toute ressource créée sur le compte Cloudflare porte le préfixe `ppt-`** : Workers, Workflows, buckets R2, KV, files. Le compte héberge plusieurs produits, chacun avec son préfixe court ; sans lui, une ressource de Pupitre ne se distingue de celle d'un autre projet que par la mémoire de qui la lit. Le nom du domaine, lui, ne change pas : `pupitre.studio` reste ce qu'il est.

### Les noms exacts

| Ce qui est créé | production |
| --- | --- |
| Worker | `ppt-web-production` |
| Domaine | `app.pupitre.studio` |
| Environnement Wrangler | `production` |
| Base D1 | `ppt-db-enam` |
| Seau R2 des emails | `ppt-mail`, lié sous `MAIL`, privé, juridiction par défaut ; règle CORS de `apps/web/r2-mail-cors.json` (`wrangler r2 bucket cors set`) pour que la console lise et dépose les pièces jointes par adresse signée ; le jeton `R2_*` du Worker y lit et y écrit |
| Email Routing | règle catch-all sur la zone `pupitre.studio` → *Send to a Worker*, `ppt-web-production` |
| Workflows | `ppt-expire-enrollments`, `ppt-decommission-server`, `ppt-reconcile-seats`, `ppt-evaluate-alerts`, `ppt-suspend-expired-grace`, `ppt-purge-deletions` |
| Durable Object | `INBOX_REALTIME`, classe `InboxRealtime` (migration `v1`, `new_sqlite_classes`) ; une seule instance, `idFromName("platform")`, qui ne stocke rien et diffuse le temps réel de la boîte |
| Durable Object | `RATE_LIMIT`, classe `RateLimit` (migration `v2`, `new_sqlite_classes`) ; huit instances, `idFromName` du hachage de la clé, qui portent les budgets de l'API et des routes d'authentification — sans lui, chaque isolate compterait seul |
| Déclencheur | Cloudflare Builds sur un push de `main` |
| Stripe | mode live |

Un seul environnement en ligne. Il n'y a pas de staging chez Cloudflare : tout s'essaie en local, de bout en bout — `bun dev` tient la console sur une D1 de miniflare, l'app desktop de développement lui parle par le tunnel `dev.pupitre.studio`, et l'agent s'éprouve sur un VPS jetable. Le nom du Worker n'est pas choisi : Wrangler est en environnements *legacy*, il suffixe le nom racine (`ppt-web`) du nom de l'environnement. Les deux Cron Triggers, le domaine, les bindings — la D1 comprise — et la liste des secrets requis viennent tous de `apps/web/wrangler.jsonc` : le tableau de bord n'en déclare aucun.

### L'ordre de création

Les étapes, dans l'ordre où elles se tiennent, sont dans [`deploy.md`](./deploy.md) : zone, bases D1, buckets, Email Sending, Stripe, premier déploiement à la main, secrets, projets Workers Builds. Les tableaux ci-dessus disent les noms ; ce document-là dit les gestes.

### Ce que fait chaque déploiement

`build:production` migre la D1 de production puis construit avec `CLOUDFLARE_ENV`, ce qui fige l'environnement dans `apps/web/dist/server/wrangler.json` : le déploiement ne prend plus `--env`. `deploy:production` vérifie les secrets, puis `wrangler deploy --keep-vars`, qui attache le domaine personnalisé, les Cron Triggers et les Workflows de l'environnement.

Un retour arrière se fait sur les versions du Worker (`bun x wrangler rollback --config apps/web/dist/server/wrangler.json`, ou la liste des déploiements dans le tableau de bord). Une migration Prisma, elle, ne se rejoue pas à l'envers : une migration qui casse se corrige par une migration suivante.

### Observabilité

`observability` est activé (journaux d'invocation, échantillonnage à 100 %) et `upload_source_maps` est vrai, pour que les piles soient lisibles. C'est la seule observabilité de la plateforme : une exception non rattrapée remonte au tableau de bord Cloudflare et à `wrangler tail`, rien n'est envoyé à un service tiers.

## Cloudflare Builds

| Service | Branche | Commande de build | Commande de déploiement |
| --- | --- | --- | --- |
| web | `main` | `bun install --frozen-lockfile && bun --cwd=apps/web run build:production` | `bun --cwd=apps/web run deploy:production` |
| site | `main` | `bun install --frozen-lockfile && bun --cwd=apps/site run build:production` | `bun --cwd=apps/site run deploy:production` |

Les deux Workers sont connectés au dépôt GitHub : chaque push de `main` — c'est-à-dire chaque release — les reconstruit et les déploie, sans geste sur le poste. L'app desktop de développement parle à la console locale.

### Le site, un Worker à assets statiques

`apps/site/wrangler.jsonc` : `ppt-site` sur `pupitre.studio` et `www.pupitre.studio`. Le calque d'assets sert `dist/` et lit `_headers` et `_redirects` ; `worker/index.ts` ne fait que renvoyer `www` vers l'apex, que ce calque refuse d'écrire (URL relatives seulement).

- En-têtes de sécurité et de cache dans `apps/site/public/_headers` : `HSTS`, `CSP`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, et un an d'immuable sur `/_astro/*` et `/og/*`.
- Variables de build : `PUBLIC_POSTHOG_KEY` et `PUBLIC_POSTHOG_HOST` en production seulement — sans clé, le site ne charge aucun analytics et n'affiche pas de bandeau de consentement.
- Le garde légal (`apps/site/scripts/legal.ts`) fait échouer le build de production — `PUPITRE_ENV=production`, posé par `build:production` — et `check:content` quand une page de `src/content/legal/` porte un `TODO`, un `draft: true` ou un passage entre crochets à compléter. Voir [`legal.md`](./legal.md).
- La liste des releases de l'app est lue au build depuis `PUBLIC_RELEASES_URL`, posée par `build:production` sur la console — une route publique, sans session : ce sont des fichiers publics. API injoignable n'échoue pas le build : la page de téléchargement part avec `apps/site/src/content/site/releases.ts` et un avertissement de build. En local et en test, la variable n'est pas posée, donc le build ne sort jamais sur le réseau.

## Stripe

Compte unique, Managed Payments activé et CGU acceptées sur [Managed Payments](https://dashboard.stripe.com/settings/managed-payments) : Stripe est vendeur, il calcule et reverse la taxe, gère la fraude, les litiges, les reçus et le support transactionnel. Voir [`decisions/0007`](./decisions/0007-stripe-managed-payments.md).

Un produit et deux prix, créés à l'identique en sandbox et en live :

| | |
| --- | --- |
| Produit | `Pupitre Server`, code fiscal `txcd_10103001` (SaaS, business use) |
| Prix mensuel | 5 $, `tax_behavior` `exclusive` → `STRIPE_PRICE_SERVER_MONTH` |
| Prix annuel | 50 $, deux mois offerts → `STRIPE_PRICE_SERVER_YEAR` |

Tant que la société n'existe pas, le Worker tourne en `BILLING_MODE=launch` avec `LAUNCH_ENDS_AT`, deux `vars` de `apps/web/wrangler.jsonc` : aucun appel à Stripe, la plateforme accorde elle-même l'abonnement de lancement, et les secrets Stripe restent requis mais inertes. Passer en `stripe`, c'est changer la variable, une fois le compte, les prix et le webhook ci-dessus créés ; les abonnements de lancement en cours vont jusqu'à leur date, puis les organisations repassent par l'essai.

Réglages du dashboard : email de support à jour dans [Business details](https://dashboard.stripe.com/settings/business-details) (Stripe y escalade, et sans réponse sous 48 h il rembourse) ; logo, CGU et confidentialité dans [Checkout settings](https://dashboard.stripe.com/settings/checkout) ; portail client limité au moyen de paiement, aux factures et à la résiliation, jamais à la quantité : les sièges se changent depuis la console par `POST /orgs/:id/seats`, et `ReconcileSeats` ne fait que rapporter l'écart avec le nombre de serveurs.

Webhook `https://app.pupitre.studio/api/v1/webhooks/stripe`, un endpoint et un secret par mode, sur les cinq événements de `HANDLED_EVENT_TYPES` : `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. En local, `stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe`.

## Distribution de l'app desktop

### Les noms exacts

| Ce qui est créé | Où | Nom exact |
| --- | --- | --- |
| Identifiant de l'app | `apps/desktop/electron-builder.yml` | `dev.pupitre.app` |
| Déclencheur | `scripts/release.sh`, sur le Mac du propriétaire | la version suivante et ses notes, puis un tag `v*` posé sur `staging`, que `.github/workflows/release.yml` construit, publie et fusionne dans `main` |
| Bucket public | Cloudflare R2 | `ppt-downloads`, domaine public `dl.pupitre.studio` |
| Bucket privé | Cloudflare R2 | `ppt-agent`, les binaires de l'agent, jamais public |
| Artefacts macOS | `dl.pupitre.studio/app/<version>/` | `Pupitre-<version>-arm64.dmg`, `Pupitre-<version>-x64.dmg` ; à côté, `Pupitre-<version>-<arch>.zip`, ce qu'`electron-updater` télécharge — jamais une ligne de `AppRelease` |
| Artefacts Windows | `dl.pupitre.studio/app/<version>/` | `Pupitre-Setup-<version>-x64.exe` |
| Artefacts Linux | `dl.pupitre.studio/app/<version>/` | `Pupitre-<version>-x86_64.AppImage`, `pupitre_<version>_amd64.deb` |
| Flux de mise à jour | `dl.pupitre.studio/app/<canal>/` | `latest.yml`, `latest-mac.yml`, `latest-linux.yml` |
| Certificat macOS | Apple Developer | `Developer ID Application: <société marocaine> (<Team ID>)` |
| Clé de notarisation | App Store Connect | clé d'API, rôle *Developer*, fichier `AuthKey_<KeyID>.p8` |
| Runners des workflows | Blacksmith | app GitHub installée sur l'organisation ; Ubuntu 24.04 x64 et arm64, macOS 15 sur Apple Silicon, Windows Server 2025 |
| Signature Windows | Azure Trusted Signing | compte `ppt-signing`, profil de certificat `ppt-app` — voir [`tasks/windows-signing.md`](./tasks/windows-signing.md) |

Chaque artefact monte avec un fichier `.sig` à côté : la signature Ed25519 de la clé de release, la même que celle de l'agent, sur `pupitre-app\n<version>\n<système>\n<architecture>\n<sha256>\n`. Elle est aussi enregistrée dans la table `AppRelease`, avec la somme et la taille du fichier. Sur macOS et Windows, c'est la signature du système qui protège l'installation ; sur Linux, celle-ci est la seule, et elle se vérifie à la main.

Les trois `latest*.yml` sont ce que lit `electron-updater`. `electron-builder` les écrit, l'étape `app publish` de `scripts/release` réécrit les liens qu'ils contiennent en URL absolues — les artefacts vivent dans le dossier de leur version, les flux dans celui de leur canal — puis les dépose sous `app/stable/`. `promote` les recopie sous le canal qu'on lui nomme.

### Le bucket public

Un bucket R2 `ppt-downloads`, **accès public activé** par le domaine personnalisé `dl.pupitre.studio`, TLS 1.2 au minimum. Il ne contient que des artefacts de l'app, leurs `.sig`, leurs `.blockmap` et les flux de mise à jour. Le binaire de l'agent n'y entre jamais : il reste dans le bucket privé, servi par une URL signée de cinq minutes à un serveur qui présente son jeton (voir [`security.md`](./security.md)).

### Les secrets de la release

Ils vivent dans **une note 1Password**, `pupitre-GitHub` dans le coffre partagé, un champ par nom ; `scripts/release/release.env.tpl` les référence, et `bun scripts/release/index.ts secrets` lit chaque référence par `op read` et la pose en secret du dépôt par `gh secret set` — à relancer quand une valeur tourne dans la note. Le workflow rend chaque secret à l'étape qui en a besoin, et lit les valeurs en clair du même gabarit. Rien n'est jamais écrit sur un disque.

| Champ | Ce que c'est | Comment l'obtenir |
| --- | --- | --- |
| `PUPITRE_RELEASE_PRIVATE_KEY` | la moitié privée de la clé Ed25519 qui signe l'agent et les artefacts de l'app | `cd apps/agent && go run ./tools/release keygen`, une seule fois, hors de toute session d'agent |
| `PUPITRE_PUBLISH_TOKEN` | le jeton de publication, préfixé `pupitre_pub_` : il n'ouvre que les quatre routes de version, n'expire pas et n'appartient à personne | tiré une fois, posé sur le Worker de la console et ici — voir [`deploy.md`](./deploy.md) |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | l'accès R2 de la chaîne, en S3, limité aux deux seaux — un jeton d'API Cloudflare ouvrirait tous ceux du compte | Cloudflare → *R2* → *Manage API tokens*, *Object Read & Write* sur `ppt-agent` et `ppt-downloads` |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` | le certificat Developer ID en `.p12`, base 64, et son mot de passe ; le runner l'importe dans un trousseau jetable le temps du build | Trousseau d'accès → exporter le certificat et sa clé privée en `.p12`, puis `base64 -i certificat.p12 \| pbcopy` |
| `APPLE_API_KEY_CONTENT` | le `.p8` de la clé de notarisation, en base 64 | `base64 -i AuthKey_<KeyID>.p8 \| pbcopy` |
| `APPLE_API_KEY_ID` | l'identifiant de la clé | la colonne *Key ID* dans App Store Connect |
| `APPLE_API_ISSUER` | l'identifiant de l'émetteur | en haut de la page *Keys* d'App Store Connect |

Les valeurs qui ne sont pas des secrets — les deux plateformes, l'adresse et le nom des seaux, l'identifiant du compte R2 — sont écrites en clair dans le même gabarit. Une release `stable` refuse de construire Windows tant que les quatre variables `AZURE_SIGNING_*` — le point d'accès, le compte, le profil et l'éditeur — et les trois secrets `AZURE_*` d'Azure Trusted Signing ne sont pas posés — [`tasks/windows-signing.md`](./tasks/windows-signing.md).

Aucun jeton n'entre dans le binaire de l'app : les artefacts sont publics, et l'app n'a rien à présenter pour se mettre à jour.

### L'ordre de création

La clé de release, les buckets, le compte Apple, la clé de notarisation, la note 1Password : [`deploy.md`](./deploy.md), étapes 3 et 8.

### Ce que fait chaque release

Chaque étape est une commande de **`scripts/release`** — `bun scripts/release/index.ts <étape>`, idempotente, pilotée par son environnement, essayable avec `--dry-run`. `scripts/release.sh` enchaîne les premières sur le Mac du propriétaire, sans aucun secret, et pousse le tag ; `.github/workflows/release.yml` enchaîne les autres sur ses runners, un job par système. Le seau privé est le seul lieu où une étape passe quelque chose à la suivante : un job qui échoue se relance seul, et n'importe quelle machine qui tient la clé reprend n'importe quelle étape — le jour où les runners sont les nôtres, le workflow change d'hôte et rien d'autre.

| Étape | Ce qu'elle fait |
| --- | --- |
| `next` | la version suivante depuis le dernier tag (`--patch` par défaut, `--minor`, `--major`, ou `--version=`), écrite dans `apps/desktop/package.json` |
| `resolve` | la version depuis ce manifeste, le canal — `stable` sauf demande contraire — et le refus de partir d'ailleurs que `staging` |
| `notes` | l'entrée de changelog des deux langues, rédigée par `claude -p` depuis les commits depuis le dernier tag ; **le script s'arrête là pour qu'elle soit lue**, et repart quand on le relance |
| `check` | le changelog dans chaque langue et la version que l'app déclare |
| `ship` | commit `chore(release): vX.Y.Z` de la version et des notes, tag, push de `staging` et du tag ; c'est ce push qui lance `release.yml` |
| `agent build` | `pupitred` pour `linux/amd64` et `linux/arm64` avec garble, signé, éprouvé — clé publique embarquée, presque aucune chaîne lisible, `version` et `hello` sur la machine de chaque architecture — l'amd64 sur le runner qui construit, l'arm64 sur le job `agent-arm64`, jamais sous émulation — ou **repris du seau** s'il y est déjà : garble ne reproduit pas un binaire, et la plateforme tient les empreintes de la première déclaration |
| `agent publish` | `agent/<version>/` du seau **privé** — binaires, `release.json`, `publications.json` — puis `POST /api/v1/admin/releases` à la production |
| `desktop` | l'app du système du runner — macOS signé et notarisé en arm64 et x64, Windows signé par Azure Trusted Signing, Linux ; en `stable`, une valeur de signature qui manque arrête le build ; l'agent repris du seau, le processus principal compilé en bytecode V8, les fusibles retournés ; installateurs, blockmaps, archives `.zip` de mise à jour macOS et flux laissés sous `work/<version>/<système>/` du seau privé avec l'`index.json` qui les nomme |
| `app publish` | signe avec la clé de release chaque installateur et chaque `.zip` de mise à jour macOS, dépose fichiers et `.sig` sur le bucket **public**, réécrit les flux de mise à jour, déclare chaque fichier par `POST /api/v1/admin/app-releases`, et garde ces lignes en `app/<version>/publications.json` du seau privé |
| `verify` | de l'extérieur, ce qu'un client rencontre : la plateforme décrit la version, le seau public sert chaque fichier entier, les flux du canal la nomment et chaque fichier qu'ils nomment a son `.sig` — le rapport devient le résumé du run |
| `merge` | tout ce que la version nomme est téléchargeable : la pull request `staging` → `main` est ouverte — le corps est l'entrée de changelog anglaise — et fusionnée par un merge commit ; une pull request laissée ouverte est reprise, un `main` qui tient déjà le tag n'a rien à faire. Le push de `main` reconstruit le site et la console |
| `promote` | le retour arrière : `gh workflow run promote.yml -f version=X.Y.Z` remet une version publiée dans le canal, côté agent et côté app, et pointe les flux du canal sur ses fichiers |

Une version sort donc **`stable`, en une fois**, déclarée à la production ; rien n'est reconstruit ni re-signé — un second build donnerait d'autres binaires, d'autres signatures et d'autres sommes de contrôle pour le même numéro de version. Revenir en arrière, c'est promouvoir la version précédente.

Un build sans identité de signature ne s'arrête pas : electron-builder le dit et produit un artefact non signé — c'est ce qui rend `bun --cwd=apps/desktop run build:mac` utilisable sur la machine du propriétaire, et ce que fait un build `beta`. Un build `stable` s'arrête : `desktop` refuse de commencer sans les cinq valeurs Apple ou les sept valeurs Azure, et passe `forceCodeSigning` à electron-builder, qui échoue plutôt que de sauter une signature. Sur un runner, `desktop` importe le certificat de la note dans un trousseau jetable ; sur un Mac qui a le certificat dans son trousseau, il s'en sert. Apple garde une notarisation plusieurs minutes sans un mot : `DEBUG=electron-notarize*` dit où elle en est.

Un retour arrière se fait en promouvant la version précédente : `electron-updater` ne redescend pas de version, mais le flux du canal désigne à nouveau l'ancienne, et une app déjà à jour attend la suivante. Les artefacts d'une version publiée ne sont jamais supprimés.

### Le changelog

`apps/site/src/content/changelog/<langue>/<version>.mdx` est la **seule** source. Une entrée par version et par langue, le nom du fichier étant la version avec des tirets — `0-2-0.mdx`. Le site ne la rend pas : depuis le 14 septembre 2026 il n'y a plus de page changelog, la page de téléchargement affiche la version publiée et c'est tout.

| Qui le lit | Ce qu'il en fait |
| --- | --- |
| La chaîne de release | `notes` la rédige par `claude -p` pour que le propriétaire la relise, `check` refuse de construire si elle manque dans une des langues, `app publish` passe le corps de l'entrée anglaise en notes de version |
| La plateforme | l'enregistre dans `AppRelease.notes`, d'où la console et l'app desktop le tirent par `GET /api/v1/releases/app/:version` |

`scripts/release-notes.ts` fait les deux : `--check` vérifie qu'une version est couverte partout, sans argument il écrit le corps de l'entrée. Les notes stockées sont anglaises parce que `AppRelease.notes` est une seule chaîne et que l'anglais est la langue que le site sert sans préfixe.

### Ce qui se construit où

Un module natif ne se compile pas pour un autre système : `node-pty` impose un runner par OS, et c'est la raison de la matrice `blacksmith-6vcpu-macos-15`, `blacksmith-4vcpu-windows-2025`, `blacksmith-4vcpu-ubuntu-2404` de `release.yml` — et la raison pour laquelle la release ne se fait pas depuis un Mac. Depuis un Mac, `bun --cwd=apps/desktop run build:linux` s'arrête sur `node-gyp does not support cross-compiling native modules` — ce n'est pas une erreur de configuration.

| Système | Ce qui sort | Ce qui le signe |
| --- | --- | --- |
| macOS | `.dmg` arm64 et x64, et le `.zip` de chaque architecture pour la mise à jour | certificat Developer ID, puis notarisation, puis la clé de release |
| Windows | installateur NSIS de l'architecture du runner | Azure Trusted Signing — obligatoire en `stable`, l'éditeur écrit dans `app-update.yml` pour que l'app installée refuse un installateur signé par un autre — puis la clé de release |
| Linux | AppImage et `.deb` de l'architecture du runner | la clé de release seule : Linux n'a pas d'autorité à qui répondre |

Le `.deb` s'appelle `pupitre` et non `@pupitre/desktop` : le nom du workspace porte une barre oblique, que dpkg refuse. L'exécutable Linux s'appelle `pupitre` pour la même raison, et `pupitre.desktop` s'aligne dessus pour que l'environnement de bureau relie la fenêtre à son lanceur.

### La feuille de compatibilité

`packages/shared/src/compat` porte la seule table qui dit quelle app pilote quel agent : une ligne par génération de protocole, avec la première version d'app et la première version d'agent de cette génération. Elle part dans `apps/agent/internal/contract/schema.json` par `bun run contracts:export`, donc l'agent la porte compilée en lui.

Tant qu'aucune ligne n'est ajoutée, toutes les versions d'app pilotent toutes les versions d'agent. Une ligne s'ajoute le jour où le protocole retire ou renomme un champ, dans la même passe que le changement de `PROTOCOL_VERSION` : le `hello` d'un agent d'une autre génération répond alors lequel des deux mettre à jour, et l'app le dit sur son bandeau.

### Ce que la mise à jour ne couvre pas

Le `.deb` est installé par apt et mis à jour par apt : l'app n'y touche pas, et le dit. L'AppImage, l'app macOS et l'installateur Windows se remplacent seuls — sur macOS, `electron-updater` n'installe jamais un `.dmg` : il télécharge le `.zip` que `latest-mac.yml` nomme à côté, et un flux sans `.zip` laisse l'app sur « ZIP file not provided », ce qui fut le cas jusqu'à la 0.2.0. Un build de développement ne cherche aucune mise à jour ; un build empaqueté suit le canal que `MAIN_VITE_UPDATE_CHANNEL` lui a donné, `stable` par défaut, sur le seau que `PUPITRE_DOWNLOADS_URL` lui a donné — la même variable que la publication lit, `https://dl.pupitre.studio` quand le build n'en reçoit aucune.

Rien ne s'installe sans la clé de release, sur les trois systèmes (`src/main/updater.ts`) : `electron-updater` télécharge, mais `autoInstallOnAppQuit` reste baissé ; le téléchargement est `verifying` jusqu'à ce que le `.sig` publié à côté tienne pour ses octets, puis `ready`. L'installation — demandée, ou à la fermeture sur Linux et Windows — relit le fichier et refuse tout autre que celui vérifié, avec les mêmes octets ; sur macOS, l'archive vérifiée est confiée aussitôt à Squirrel.Mac, qui l'installe à la fermeture. Par-dessus, Squirrel.Mac vérifie le Developer ID de ce qu'il installe et `electron-updater` l'éditeur Authenticode de l'installateur Windows.

## La base de données

Cloudflare **D1**, une base en ligne : `ppt-db-enam` (`89b05eda-2e19-4643-a383-935836b4bbd8`), en Amérique du Nord (`enam`) comme les trois seaux R2, liée sous `DB` dans `apps/web/wrangler.jsonc` et nommée dans `environments.json` ; en local, la D1 que miniflare tient sous `apps/web/.wrangler/state`. Elle a remplacé le 20 septembre 2026 `ppt-db` (`8c4cd3b5-7375-4a69-8b84-b3b78c734cf5`), créée en Europe de l'Ouest — une région D1 ne se change pas, on recrée et on importe — et à supprimer une fois `main` déployé dessus. Le Worker est en *smart placement* : il s'exécute à côté de la base, pas au bord le plus proche de l'appelant. Il n'y a ni adresse, ni secret, ni compute à réveiller : toute la plateforme est chez Cloudflare, et une base sans trafic ne coûte rien.

**Prisma 7 sur l'adaptateur D1** (`@prisma/adapter-d1`), le schéma en `provider = "sqlite"`. Le Worker ouvre un client sur son binding à chaque requête et à chaque run de workflow (`withPrismaClient` dans `src/worker.ts`) ; tout ce qui est dessous le lit par `@pupitre/db/scope`, sans jamais voir un binding — et un test lui donne le sien, un fichier SQLite construit par les mêmes migrations que D1 applique (`@pupitre/api/testing`). SQLite tranche deux choses : pas de transaction interactive (aucune n'est écrite), et une comparaison de casse se fait en code, pas dans la requête.

**Les migrations sont des fichiers SQL**, `packages/db/migrations/NNNN_<nom>.sql`, dans le registre de D1 (`d1_migrations`) et appliqués par wrangler : `bun run db:migrate <local|production>`, production avec `PUPITRE_ALLOW_MIGRATE_ON=production` sur la ligne de commande. `bun run db:migrate:new <nom>` écrit le suivant : les migrations rejouées sur un SQLite jetable, le schéma diffé contre lui. `bun run db:reset <cible>` supprime toutes les tables puis rejoue tout. La construction (`build:production`) migre avant de construire ; la CI applique les migrations sur une base locale vide, et les tests les rejouent. En local, `dev:prepare` migre la D1 de miniflare : la console démarre sur une base qui existe.

**L'organisation de Pupitre et son administrateur sont posés par un seed**, `bun run db:seed <local|production> <adresse>`, production avec `PUPITRE_ALLOW_MIGRATE_ON=production` sur la ligne de commande, comme une migration. Il crée l'organisation `pupitre` sous l'identifiant `org_pupitre`, donne au compte de cette adresse l'identifiant `usr_pupitre_admin` et le rôle `platform_admin`, et l'inscrit propriétaire de cette organisation sous `mem_pupitre_admin` — les cinq identifiants sont ceux de `@pupitre/shared/platform`, et ils ne bougent plus. Better Auth a créé ce compte avec un identifiant tiré au hasard : le seed le renomme, et les clés étrangères en `ON UPDATE CASCADE` emportent tout ce qui le désigne ; `ServerRevokedDevice.revokedByUserId` et `AffiliateLink.createdById`, qui n'en ont pas, sont repris à la main dans la même passe. D1 n'ouvre pas de transaction : chaque instruction est idempotente pour elle-même, et rejouer le seed ne change rien. Il refuse plutôt que d'écraser — une autre organisation sur le slug `pupitre`, un autre compte sur `usr_pupitre_admin` — et dit en une ligne ce qu'il a fait de chacune des trois lignes.

## Dépendances

Les `overrides` du `package.json` racine sont la seule source de vérité de l'arbre d'installation ; Bun ignore les overrides par workspace. Chaque épingle a une raison écrite ici ; on n'en ajoute pas sans `bun audit` et un `bun run build` qui passent.

Épingles héritées de React-Box, à revérifier à la première mise à niveau : `typescript ^6` (TS 7 casse encore des outils), `ultracite 7.8.3` (la version suivante reformate tout le dépôt), `better-auth` exact (les mineures ont déjà cassé `customSession`).

**`miniflare` est patché** (`patches/miniflare@4.20260708.0.patch`, appliqué par `patchedDependencies`). Le `workerd` que miniflare lance en développement tourne avec le tas V8 par défaut, environ 1,4 Go ; le Worker de la console se stabilise plutôt vers 1,8 Go au bout d'une longue session de HMR. Il meurt donc, et **rien ne le relance** : miniflare le lance une seule fois et ne surveille pas sa sortie, si bien que Vite continue de tourner en répondant à chaque requête par la même trace `fetch failed` d'undici, indéfiniment, jusqu'à ce qu'on relance `bun run dev:web`. Le tas se règle par le champ `v8Flags` de la configuration workerd, que miniflare n'expose pas : le patch le lit dans `MINIFLARE_V8_FLAGS`, et le script `dev` d'`apps/web` le pose à `--max-old-space-size=4096` — comme React-Box, d'où le patch vient. La version est celle qu'`@cloudflare/vite-plugin@1.43.3` épingle ; un jour où le plugin bouge, le patch est à rejouer.

## Dashboards externes

Cloudflare Builds, Cloudflare Email Sending, Cloudflare Email Routing (la règle catch-all de `pupitre.studio`), D1 (les deux bases), R2 (les trois buckets : `ppt-downloads` et son domaine public, `ppt-agent`, `ppt-mail`), Stripe, Apple Developer, Azure Trusted Signing. Ce document est ce qui les décrit ; rien dans le dépôt ne peut vérifier ce qu'ils exécutent. Quand un tableau ci-dessus change, le dashboard change dans la même passe.
