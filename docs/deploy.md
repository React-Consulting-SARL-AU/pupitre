# Mettre Pupitre en ligne

La suite d'actions à exécuter pour passer du dépôt Git à un service en ligne, dans l'ordre où elles se tiennent. Chaque étape suppose la précédente faite.

[`monorepo.md`](./monorepo.md) reste la référence : les noms exacts, les branches, ce que fait chaque déploiement. Ce document-ci ne redit pas ces tableaux, il dit quoi faire et dans quel ordre.

Ce qui se met en ligne :

| Ce qui est publié | Où | Ce qui le déclenche |
| --- | --- | --- |
| La console et l'API (`apps/web`) | Worker Cloudflare, `staging-app.pupitre.studio` et `app.pupitre.studio` | Cloudflare Builds, sur un push de `staging` puis de `main` |
| Le site marketing (`apps/site`) | Cloudflare Pages, `pupitre.studio` et `staging.pupitre.studio` | Cloudflare Pages, sur un push de `main` puis de `staging` |
| L'app desktop | Bucket R2 public `ppt-downloads`, servi par `dl.pupitre.studio` | GitHub Actions, sur un tag `v*` posé sur `staging` |
| L'agent `pupitred` | Bucket R2 privé `ppt-agent`, servi par la plateforme sous URL signée | le même tag, le même workflow |

**Rien de ce document ne se fait depuis une branche `main` locale** : elle est la production et les hooks refusent d'y committer. Voir [`monorepo.md`](./monorepo.md#branches).

## 0. Avant de commencer

Les comptes, tous déjà ouverts sauf mention contraire :

| Compte | Ce qu'il porte | Sans lui |
| --- | --- | --- |
| Cloudflare | la zone `pupitre.studio`, les Workers, Pages, R2, Email Routing | rien ne se met en ligne |
| Neon | le projet `pupitre`, ses branches `staging` et `production` | la console démarre et refuse toute requête |
| Stripe | le produit et ses deux prix, en sandbox et en live | les abonnements ne se souscrivent pas |
| GitHub | le dépôt, l'environnement `release` et ses secrets | l'app et l'agent ne se publient pas |
| Apple Developer | le certificat Developer ID et la clé de notarisation | le `.dmg` sort non signé, et macOS prévient |
| Azure Trusted Signing | le compte de signature et son application Entra ID | l'installateur Windows sort non signé, et SmartScreen prévient |

Les outils, sur la machine du propriétaire :

```bash
bun install
bun x wrangler login          # ouvre le navigateur, choisir le compte de la zone
neonctl auth                  # idem, pour Neon
gh auth status                # doit nommer le compte propriétaire du dépôt
stripe login                  # facultatif : sert au développement local, pas au déploiement
```

Une valeur relevée dans un dashboard va dans 1Password, jamais dans le dépôt, jamais dans une transcription de session. `scripts/assert-no-secrets.ts` refuse le commit qui en porterait une.

## 1. La zone Cloudflare

`pupitre.studio` est sur le compte. Vérifier que les enregistrements suivants n'existent pas encore, ou pointent bien là où ce document le dit : `pupitre.studio`, `www`, `app`, `staging-app`, `staging`, `dl`, `dev-app`.

`dev-app.pupitre.studio` appartient au tunnel de développement (`scripts/dev-tunnel.ts`) et ne concerne pas la mise en ligne. Il répond 530 quand le tunnel ne tourne pas : c'est normal.

**Toute ressource créée sur ce compte porte le préfixe `ppt-`.** Le compte héberge plusieurs produits ; sans ce préfixe une ressource de Pupitre ne se distingue plus.

## 2. Neon

Projet `pupitre`, `plain-water-62675197`, région `aws-us-east-1`, Postgres 18. Deux branches, qui existent déjà :

- `production`, branche par défaut, encore vierge de tout schéma ;
- `staging`, qui porte déjà la migration `20260904144610_init` et sert aussi au développement local.

Relever pour chacune, dans la console Neon, deux URL qui ne sont pas la même :

| Variable | Quel endpoint | Pourquoi |
| --- | --- | --- |
| `DATABASE_URL` | l'endpoint **poolé**, celui dont l'hôte porte `-pooler` | ce que le Worker ouvre, des centaines de fois |
| `MIGRATE_DATABASE_URL` | l'endpoint **direct**, sans `-pooler` | le seul que Prisma Migrate accepte |

La région d'un projet Neon est figée à sa création : la changer, c'est recréer le projet. Ne pas le faire sans relire cette page en entier.

## 3. Les buckets R2

Les deux existent. Ce qui suit dit ce qu'ils doivent être, pour le cas où l'un serait à refaire.

**`ppt-downloads`, public.** Il ne contient que des artefacts de l'app, leurs `.sig`, leurs `.blockmap` et les flux de mise à jour. Son domaine public :

```bash
bun x wrangler r2 bucket domain add ppt-downloads \
  --domain dl.pupitre.studio --zone-id <zone pupitre.studio> --min-tls 1.2
```

Vérifier : `curl -I https://dl.pupitre.studio` répond 404 servi par Cloudflare. Un 404 est le bon signe — le bucket est joignable et vide à la racine.

**`ppt-agent`, privé.** Ni domaine personnalisé, ni URL `r2.dev`. Rien ne l'atteint depuis l'internet : c'est ce qui garde le binaire de l'agent hors de portée. Le Worker en sert le contenu par une URL S3 pré-signée de cinq minutes qu'il calcule lui-même.

Il lui faut pour cela un jeton d'API R2 : Cloudflare → *R2* → *Manage API tokens* → *Create API token*, permission **Object Read only**, restreint au seul bucket `ppt-agent`. Il rend une clé d'accès et un secret, qui font avec l'identifiant de compte les quatre valeurs :

| Valeur | D'où elle vient |
| --- | --- |
| `R2_ACCOUNT_ID` | l'identifiant de compte Cloudflare |
| `R2_ACCESS_KEY_ID` | le jeton créé ci-dessus |
| `R2_SECRET_ACCESS_KEY` | idem, montré une seule fois |
| `R2_BUCKET_NAME` | `ppt-agent` |

Elles vivent à deux endroits, et il faut les deux : la note 1Password, d'où `dev:prepare` les tire en développement, et les secrets Wrangler de **chaque** environnement.

Un second jeton, celui de la CI, se crée au même endroit avec la permission **Object Read & Write** sur les deux buckets : il devient `CLOUDFLARE_API_TOKEN` dans GitHub Actions (étape 8).

## 4. Cloudflare Email Routing

Email Routing activé sur la zone, adresse `no-reply@pupitre.studio` vérifiée. C'est ce qui alimente le binding `EMAIL` déclaré dans `apps/web/wrangler.jsonc` — le lien magique, les alertes et les emails transactionnels en dépendent.

## 5. Stripe

Compte unique, **Managed Payments** activé et CGU acceptées : Stripe est vendeur, il calcule et reverse la taxe, gère la fraude, les litiges, les reçus et le support transactionnel. Voir [`decisions/0007`](./decisions/0007-stripe-managed-payments.md).

Un produit et deux prix, créés **à l'identique** en sandbox et en live :

| | |
| --- | --- |
| Produit | `Pupitre Server`, code fiscal `txcd_10103001` (SaaS, business use) |
| Prix mensuel | 19 $, `tax_behavior` `exclusive` → `STRIPE_PRICE_SERVER_MONTH` |
| Prix annuel | 190 $, deux mois offerts → `STRIPE_PRICE_SERVER_YEAR` |

Le staging utilise la sandbox, la production le live. Relever de chaque côté la clé secrète (`STRIPE_SECRET_KEY`) et les deux identifiants de prix.

Le secret de webhook vient d'un endpoint créé pour chaque environnement, sur `https://<domaine>/api/v1/webhooks/stripe` → `STRIPE_WEBHOOK_SECRET`. Cet endpoint ne peut être créé qu'une fois le domaine en ligne : y revenir après l'étape 6.

Réglages du dashboard, une fois : email de support à jour dans *Business details* — Stripe y escalade, et sans réponse sous 48 h il rembourse ; logo, CGU et confidentialité dans *Checkout settings* ; portail client limité au moyen de paiement, aux factures et à la résiliation, **jamais à la quantité** — les sièges se changent depuis la console.

## 6. Le Worker de staging

### 6.1 Le premier déploiement, à la main

Un secret ne s'attache qu'à un Worker qui existe. On le crée donc une fois sans le garde-fou, depuis une branche de travail, avec les deux URL de la branche Neon `staging` dans l'environnement :

```bash
bun --cwd=apps/web run build:staging
bun x wrangler deploy --config apps/web/dist/server/wrangler.json --keep-vars
```

`build:staging` applique d'abord les migrations sur la branche Neon visée, **puis** construit avec `CLOUDFLARE_ENV=staging`, ce qui fige l'environnement dans `apps/web/dist/server/wrangler.json` — le déploiement ne prend donc pas `--env`.

Le Worker créé s'appelle `ppt-web-staging` : Wrangler est en environnements *legacy* et suffixe le nom racine. Il n'y a rien à saisir dans le dashboard : le domaine, les cinq Cron Triggers, les Workflows et le binding email viennent tous de `wrangler.jsonc`.

### 6.2 Les secrets

Seize secrets, listés dans `secrets.required` de l'environnement `staging` de [`apps/web/wrangler.jsonc`](../apps/web/wrangler.jsonc) — c'est cette liste, et elle seule, qui fait foi. Un par un, ou en une fois depuis un fichier JSON gardé hors du dépôt :

```bash
bun x wrangler secret put DATABASE_URL --config apps/web/wrangler.jsonc --env staging
bun x wrangler secret bulk ~/secrets/pupitre-staging.json --config apps/web/wrangler.jsonc --env staging
bun --cwd=apps/web run check:secrets staging     # doit dire que tout est là
```

`BETTER_AUTH_SECRET` et `INTERNAL_WORKFLOW_SECRET` sont à tirer au sort, une fois, et à garder : `openssl rand -base64 32`. Les cinq `TUNNEL_*` viennent du tunnel Cloudflare de l'exposition ; les quatre `R2_*` de l'étape 3 ; les quatre `STRIPE_*` de l'étape 5.

Les identifiants de connexion sociale (`GITHUB_CLIENT_ID`, `GOOGLE_CLIENT_ID` et leurs secrets) **ne sont pas** dans la liste de staging : ils sont facultatifs, et l'écran de connexion n'offre que les fournisseurs configurés. Les poser rend le bouton ; les taire laisse le lien magique et la clé d'accès.

### 6.3 Vérifier

```bash
curl -s https://staging-app.pupitre.studio/api/v1/health      # {"ok":true}
curl -sI https://staging-app.pupitre.studio/status | head -1  # 200, sans session
```

Et dans le tableau de bord du Worker : les cinq Cron Triggers, les cinq Workflows, le domaine personnalisé attaché.

## 7. Le Worker de production

Les mêmes trois étapes, avec `production` partout : `build:production`, la liste `secrets.required` de l'environnement `production`, `check:secrets production`. Les valeurs sont **différentes** — branche Neon `production`, Stripe en live — et rien ne doit être recopié depuis le staging.

La branche Neon `production` est encore vierge : la migration `init` s'y appliquera au premier `build:production`. C'est le seul moment où cela arrive sans avoir été éprouvé ailleurs ; le staging l'a déjà prise.

## 8. Cloudflare Builds

Deux projets Workers Builds sur le même dépôt — un projet par Worker, et les environnements *legacy* en font deux. Ce sont eux qui remplacent le déploiement à la main.

| | staging | production |
| --- | --- | --- |
| Branche | `staging` | `main` |
| Build command | `bun install --frozen-lockfile && bun --cwd=apps/web run build:staging` | `bun install --frozen-lockfile && bun --cwd=apps/web run build:production` |
| Deploy command | `bun --cwd=apps/web run deploy:staging` | `bun --cwd=apps/web run deploy:production` |
| Build variables | `VITE_APP_URL=https://staging-app.pupitre.studio` | `VITE_APP_URL=https://app.pupitre.studio` |
| Build secrets | `DATABASE_URL`, `MIGRATE_DATABASE_URL` de la branche Neon `staging` | les mêmes, de la branche `production` |

`build:*` migre avant de construire, `deploy:*` refuse de partir s'il manque un secret : les deux échouent avant d'avoir touché au Worker en place.

**La production se déploie donc en fusionnant la pull request `staging` → `main`**, jamais en taguant : Cloudflare Builds ne se déclenche que sur une branche.

## 9. Le site sur Pages

Projet Pages `ppt-site`, relié au dépôt, branche de production `main`.

| Champ | Valeur |
| --- | --- |
| Build command | `bun install --frozen-lockfile && bun --cwd=apps/site run build` |
| Output directory | `apps/site/dist` |
| Branche de production | `main` → `pupitre.studio` |
| Branche de prévisualisation | `staging`, aliasée en `staging.pupitre.studio` |

Domaines : `pupitre.studio` en apex, `www.pupitre.studio` redirigé en 301 par `apps/site/public/_redirects`. Les en-têtes de sécurité et de cache — `HSTS`, `CSP`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, un an d'immuable sur `/_astro/*` et `/og/*` — sont dans `apps/site/public/_headers`. Rien de tout cela ne se saisit dans le dashboard.

Variables de build :

| Variable | Où | Ce qu'elle fait |
| --- | --- | --- |
| `PUBLIC_RELEASES_URL` | les deux branches | `https://app.pupitre.studio/api/v1/releases/app` — la page de téléchargement lit la liste des versions au build. Route publique, sans session |
| `PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST` | production seulement | sans clé, le site ne charge aucun analytics et n'affiche pas de bandeau de consentement |

Deux garde-fous à connaître, tous deux dans le build :

- **Le garde légal** (`apps/site/scripts/legal.ts`) fait échouer le build de production — `CF_PAGES_BRANCH=main` ou `PUPITRE_ENV=production` — quand une page de `src/content/legal/` porte un `TODO`. Tant que `PROJECT_STAGE` de `@pupitre/shared/legal` vaut autre chose que `public`, les brouillons passent avec leur avertissement. Voir [`legal.md`](./legal.md).
- **La liste des versions** n'échoue pas le build si l'API est injoignable : la page part avec `apps/site/src/content/site/releases.ts` et un avertissement. En local et en test la variable n'est pas posée, donc le build ne sort jamais sur le réseau.

## 10. GitHub

### 10.1 Les branches

`main` est la production, `staging` la branche de travail. Le dépôt n'autorise que le merge commit — ni squash, ni rebase — pour que le commit tagué d'une version reste dans l'historique de `main` :

```bash
gh repo edit jordanmonier/pupitre \
  --enable-squash-merge=false --enable-rebase-merge=false --enable-merge-commit
```

**Ce dépôt est privé sur un plan GitHub Free**, qui refuse les rulesets et les relecteurs requis : `main` n'a aucune protection côté serveur, et l'environnement `release` n'approuve rien. Les hooks locaux sont la seule barrière, et ils ne protègent que la machine où `bun install` est passé. GitHub Pro lève les deux.

### 10.2 Les variables du dépôt

Quatre, sans secret, déjà posées :

```bash
gh variable set PUPITRE_PLATFORM_URL     --body "https://app.pupitre.studio"
gh variable set PUPITRE_DOWNLOADS_URL    --body "https://dl.pupitre.studio"
gh variable set PUPITRE_DOWNLOADS_BUCKET --body "ppt-downloads"
gh variable set PUPITRE_R2_BUCKET        --body "ppt-agent"
```

Les trois `AZURE_SIGNING_*` s'ajoutent au même endroit quand le compte de signature existe. Tant qu'elles sont vides, le build Windows va au bout et sort non signé, en le disant.

### 10.3 L'environnement `release` et ses secrets

L'environnement existe. Douze secrets, tous posés par le propriétaire — aucun ne doit traverser une session d'agent :

| Secret | Comment l'obtenir | Sans lui |
| --- | --- | --- |
| `PUPITRE_RELEASE_PRIVATE_KEY` | `cd apps/agent && go run ./tools/release keygen`, une seule fois | rien ne se construit |
| `PUPITRE_ADMIN_TOKEN` | une session d'un compte `platform_admin` de la console | la version ne se déclare pas à la plateforme |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | le jeton R2 *Object Read & Write* de l'étape 3 | rien ne monte sur R2 |
| `APPLE_CERTIFICATE` | `base64 -i DeveloperID.p12 \| pbcopy` | le `.dmg` sort non signé |
| `APPLE_CERTIFICATE_PASSWORD` | choisi à l'export depuis Trousseau d'accès | idem |
| `APPLE_API_KEY_CONTENT` | `base64 -i AuthKey_<KeyID>.p8 \| pbcopy` | pas de notarisation |
| `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | la page *Keys* d'App Store Connect | idem |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | l'application Entra ID du compte de signature | l'installateur Windows sort non signé |

**`PUPITRE_ADMIN_TOKEN` n'existe qu'une fois `app.pupitre.studio` en ligne** et un compte de support créé : c'est la contrainte d'ordre de tout ce document. Cloudflare d'abord, la première release ensuite.

La clé de release mérite un mot : une **seule** paire Ed25519 signe toutes les releases, l'agent comme les artefacts de l'app, stable dans le temps. Sa moitié privée va dans 1Password puis dans le secret ; sa moitié publique est recopiée dans `AGENT_RELEASE_PUBLIC_KEY` de `apps/desktop/src/main/agent-release.ts`. Les deux moitiés vont ensemble : une app qui embarque une clé publique et un agent construit avec une autre refusent toute mise à jour, sans message utile.

## 11. La première release

Une release livre deux artefacts sur le **même tag** : l'app desktop et l'agent. La procédure complète est la skill `release` ; en résumé :

```bash
git switch staging && git pull --ff-only
bun scripts/release-notes.ts 0.1.0 --check   # l'entrée de changelog existe dans les deux langues
git tag -a v0.1.0 -m "Pupitre 0.1.0"
git push origin v0.1.0
```

Le push du tag déclenche `release.yml`, qui refuse de commencer si le tag n'est ni sur `staging` ni sur `main`, si le changelog ne couvre pas la version, ou si `apps/desktop/package.json` ne porte pas ce numéro. Puis : l'agent est construit, obfusqué, signé, éprouvé et déposé sur le bucket privé ; l'app est empaquetée sur les trois systèmes, signée et notarisée ; les artefacts montent sur le bucket public et sont déclarés à la plateforme.

**La version sort en `beta`.** Elle passe en `stable` au merge de la pull request `staging` → `main`, qui déclenche `promote.yml` — le même artefact, celui qui a été éprouvé, sans reconstruction.

## 12. Vérifier de bout en bout

```bash
curl -s https://app.pupitre.studio/api/v1/health                    # {"ok":true}
curl -s "https://app.pupitre.studio/api/v1/releases/app/latest?channel=beta" | head -c 200
curl -sI https://pupitre.studio | head -1                           # 200
curl -sI https://staging.pupitre.studio | head -1                   # 200
curl -sI https://dl.pupitre.studio/app/0.1.0/latest.yml | head -1   # 200
```

Et à la main : le `.dmg` s'ouvre sur un Mac vierge sans avertissement Gatekeeper ; SmartScreen ne bloque pas l'installateur signé ; l'app installe l'agent de la version sur le VPS de staging, et `hello` renvoie l'`agent_version` attendue.

## 13. Ce que rien n'automatise

- **Un secret ou un certificat.** Aucun n'entre dans le dépôt, dans un log de CI ou dans une transcription de session.
- **La création des projets Cloudflare Builds et Pages**, qui passe par un flux OAuth GitHub dans le dashboard.
- **La validation d'identité Azure Trusted Signing**, qui prend quelques jours et demande des justificatifs.
- **Un retour arrière de migration.** Une migration Prisma qui casse se corrige par une migration suivante, jamais en jouant l'inverse. Le Worker, lui, se rembobine : `bun x wrangler rollback --config apps/web/dist/server/wrangler.json`.
- **La mise à jour de ce document.** Quand un dashboard change, il change ici dans la même passe — c'est la seule trace qu'en garde le dépôt.
