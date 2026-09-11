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
| Prisma 7 | schéma et migrations | client généré committé, empreinte `packages/db/src/generated/.prisma-inputs.sha256` vérifiée au lint par `scripts/check-prisma-client-freshness.ts` ; `db:migrate` et `db:migrate:reset` exigent `PUPITRE_ALLOW_MIGRATE_ON=staging` ou `local` |
| Wrangler 4 | Workers, R2, secrets | `secrets.required` déclarés dans `wrangler.jsonc`, vérifiés avant déploiement |
| Go 1.26+ (`apps/agent/go.mod`) | l'agent | `gofmt`, `go vet` et `staticcheck` au lint, `govulncheck` et `go test -race` en CI, `garble` en release. Les trois outils sont épinglés dans `apps/agent/package.json` : `bun --cwd=apps/agent run tools:install` installe `staticcheck` et `govulncheck`, `garble:install` installe garble, tous dans le bin de Go, à mettre dans le `PATH`. Go lui-même est installé par Homebrew sur la machine du propriétaire |
| electron-vite, electron-builder | l'app desktop | bytecode du processus principal, fusibles, signature et notarisation ; un runner par système |

## Développement local

```bash
bun install
bun dev              # site sur :4321, web sur :3000, tunnel de l'agent
bun run dev:desktop  # l'app, pointée sur la console locale
```

`dev:desktop` et le `build` du desktop construisent d'abord l'agent (`@pupitre/agent#build`, que turbo ne met jamais en cache : le binaire embarque `git describe`, que turbo ne hache pas, et un build repris du cache porterait la version d'un autre commit) : l'app embarque `apps/agent/dist` au démarrage, et c'est ce binaire qu'elle pousse sur un serveur nu. Sans cette dépendance, elle poussait le dernier build manuel, et un écran pouvait attendre un contrat que l'agent installé ne parlait pas encore.

`bun run dev:web` lance Vite et TanStack Start sous le plugin Cloudflare, avec les bindings locaux. Neon local via `neonctl` ou une branche de dev ; `DATABASE_URL` dans `.env.local`. L'agent se teste sur un VPS réinstallable, jamais sur la machine du propriétaire : `PUPITRE_STAGING_HOST=root@<adresse> go test -tags staging ./test/staging/...` depuis `apps/agent`. Sans la variable, ces tests se sautent.

### Lancer un workflow à la main

Les cinq workflows partent de Cron Triggers, qui ne se déclenchent que sur un Worker déployé : en local, rien ne les appelle jamais. Une ligne révoquée n'y est donc jamais décommissionnée, et tout ce qui dépend d'une échéance reste intestable.

```bash
bun run workflows:run decommission-server
```

Le script frappe le déclencheur interne avec le secret que `dev:prepare` a écrit, et rend l'identifiant de l'instance. Les noms sont ceux de `apps/web/src/workflows/registry.ts`, qui reste la seule liste ; un nom inconnu est refusé par le Worker.

### Le tunnel qui rend la console locale joignable

Un VPS ne peut pas atteindre `localhost:3000` : c'est sa propre boucle locale. `bun dev` lance donc `scripts/dev-tunnel.ts`, un tunnel Cloudflare **nommé** — l'adresse ne change pas d'un lancement à l'autre, contrairement à un tunnel jetable.

| Ce qui est créé | Valeur |
| --- | --- |
| Tunnel | `ppt-dev`, sur le compte Cloudflare de la zone |
| Nom d'hôte | `dev-app.pupitre.studio`, enregistrement CNAME posé par `cloudflared tunnel route dns` |
| Ce qui est servi | `^/api/v1/agent/` vers `http://localhost:3000` — tout le reste répond 404 |
| Identifiants | `~/.cloudflared/<uuid>.json`, hors du dépôt ; la configuration est régénérée dans `apps/web/.cloudflared.yml`, ignoré par Git |

`apps/web/vite.config.ts` déclare ce nom dans `server.allowedHosts` : Vite refuse par défaut tout hôte qu'il ne connaît pas, et sans cette ligne le tunnel arrive jusqu'à la console pour se faire renvoyer un 403.

Une seule étape est manuelle, une fois par machine : `cloudflared tunnel login`, en choisissant la zone `pupitre.studio`. Sans elle le script le dit et s'arrête sans faire échouer `bun dev` — le tunnel ne sert qu'à installer un agent sur un serveur distant.

L'app desktop suit d'elle-même : `agentPlatformUrl()` remplace une console de cet ordinateur par ce nom avant de le donner à l'agent, la console et le flux d'appareil continuant de passer par `localhost:3000`. `PUPITRE_AGENT_PLATFORM_URL` désigne une autre plateforme pour l'agent seul.

## Vérifications

```bash
bun run lint          # boundaries, ultracite, gofmt et go vet
bun run check:types
bun run test
bun run build
```

Un push sur `staging` est vérifié une fois, sur son SHA ; la pull request `staging` → `main` porte ce même SHA et affiche ces vérifications sans rien relancer — `pull_request` ne vise donc que `staging`, où arrivent les branches de travail. Les minutes GitHub Actions se paient : macOS compte dix fois une minute Ubuntu, Windows deux fois. Les jobs de `ci.yml` :

| Job | Quand | Ce qu'il fait |
| --- | --- | --- |
| `quality` | PR vers `staging`, push sur `staging` et `main` | lint, typecheck, tests, build hors desktop. L'app desktop et les packages tournent avec `--coverage`, et leurs `lcov.info` montent dans l'artefact `coverage-<sha>` — aucun seuil, on lit |
| `console-e2e` | idem | Playwright sur la console, non bloquant |
| `desktop-e2e` | idem | Playwright sur l'app, sous xvfb |
| `gitleaks` | idem | l'historique entier relu par le binaire `gitleaks`, épinglé par empreinte — pas l'action, qui exige une licence dès qu'une organisation porte le dépôt ; `.gitleaks.toml` exclut les fixtures de test et les valeurs factices de la CI |
| `agent` | idem | `gofmt`, `go vet`, `staticcheck`, `govulncheck`, `go test -race` avec son profil de couverture dans l'artefact `coverage-agent-<sha>`, build multi-arch ; sur `staging` et `main`, le build de release avec une clé jetable |

`desktop-smoke.yml` tourne à part, sur `macos-15` seulement, au push sur `staging` quand l'app, l'agent, les packages ou le lockfile ont changé, et à la main : tests unitaires de l'app, bundle avec l'agent embarqué, capture des thèmes non bloquante — un runner n'a pas les polices du poste où les références ont été prises. Windows n'y est pas : le modèle SSH de l'app — une session maître multiplexée par serveur, clés et sockets en 0600 — n'a pas d'équivalent sur OpenSSH pour Windows, et le job ne faisait que le répéter à chaque push. Il revient quand le support de Windows est une tâche.

Les actions des workflows sont épinglées par SHA, la version en commentaire à côté ; Dependabot (`github-actions`) les fait avancer.

Trois workspaces passent `--timeout=60000` à `bun test` : `apps/web`, `apps/desktop` et `packages/api`. Leurs tests démarrent un Postgres en WebAssembly et lui appliquent les migrations avant le premier cas, ce qu'un runner froid met une vingtaine de secondes à faire — au-delà des cinq secondes que `bun test` accorde par défaut, et le hook tombe avant que le premier cas ait pu tourner.

## Frontières de workspace

`scripts/assert-package-boundaries.ts` refuse : un import entre deux `apps/*` ; un import de `@pupitre/api/lib/*` hors de `packages/api` ; un import des entrées Prisma Node dans `packages/api/src`, `apps/web/src` ; un import de `packages/shared` depuis `apps/agent` autrement que par le JSON Schema exporté.

## Secrets

- Jamais dans le dépôt. Le hook pre-commit refuse toute chaîne ressemblant à une clé API, un jeton ou une clé privée, et le job `gitleaks` de la CI relit tout l'historique. La *push protection* de GitHub se pose dans les réglages du dépôt — *Settings* → *Code security* → *Secret scanning* — et nulle part ici : elle refuse un push qui porte un secret avant que la CI ne le voie.
- Local : `bun run dev:prepare` prépare `.env.local` et les liens que chaque outil attend. Les trois commandes de développement l'appellent d'abord, donc il n'y a rien à lancer à la main. Il ne remplace jamais une valeur déjà écrite : un `.env.local` renseigné reste tel quel.
- **Ce qui se dérive n'est pas stocké.** `DATABASE_URL` et `MIGRATE_DATABASE_URL` viennent de `neonctl`, poolé et direct, sur la branche Neon que la branche Git désigne ; `.env.local` garde à côté `NEON_PROJECT_ID` et `NEON_BRANCH`, qui disent d'où elles viennent. `BETTER_AUTH_SECRET` et `INTERNAL_WORKFLOW_SECRET` sont tirés au hasard par poste, puisqu'ils n'ont pas à être partagés.
- **Ce qui ne se dérive pas vient de 1Password.** `.env.1password.tpl` est le modèle committé, avec des références `op://` et aucune valeur ; le coffre et l'élément sont dans `op.config.json`, surchargeables par `OP_VAULT` et `OP_ITEM`. `op inject` échoue en bloc si un champ manque, donc une clé reste **en commentaire** tant que son champ n'existe pas dans la note.
- **Rien n'est bloquant.** `op` absent, session fermée, champ manquant ou `neonctl` sans session : le script le dit et retombe sur ce que `.env.local` porte déjà.
- **`secrets.required` de `wrangler.jsonc` fait deux choses à la fois**, et c'est un piège : Cloudflare ne charge dans le Worker local **que** les clés qui y figurent — tout ce que `.dev.vars` porte en plus est silencieusement ignoré — et `wrangler deploy` refuse de partir si l'une d'elles manque. Il n'existe pas de liste « facultative ». Une variable que seul le développement local doit voir se déclare **dans la liste racine seulement** : les blocs `env.staging` et `env.production` portent chacun leur propre liste complète et l'emportent entièrement. Les identifiants de connexion sociale figurent dans les trois listes : le produit s'en passe à l'écran, mais la console en ligne les offre. Un secret qui n'apparaît nulle part n'atteint jamais le Worker, quoi qu'il y ait dans `.env.local` — le symptôme est une fonctionnalité qui se croit non configurée alors que la valeur est bien là.
- `STRIPE_WEBHOOK_SECRET` **se dérive** en local, comme la base : `dev:prepare` le lit par `stripe listen --print-secret`, c'est-à-dire le secret de l'endpoint que le CLI tient pour ce compte, et avec lequel `bun run dev:stripe` signe. Il diffère de celui du tableau de bord et n'a donc rien à faire dans 1Password. Sans le CLI, ou sans `stripe login`, le script le dit et ne bloque rien. Il reste requis en staging et en production, par secret Wrangler, où le webhook vérifie ses signatures.
- Les valeurs **non secrètes** du développement (`BETTER_AUTH_URL`, `VITE_APP_URL`, `EMAIL_FROM`, `PUPITRE_DOWNLOADS_URL`) ne sont ni dans 1Password ni écrites à la main : elles vivent dans `vars` de `apps/web/wrangler.jsonc`, et `dev:prepare` les recopie dans `.env.local` quand elles y sont vides. Sans cette copie, `.dev.vars` masquerait `vars` clé par clé et le Worker local démarrerait avec un `BETTER_AUTH_URL` vide.
- `.env.local` est écrit en 0600 et lié en `apps/web/.dev.vars` (que le Worker lit) et `apps/web/.env.local` (que Vite lit) : une seule valeur à tenir à jour. `.env.example` reste la liste de référence des noms.
- Déployés : secrets Wrangler, un jeu par environnement. `apps/web/wrangler.jsonc` déclare `env.<environnement>.secrets.required` ; `scripts/check-worker-secrets.ts <environnement>` compare cette liste avec ce qui est lié au Worker et refuse le déploiement en nommant ce qui manque. Il refuse aussi un secret requis déclaré en clair dans `vars`.
- Le script lit les secrets liés par `wrangler secret list`. `PUPITRE_WORKER_SECRETS` (liste de noms) ou `--bound-from <fichier|->` remplacent cette lecture, pour les tests et pour une CI qui a déjà la liste.
- Signature : certificats Apple et Azure Trusted Signing dans les secrets GitHub Actions uniquement.

## Branches

Deux branches longues, et rien d'autre qui vive plus qu'une pull request.

| Branche | Ce qu'elle est | Ce qu'elle déploie |
| --- | --- | --- |
| `staging` | la branche de travail : tout y arrive, directement ou par pull request | `staging-app.pupitre.studio`, `staging.pupitre.studio` |
| `main` | la production, et rien d'autre : elle ne change que par une pull request depuis `staging` | `app.pupitre.studio`, `pupitre.studio` |

- **`main` ne se commite ni ne se pousse en local.** `.husky/pre-commit` et `.husky/pre-push` appellent `scripts/assert-branch-writable.ts`, qui refuse l'un et l'autre et dit quoi faire à la place. `PUPITRE_ALLOW_MAIN=1` ouvre l'exception, une fois, en le sachant. Le vrai garde-fou reste la protection de branche GitHub : un hook local ne protège que celui qui l'a installé.
- **La pull request `staging` → `main` se fusionne par un merge commit.** Ni squash, ni rebase : ils réécrivent les commits, et le commit tagué d'une version sortirait de l'historique de `main` — `git describe` ne le verrait plus, et `promote.yml` ne le compterait pas. Le réglage se pose une fois dans *Settings* → *General* → *Pull Requests*, et la protection de `main` ne laisse passer que `merge`.
- **Un correctif urgent** part de `main`, y revient par une pull request, et `main` est refusionnée dans `staging` dans la foulée. Sans ce retour, la promotion suivante défait le correctif.
- **Les tags n'appartiennent à aucune branche.** `git push origin vX.Y.Z` les rend visibles partout, tout de suite : une pull request n'a rien à « rapatrier ». La seule question qui compte est de savoir si le commit tagué est accessible depuis `main`, ce que le merge commit garantit et que le squash casse.
- Dependabot ouvre ses pull requests sur `staging`.

## Déploiement de la plateforme

### Le préfixe des ressources Cloudflare

**Toute ressource créée sur le compte Cloudflare porte le préfixe `ppt-`** : Workers, Workflows, buckets R2, KV, files. Le compte héberge plusieurs produits, chacun avec son préfixe court ; sans lui, une ressource de Pupitre ne se distingue de celle d'un autre projet que par la mémoire de qui la lit. Le nom du domaine, lui, ne change pas : `pupitre.studio` reste ce qu'il est.

### Les noms exacts

| Ce qui est créé | staging | production |
| --- | --- | --- |
| Worker | `ppt-web-staging` | `ppt-web-production` |
| Domaine | `staging-app.pupitre.studio` | `app.pupitre.studio` |
| Environnement Wrangler | `staging` | `production` |
| Branche Neon | `staging` | `production` |
| Workflows | `ppt-expire-enrollments-staging`, `ppt-decommission-server-staging`, `ppt-reconcile-seats-staging`, `ppt-evaluate-alerts-staging`, `ppt-suspend-expired-grace-staging` | les mêmes sans suffixe |
| Déclencheur | Cloudflare Builds sur un push de `staging` | Cloudflare Builds sur un push de `main` |
| Stripe | mode test | mode live |

Le nom du Worker n'est pas choisi : Wrangler est en environnements *legacy*, il suffixe le nom racine (`ppt-web`) du nom de l'environnement. Les cinq Cron Triggers, les domaines, les bindings et la liste des secrets requis viennent tous de `apps/web/wrangler.jsonc` : le tableau de bord n'en déclare aucun.

### L'ordre de création

Les étapes, dans l'ordre où elles se tiennent, sont dans [`deploy.md`](./deploy.md) : zone, Neon, buckets, Email Sending, Stripe, premier déploiement à la main, secrets, projets Workers Builds. Les tableaux ci-dessus disent les noms ; ce document-là dit les gestes.

### Ce que fait chaque déploiement

`build:*` migre la branche Neon visée puis construit avec `CLOUDFLARE_ENV`, ce qui fige l'environnement dans `apps/web/dist/server/wrangler.json` : le déploiement ne prend plus `--env`. `deploy:*` vérifie les secrets, puis `wrangler deploy --keep-vars`, qui attache le domaine personnalisé, les Cron Triggers et les Workflows de l'environnement.

Un retour arrière se fait sur les versions du Worker (`bun x wrangler rollback --config apps/web/dist/server/wrangler.json`, ou la liste des déploiements dans le tableau de bord). Une migration Prisma, elle, ne se rejoue pas à l'envers : une migration qui casse se corrige par une migration suivante.

### Observabilité

`observability` est activé dans les deux environnements (journaux d'invocation, échantillonnage à 100 %) et `upload_source_maps` est vrai, pour que les piles soient lisibles. C'est la seule observabilité de la plateforme : une exception non rattrapée remonte au tableau de bord Cloudflare et à `wrangler tail`, rien n'est envoyé à un service tiers.

## Cloudflare Builds

| Service | Commande de build | Commande de déploiement |
| --- | --- | --- |
| web (staging) | `bun install --frozen-lockfile && bun --cwd=apps/web run build:staging` | `bun --cwd=apps/web run deploy:staging` |
| web (production) | `bun install --frozen-lockfile && bun --cwd=apps/web run build:production` | `bun --cwd=apps/web run deploy:production` |
| site (staging) | `bun install --frozen-lockfile && bun --cwd=apps/site run build:staging` | `bun --cwd=apps/site run deploy:staging` |
| site (production) | `bun install --frozen-lockfile && bun --cwd=apps/site run build:production` | `bun --cwd=apps/site run deploy:production` |

Deux environnements : `staging`, déployé par la branche `staging` (`staging.pupitre.studio`, `staging-app.pupitre.studio`, Stripe en mode test, branche Neon `staging`), et `production`, déployé par la branche `main` (`app.pupitre.studio`, branche Neon `production`). L'app desktop de développement pointe sur `staging`.

### Le site, un Worker à assets statiques

`apps/site/wrangler.jsonc` : `ppt-site-staging` sur `staging.pupitre.studio`, `ppt-site` sur `pupitre.studio` et `www.pupitre.studio`. Le calque d'assets sert `dist/` et lit `_headers` et `_redirects` ; `worker/index.ts` ne fait que renvoyer `www` vers l'apex, que ce calque refuse d'écrire (URL relatives seulement).

- En-têtes de sécurité et de cache dans `apps/site/public/_headers` : `HSTS`, `CSP`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, et un an d'immuable sur `/_astro/*` et `/og/*`.
- Variables de build : `PUBLIC_POSTHOG_KEY` et `PUBLIC_POSTHOG_HOST` en production seulement — sans clé, le site ne charge aucun analytics et n'affiche pas de bandeau de consentement.
- Le garde légal (`apps/site/scripts/legal.ts`) fait échouer le build de production — `PUPITRE_ENV=production`, posé par `build:production` — quand une page de `src/content/legal/` porte un `TODO`, et, dès que `PROJECT_STAGE` de `@pupitre/shared/legal` vaut `public`, quand elle est encore un brouillon ou porte un passage à compléter. Tant que le projet se déclare en développement, les brouillons se publient avec leur avertissement. Voir [`legal.md`](./legal.md).
- La liste des releases de l'app est lue au build depuis `PUBLIC_RELEASES_URL`, posée par `build:staging` et `build:production` sur la console de l'environnement — une route publique, sans session : ce sont des fichiers publics. API injoignable n'échoue pas le build : la page de téléchargement part avec `apps/site/src/content/site/releases.ts` et un avertissement de build. En local et en test, la variable n'est pas posée, donc le build ne sort jamais sur le réseau.

## Stripe

Compte unique, Managed Payments activé et CGU acceptées sur [Managed Payments](https://dashboard.stripe.com/settings/managed-payments) : Stripe est vendeur, il calcule et reverse la taxe, gère la fraude, les litiges, les reçus et le support transactionnel. Voir [`decisions/0007`](./decisions/0007-stripe-managed-payments.md).

Un produit et deux prix, créés à l'identique en sandbox et en live :

| | |
| --- | --- |
| Produit | `Pupitre Server`, code fiscal `txcd_10103001` (SaaS, business use) |
| Prix mensuel | 10 $, `tax_behavior` `exclusive` → `STRIPE_PRICE_SERVER_MONTH` |
| Prix annuel | 100 $, deux mois offerts → `STRIPE_PRICE_SERVER_YEAR` |

Réglages du dashboard : email de support à jour dans [Business details](https://dashboard.stripe.com/settings/business-details) (Stripe y escalade, et sans réponse sous 48 h il rembourse) ; logo, CGU et confidentialité dans [Checkout settings](https://dashboard.stripe.com/settings/checkout) ; portail client limité au moyen de paiement, aux factures et à la résiliation, jamais à la quantité : les sièges se changent depuis la console par `POST /orgs/:id/seats`, et `ReconcileSeats` ne fait que rapporter l'écart avec le nombre de serveurs.

Webhook `https://app.pupitre.studio/api/v1/webhooks/stripe`, un endpoint et un secret par mode, sur les cinq événements de `HANDLED_EVENT_TYPES` : `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. En local, `stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe`.

## Distribution de l'app desktop

### Les noms exacts

| Ce qui est créé | Où | Nom exact |
| --- | --- | --- |
| Identifiant de l'app | `apps/desktop/electron-builder.yml` | `dev.pupitre.app` |
| Déclencheur | GitHub Actions `.github/workflows/release.yml` | un tag `v*`, posé sur `staging` |
| Bucket public | Cloudflare R2 | `ppt-downloads`, domaine public `dl.pupitre.studio` |
| Bucket privé | Cloudflare R2 | `ppt-agent`, les binaires de l'agent, jamais public |
| Artefacts macOS | `dl.pupitre.studio/app/<version>/` | `Pupitre-<version>-arm64.dmg`, `Pupitre-<version>-x64.dmg` |
| Artefacts Windows | `dl.pupitre.studio/app/<version>/` | `Pupitre-Setup-<version>-x64.exe` |
| Artefacts Linux | `dl.pupitre.studio/app/<version>/` | `Pupitre-<version>-x64.AppImage`, `pupitre_<version>_amd64.deb` |
| Flux de mise à jour | `dl.pupitre.studio/app/<canal>/` | `latest.yml`, `latest-mac.yml`, `latest-linux.yml` |
| Certificat macOS | Apple Developer | `Developer ID Application: <société marocaine> (<Team ID>)` |
| Clé de notarisation | App Store Connect | clé d'API, rôle *Developer*, fichier `AuthKey_<KeyID>.p8` |
| Signature Windows | Azure Trusted Signing | compte `ppt-signing`, profil de certificat `ppt-app` — voir [`tasks/windows-signing.md`](./tasks/windows-signing.md) |

Chaque artefact monte avec un fichier `.sig` à côté : la signature Ed25519 de la clé de release, la même que celle de l'agent, sur `pupitre-app\n<version>\n<système>\n<architecture>\n<sha256>\n`. Elle est aussi enregistrée dans la table `AppRelease`, avec la somme et la taille du fichier. Sur macOS et Windows, c'est la signature du système qui protège l'installation ; sur Linux, celle-ci est la seule, et elle se vérifie à la main.

Les trois `latest*.yml` sont ce que lit `electron-updater`. `electron-builder` les écrit, `apps/desktop/scripts/publish-release.ts` réécrit les liens qu'ils contiennent en URL absolues — les artefacts vivent dans le dossier de leur version, les flux dans celui de leur canal — puis les dépose sous `app/beta/`. `promote.yml` les recopie sous `app/stable/`.

### Le bucket public

Un bucket R2 `ppt-downloads`, **accès public activé** par le domaine personnalisé `dl.pupitre.studio`, TLS 1.2 au minimum. Il ne contient que des artefacts de l'app, leurs `.sig`, leurs `.blockmap` et les flux de mise à jour. Le binaire de l'agent n'y entre jamais : il reste dans le bucket privé, servi par une URL signée de cinq minutes à un serveur qui présente son jeton (voir [`security.md`](./security.md)).

### Les secrets et les variables du dépôt

| Secret GitHub | Ce que c'est | Comment l'obtenir |
| --- | --- | --- |
| `PUPITRE_RELEASE_PRIVATE_KEY` | la moitié privée de la clé Ed25519 qui signe l'agent et les artefacts de l'app | `cd apps/agent && go run ./tools/release keygen`, une seule fois, hors de toute session d'agent |
| `PUPITRE_PUBLISH_TOKEN` | le jeton du pipeline de release, préfixé `pupitre_pub_` : il n'ouvre que les quatre routes de version, n'expire pas et n'appartient à personne | tiré une fois, posé sur le Worker et ici — voir [`deploy.md`](./deploy.md), étapes 6.2 et 10.3 |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | l'accès R2 de la CI | Cloudflare → *R2* → *Manage API tokens*, droits *Object Read & Write* sur les deux buckets |
| `APPLE_CERTIFICATE` | le `.p12` du certificat Developer ID, en base 64 | `base64 -i DeveloperID.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | le mot de passe de ce `.p12` | choisi à l'export depuis Trousseau d'accès |
| `APPLE_API_KEY_CONTENT` | le `.p8` de la clé de notarisation, en base 64 | `base64 -i AuthKey_<KeyID>.p8 \| pbcopy` |
| `APPLE_API_KEY_ID` | l'identifiant de la clé | la colonne *Key ID* dans App Store Connect |
| `APPLE_API_ISSUER` | l'identifiant de l'émetteur | en haut de la page *Keys* d'App Store Connect |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | l'application Entra ID qui signe | Azure → *App registrations*, un secret client, puis le rôle *Trusted Signing Certificate Profile Signer* sur le compte de signature |

| Variable GitHub | Ce que c'est |
| --- | --- |
| `PUPITRE_PLATFORM_URL` | `https://app.pupitre.studio` — la plateforme d'un tag sur `main`, et celle que `promote.yml` sert |
| `PUPITRE_STAGING_PLATFORM_URL` | `https://staging-app.pupitre.studio` — la plateforme d'un tag sur `staging` |
| `PUPITRE_DOWNLOADS_URL` | `https://dl.pupitre.studio` |
| `PUPITRE_DOWNLOADS_BUCKET` | `ppt-downloads` |
| `PUPITRE_R2_BUCKET` | `ppt-agent`, le bucket privé des binaires de l'agent |
| `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE` | les trois noms du compte Azure Trusted Signing, lus dans le portail |

Les secrets et les variables vivent dans l'environnement **`release`**, que le propriétaire approuve à chaque exécution. Aucun jeton n'entre dans le binaire de l'app : les artefacts sont publics, et l'app n'a rien à présenter pour se mettre à jour.

### L'ordre de création

La clé de release, les buckets, le compte Apple, la clé de notarisation, Azure Trusted Signing, les secrets du dépôt : [`deploy.md`](./deploy.md), étapes 3 et 10.

### Ce que fait chaque release

Un tag `v*` déclenche `release.yml`, en trois temps :

| Job | Ce qu'il fait |
| --- | --- |
| `agent` | construit `pupitred` pour `linux/amd64` et `linux/arm64` avec garble, le signe, vérifie qu'il répond `hello` et qu'il ne laisse presque aucune chaîne lisible, le dépose sur le bucket **privé**, déclare la version par `POST /api/v1/admin/releases`, et publie les binaires signés et leur `release.json` en artefact de CI. Il refuse de continuer si `apps/desktop/package.json` ne porte pas la version du tag. |
| `desktop` | sur les trois systèmes : reprend l'agent signé du job précédent, compile le processus principal en bytecode V8, empaquette, retourne les fusibles (`onlyLoadAppFromAsar`, intégrité de l'asar, `runAsNode` coupé), signe et notarise sur macOS, signe par Azure sur Windows. |
| `publish` | rassemble les artefacts des trois systèmes, les signe avec la clé de release, les dépose sur le bucket **public** avec leur `.sig`, réécrit les flux de mise à jour, et déclare chaque fichier par `POST /api/v1/admin/app-releases`. |

Le tag est posé sur `staging` : une version sort donc toujours en **`beta`**, déclarée à **la plateforme de la branche qui porte le tag** — `staging-app` pour `staging`, `app` pour `main` — et c'est cet artefact-là, celui qui a été éprouvé, qui finit en production. Les lignes déclarées sont gardées avec les binaires, en `agent/<version>/publications.json` et `app/<version>/publications.json` dans le seau privé. Elle passe en `stable` quand la pull request `staging` → `main` est fusionnée : le push sur `main` déclenche `promote.yml`, qui reprend les tags que le merge vient de rendre accessibles, **déclare la version à la production** depuis ces deux fichiers — mêmes empreintes, mêmes clés, appels idempotents — puis change le canal de l'agent et de l'app et recopie les flux du canal. Rien n'est reconstruit ni re-signé — un second build donnerait d'autres binaires, d'autres signatures et d'autres sommes de contrôle pour le même numéro de version. Le même workflow s'appelle aussi à la main, sur une version précise, pour revenir en arrière.

Un build sans identité de signature ne s'arrête pas : electron-builder le dit et produit un artefact non signé — c'est ce qui rend `bun --cwd=apps/desktop run build:mac` utilisable sur la machine du propriétaire.

Un retour arrière se fait en promouvant la version précédente : `electron-updater` ne redescend pas de version, mais le flux du canal désigne à nouveau l'ancienne, et une app déjà à jour attend la suivante. Les artefacts d'une version publiée ne sont jamais supprimés.

### Le changelog

`apps/site/src/content/changelog/<langue>/<version>.mdx` est la **seule** source. Une entrée par version et par langue, le nom du fichier étant la version avec des tirets — `0-2-0.mdx`.

| Qui le lit | Ce qu'il en fait |
| --- | --- |
| Le site | la page `/changelog`, son flux RSS, et la version française sous `/fr/changelog` |
| `release.yml` | refuse de construire si l'entrée manque dans une des langues, puis passe le corps de l'entrée anglaise en notes de version |
| La plateforme | l'enregistre dans `AppRelease.notes`, d'où la console et l'app desktop le tirent par `GET /api/v1/releases/app/:version` |

`scripts/release-notes.ts` fait les deux : `--check` vérifie qu'une version est couverte partout, sans argument il écrit le corps de l'entrée. Les notes stockées sont anglaises parce que `AppRelease.notes` est une seule chaîne et que l'anglais est la langue que le site sert sans préfixe.

### Ce qui se construit où

Un module natif ne se compile pas pour un autre système : `node-pty` impose un runner par OS, et c'est la raison de la matrice `macos-15`, `windows-2025`, `ubuntu-24.04` du workflow. Depuis un Mac, `bun --cwd=apps/desktop run build:linux` s'arrête sur `node-gyp does not support cross-compiling native modules` — ce n'est pas une erreur de configuration.

| Système | Ce qui sort | Ce qui le signe |
| --- | --- | --- |
| macOS | `.dmg` arm64 et x64 | certificat Developer ID, puis notarisation, puis la clé de release |
| Windows | installateur NSIS de l'architecture du runner | Azure Trusted Signing si les variables existent, puis la clé de release |
| Linux | AppImage et `.deb` de l'architecture du runner | la clé de release seule : Linux n'a pas d'autorité à qui répondre |

Le `.deb` s'appelle `pupitre` et non `@pupitre/desktop` : le nom du workspace porte une barre oblique, que dpkg refuse. L'exécutable Linux s'appelle `pupitre` pour la même raison, et `pupitre.desktop` s'aligne dessus pour que l'environnement de bureau relie la fenêtre à son lanceur.

### La feuille de compatibilité

`packages/shared/src/compat` porte la seule table qui dit quelle app pilote quel agent : une ligne par génération de protocole, avec la première version d'app et la première version d'agent de cette génération. Elle part dans `apps/agent/internal/contract/schema.json` par `bun run contracts:export`, donc l'agent la porte compilée en lui.

Tant qu'aucune ligne n'est ajoutée, toutes les versions d'app pilotent toutes les versions d'agent. Une ligne s'ajoute le jour où le protocole retire ou renomme un champ, dans la même passe que le changement de `PROTOCOL_VERSION` : le `hello` d'un agent d'une autre génération répond alors lequel des deux mettre à jour, et l'app le dit sur son bandeau.

### Ce que la mise à jour ne couvre pas

Le `.deb` est installé par apt et mis à jour par apt : l'app n'y touche pas, et le dit. L'AppImage, le `.dmg` et l'installateur Windows se remplacent seuls. Un build de développement ne cherche aucune mise à jour ; un build empaqueté suit le canal que `MAIN_VITE_UPDATE_CHANNEL` lui a donné, `stable` par défaut, sur le seau que `PUPITRE_DOWNLOADS_URL` lui a donné — la même variable que la publication lit, `https://dl.pupitre.studio` quand le build n'en reçoit aucune.

## Neon

Projet `pupitre` (`plain-water-62675197`, [console](https://console.neon.tech/app/projects/plain-water-62675197)), région `aws-us-east-1`, Postgres 18. Le projet de Francfort qui l'a précédé n'existe plus : la région d'un projet Neon est figée à sa création, une migration de région est donc une recréation. C'est la région sur laquelle le Worker `apps/web` est épinglé (`placement` dans `wrangler.jsonc`). Branche `production` par défaut ; branche `staging` pour le staging et la CI de migration.

**Une branche Neon par branche Git.** `bun run dev:prepare` lit la branche Git courante et en déduit la branche Neon : `staging` — et `main`, faute d'y travailler jamais — travaille sur la branche `staging`, toute autre branche obtient `dev/<slug>`, créée depuis `staging` et périmée au bout de quatorze jours — personne ne nettoie. `production` n'est jamais visée en local, le script refuse. Le projet se résout **par son nom**, jamais par un identifiant écrit quelque part : un projet recréé, dans une autre région par exemple, est retrouvé et les URL sont réécrites. `.env.local` garde `NEON_PROJECT_ID` et `NEON_BRANCH` : c'est cette provenance, et non la simple présence des URL, qui décide s'il faut les redemander. Pour viser une branche précise sans y toucher : `PUPITRE_NEON_BRANCH=staging bun run dev:prepare`. `DATABASE_URL` utilise l'endpoint poolé de la branche visée ; `MIGRATE_DATABASE_URL` l'endpoint direct (sans `-pooler`), le seul que Prisma Migrate accepte. `db:migrate:deploy` lit `MIGRATE_DATABASE_URL` et refuse de migrer une autre branche que celle de `DATABASE_URL`.

## Dépendances

Les `overrides` du `package.json` racine sont la seule source de vérité de l'arbre d'installation ; Bun ignore les overrides par workspace. Chaque épingle a une raison écrite ici ; on n'en ajoute pas sans `bun audit` et un `bun run build` qui passent.

Épingles héritées de React-Box, à revérifier à la première mise à niveau : `typescript ^6` (TS 7 casse encore des outils), `ultracite 7.8.3` (la version suivante reformate tout le dépôt), `better-auth` exact (les mineures ont déjà cassé `customSession`).

**`miniflare` est patché** (`patches/miniflare@4.20260708.0.patch`, appliqué par `patchedDependencies`). Le `workerd` que miniflare lance en développement tourne avec le tas V8 par défaut, environ 1,4 Go ; le Worker de la console se stabilise plutôt vers 1,8 Go au bout d'une longue session de HMR. Il meurt donc, et **rien ne le relance** : miniflare le lance une seule fois et ne surveille pas sa sortie, si bien que Vite continue de tourner en répondant à chaque requête par la même trace `fetch failed` d'undici, indéfiniment, jusqu'à ce qu'on relance `bun run dev:web`. Le tas se règle par le champ `v8Flags` de la configuration workerd, que miniflare n'expose pas : le patch le lit dans `MINIFLARE_V8_FLAGS`, et le script `dev` d'`apps/web` le pose à `--max-old-space-size=4096` — comme React-Box, d'où le patch vient. La version est celle qu'`@cloudflare/vite-plugin@1.43.3` épingle ; un jour où le plugin bouge, le patch est à rejouer.

## Dashboards externes

Cloudflare Builds, Cloudflare Email Sending, R2 (les deux buckets, dont `ppt-downloads` et son domaine public), Stripe, Neon (projet `pupitre`), Apple Developer, Azure Trusted Signing. Ce document est ce qui les décrit ; rien dans le dépôt ne peut vérifier ce qu'ils exécutent. Quand un tableau ci-dessus change, le dashboard change dans la même passe.
