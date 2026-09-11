# Mettre Pupitre en ligne

Ce document suppose que tu ne connais pas le projet. Il donne les gestes dans l'ordre, la commande exacte à chaque fois, et ce qui casse quand une étape est sautée. Suivi de bout en bout, il mène d'un dépôt Git à un service qui répond.

Compte une demi-journée la première fois, dont la moitié à attendre des vérifications de comptes tiers.

## 1. Ce que tu mets en ligne

Quatre choses, sur deux environnements.

| Ce qui est publié | Où | Ce qui le déclenche |
| --- | --- | --- |
| La console et l'API — un seul Worker Cloudflare | `staging-app.pupitre.studio`, puis `app.pupitre.studio` | un push sur la branche `staging`, puis sur `main` |
| Le site marketing — un Worker à assets statiques | `staging.pupitre.studio`, puis `pupitre.studio` | les mêmes branches |
| L'app desktop (macOS, Windows, Linux) | le seau public `ppt-downloads`, servi par `dl.pupitre.studio` | `scripts/release.sh` sur le Mac du propriétaire, qui pose le tag `vX.Y.Z` sur `staging` une fois tout publié |
| L'agent `pupitred`, installé sur le serveur du client | le seau privé `ppt-agent`, que rien n'atteint directement | la même commande |

**Staging d'abord, production ensuite.** Les deux environnements sont identiques en tout sauf leurs valeurs : même code, mêmes seize secrets, mêmes vérifications. Ce que tu apprends sur l'un s'applique à l'autre.

Les branches : `staging` est la branche de travail, `main` est la production et ne change que par une pull request depuis `staging`. Les hooks du dépôt refusent d'y committer en local. Voir [`monorepo.md`](./monorepo.md#branches).

## 2. Avant de commencer

### Les comptes

| Compte | Ce qu'il porte | Coût | Délai |
| --- | --- | --- | --- |
| **Cloudflare** | le domaine, le Worker, le site, les deux seaux de fichiers | gratuit pour commencer | immédiat |
| **Neon** | la base de données Postgres | gratuit pour commencer | immédiat |
| **Stripe** | le produit et ses deux prix | commission par vente | quelques jours de vérification |
| **GitHub** | le dépôt et sa CI — la publication se fait depuis le Mac | gratuit | immédiat |
| Apple Developer | la signature de l'app macOS | 99 $/an | quelques jours |
| Azure Trusted Signing | la signature de l'app Windows | à l'usage | quelques jours de vérification |

Les quatre premiers suffisent pour mettre le service en ligne. Les deux derniers ne concernent que la publication de l'app desktop : sans eux elle se construit quand même, non signée, et les systèmes préviennent l'utilisateur au premier lancement.

### Les outils

```bash
bun install                 # depuis la racine du dépôt
bun x wrangler login        # ouvre le navigateur : choisir le compte qui porte le domaine
neonctl auth                # idem, pour la base de données
gh auth status              # doit afficher le compte propriétaire du dépôt
```

### La règle sur les secrets

**Aucune valeur ne se tape à la main dans un fichier du dépôt.** Chaque secret est déposé dans 1Password — coffre et note nommés dans [`op.config.json`](../op.config.json) — et `bun run dev:prepare` va l'y chercher pour le développement local. Le dépôt ne contient que des références ; un hook refuse le commit qui porterait une valeur.

## 3. Les seize secrets

C'est la partie qui bloque tout le monde. Elle est ici en entier.

Le Worker exige **les seize**, dans les deux environnements. La liste vit dans [`apps/web/wrangler.jsonc`](../apps/web/wrangler.jsonc) sous `secrets.required`, et `deploy:staging` comme `deploy:production` refusent de partir s'il en manque un : c'est un garde-fou, pas une préférence. Il n'y a donc pas de « déployer d'abord, compléter ensuite ».

En revanche tu peux les obtenir dans l'ordre, et trois d'entre eux se fabriquent en une commande.

### D'un coup d'œil

| Secret | À quoi il sert | Où le prendre | staging et production |
| --- | --- | --- | --- |
| `DATABASE_URL` | tout : sans base, rien ne répond | Neon | **valeurs différentes** |
| `BETTER_AUTH_SECRET` | signe les sessions de connexion | tu le tires toi-même | **valeurs différentes** |
| `INTERNAL_WORKFLOW_SECRET` | ferme le déclencheur interne des tâches de fond | tu le tires toi-même | **valeurs différentes** |
| `PUPITRE_PUBLISH_TOKEN` | laisse la CI déclarer une version publiée | tu le tires toi-même | même valeur des deux côtés |
| `STRIPE_SECRET_KEY` | ouvrir un paiement | Stripe | sandbox / live |
| `STRIPE_WEBHOOK_SECRET` | vérifier que Stripe est bien l'émetteur | Stripe | sandbox / live |
| `STRIPE_PRICE_SERVER_MONTH` | le prix mensuel | Stripe | sandbox / live |
| `STRIPE_PRICE_SERVER_YEAR` | le prix annuel | Stripe | sandbox / live |
| `R2_ACCOUNT_ID` | servir le binaire de l'agent | Cloudflare | même valeur des deux côtés |
| `R2_ACCESS_KEY_ID` | idem | Cloudflare | même valeur des deux côtés |
| `R2_SECRET_ACCESS_KEY` | idem | Cloudflare | même valeur des deux côtés |
| `R2_BUCKET_NAME` | idem — vaut `ppt-agent` | c'est le nom du seau | même valeur des deux côtés |

| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | la connexion par GitHub | l'OAuth App GitHub | **une OAuth App par hôte** : GitHub n'accepte qu'une adresse de retour par app |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | la connexion par Google | Google Cloud, identifiant OAuth « application Web » | même client possible, une URI de redirection par hôte |

**Les quatre secrets de connexion sociale sont requis, mais le produit s'en passe** : l'écran de connexion n'affiche que les fournisseurs dont l'identifiant et le secret sont là, et sans eux il reste le lien par email et la clé d'accès. Ils sont dans la liste pour que la console en ligne les offre, et pour qu'une valeur oubliée se voie au déploiement plutôt qu'à l'écran. L'adresse de retour est `https://<hôte>/api/auth/callback/github` et `…/callback/google` ; une OAuth App GitHub ne connaît qu'un hôte, il en faut donc une pour `localhost:3000`, une pour le staging et une pour la production.

### Ce qui casse si l'un est faux

Un secret présent mais faux ne bloque pas le déploiement : le garde-fou compte les secrets, il ne les essaie pas. Voici ce que tu observeras.

| Faux ou factice | Ce qui marche quand même | Ce qui casse |
| --- | --- | --- |
| `DATABASE_URL` | rien | tout, dès la première page |
| `BETTER_AUTH_SECRET` | les pages publiques | toute connexion |
| `INTERNAL_WORKFLOW_SECRET` | tout, tâches planifiées comprises | seulement le déclenchement manuel d'une tâche de fond, qui ne sert qu'en développement |
| `PUPITRE_PUBLISH_TOKEN` | tout le service | la CI ne peut plus déclarer de version publiée |
| les quatre `STRIPE_*` | la connexion, la console, l'ajout d'un serveur | souscrire un abonnement |
| les quatre `R2_*` | la console entière | l'app ne peut pas télécharger l'agent, donc aucune installation sur un serveur |

Autrement dit : `DATABASE_URL` et `BETTER_AUTH_SECRET` sont les deux seuls dont une valeur fausse rend le service inutilisable. Les autres dégradent une fonction, et le disent.

### Les trois que tu fabriques toi-même

Trente secondes, aucun compte tiers.

```bash
# BETTER_AUTH_SECRET, puis INTERNAL_WORKFLOW_SECRET : une valeur par environnement
openssl rand -base64 32

# PUPITRE_PUBLISH_TOKEN : le préfixe fait partie du jeton, il n'est pas décoratif
echo "pupitre_pub_$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
```

Le préfixe `pupitre_pub_` est ce à quoi la plateforme reconnaît un jeton de publication ; sans lui elle le prend pour une session et le refuse. Ce jeton va à deux endroits, mot pour mot identique : les secrets des deux Workers, et la note 1Password de la release (étape 8).

### `DATABASE_URL` — Neon

Le projet s'appelle `pupitre` et porte deux branches, `production` et `staging`. Dans la console Neon, ouvre la branche, puis *Connection details*. Relève **deux** adresses, qui ne sont pas la même :

| Variable | Quel point de connexion | Pourquoi |
| --- | --- | --- |
| `DATABASE_URL` | celui dont l'hôte contient `-pooler` | ce que le Worker ouvre, des centaines de fois |
| `MIGRATE_DATABASE_URL` | celui **sans** `-pooler` | le seul que l'outil de migration accepte |

`MIGRATE_DATABASE_URL` n'est pas un secret du Worker : il ne sert qu'à la construction, et se donne à Cloudflare Builds à l'étape 7.

### Les quatre `R2_*` — Cloudflare

Ils servent à une seule chose : laisser la plateforme distribuer le binaire de l'agent depuis un seau que rien n'atteint autrement.

Cloudflare → **R2** → *Manage API tokens* → *Create API token*. Permission **Object Read only**, restreinte au seul seau `ppt-agent`. Cloudflare affiche alors une clé et un secret — **le secret n'est montré qu'une fois**.

| Variable | Valeur |
| --- | --- |
| `R2_ACCOUNT_ID` | l'identifiant de ton compte Cloudflare, dans le tableau de bord |
| `R2_ACCESS_KEY_ID` | la clé que le jeton vient de rendre |
| `R2_SECRET_ACCESS_KEY` | le secret, montré une seule fois |
| `R2_BUCKET_NAME` | `ppt-agent` |

Crée **un second jeton** au même endroit, celui-là en **Object Read & Write** sur les deux seaux : sa clé et son secret deviennent `R2_ACCESS_KEY_ID` et `R2_SECRET_ACCESS_KEY` dans la note 1Password de la release, étape 8. La chaîne de release parle S3 directement, avec ce jeton-là, et rien d'autre : un jeton d'API Cloudflare ouvrirait tous les seaux du compte, celui-ci n'ouvre que les deux. Ne réutilise pas le premier — celui du Worker n'a pas à pouvoir écrire.

### Les quatre `STRIPE_*` — Stripe

Un produit et deux prix, à créer **deux fois** : en sandbox pour le staging, en live pour la production. Tant que la production reste volontairement en sandbox — c'est le cas au premier déploiement, le temps que le compte Stripe soit vérifié — les deux environnements partagent la clé et les prix, et chacun a son propre webhook.

| | |
| --- | --- |
| Produit | `Pupitre Server`, code fiscal `txcd_10103001` (logiciel en ligne, usage professionnel) |
| Prix mensuel | 10 $, taxe en sus → `STRIPE_PRICE_SERVER_MONTH` |
| Prix annuel | 100 $, deux mois offerts → `STRIPE_PRICE_SERVER_YEAR` |

`STRIPE_SECRET_KEY` se relève dans *Developers* → *API keys*.

`STRIPE_WEBHOOK_SECRET` demande une adresse en ligne : il vient d'un point de terminaison créé sur `https://<ton-domaine>/api/v1/webhooks/stripe`. **Tu ne peux donc pas l'obtenir avant l'étape 6.** Deux façons de s'en sortir : créer le Worker une première fois avec une valeur factice pour ce seul secret et la remplacer ensuite, ou faire l'étape 6 en sachant que la souscription ne marchera qu'après ce retour. Rien d'autre n'en dépend. C'est la seule circularité du document, et elle coûte un aller-retour.

Trois réglages à faire une fois dans le tableau de bord Stripe : **Managed Payments** activé et conditions acceptées — c'est ce qui fait de Stripe le vendeur, qui calcule et reverse la taxe ; l'adresse de support à jour, car Stripe y escalade et rembourse sans réponse sous 48 heures ; le portail client limité au moyen de paiement, aux factures et à la résiliation, **jamais à la quantité** — le nombre de serveurs se change depuis la console, pas depuis Stripe.

## 4. Le domaine et les seaux

`pupitre.studio` est sur le compte Cloudflare. **Toute ressource créée y porte le préfixe `ppt-`** : le compte héberge plusieurs produits, et sans ce préfixe on ne les distingue plus.

Deux seaux R2, deux régimes.

**`ppt-downloads`, public.** Il ne contient que les fichiers de l'app et leurs signatures. Son adresse publique :

```bash
bun x wrangler r2 bucket domain add ppt-downloads \
  --domain dl.pupitre.studio --zone-id <identifiant de la zone> --min-tls 1.2
```

Vérifie : `curl -I https://dl.pupitre.studio` répond **404 servi par Cloudflare**. Un 404 est le bon signe — le seau répond, et sa racine est vide.

**`ppt-agent`, privé.** Ni adresse publique, ni URL `r2.dev`. Rien ne l'atteint depuis internet : c'est ce qui garde le binaire de l'agent hors de portée. La plateforme en sert le contenu par une adresse signée valable cinq minutes, qu'elle calcule elle-même, et seulement à un serveur qui présente son jeton.

**Email.** Le Worker envoie par le binding `send_email` d'Email Sending : active Email Sending sur le compte et fais vérifier le domaine `pupitre.studio` comme expéditeur (les enregistrements DKIM et SPF sont posés sur la zone). Rien à recevoir, donc pas d'Email Routing. Sans domaine vérifié aucun lien de connexion ne part, donc personne ne se connecte.

## 5. La base de données

Deux branches Neon dans le projet `pupitre` : `production` et `staging`. Elles existent déjà. Tu n'as rien à créer ni à migrer à la main — la construction applique les migrations avant de déployer, à chaque fois.

Une seule chose à savoir : `MIGRATE_DATABASE_URL` doit désigner le point de connexion **direct** de la branche visée. Un point poolé est refusé, avec un message qui le dit.

## 6. Le premier déploiement, à la main

Un Worker naît avec ses seize secrets, ou ne naît pas : `wrangler deploy` refuse de créer un Worker dont un secret de `secrets.required` manque, et `wrangler secret put` ne sait rien attacher à un Worker qui n'existe pas encore. Le premier déploiement fournit donc les seize d'un coup, par `--secrets-file`. On le fait une fois, sans passer par la construction automatique.

Les valeurs vivent dans 1Password, dans le même coffre que la note de développement : un item par environnement, `pupitre-staging` et `pupitre-production`, un champ par secret, nommé exactement comme le Worker l'attend. Le fichier de secrets n'existe jamais sur le disque : il est composé à la volée depuis 1Password et remis à `wrangler` par une substitution de processus.

Depuis une branche de travail, avec les deux adresses de la branche Neon `staging` dans l'environnement :

```bash
bun --cwd=apps/web run build:staging
bun x wrangler deploy --config apps/web/dist/server/wrangler.json --keep-vars \
  --secrets-file <(op item get pupitre-staging --vault "DEV - React Consulting" --format json \
    | jq '[.fields[] | select(.label and .value)] | map({(.label): .value}) | add')
```

Le Worker s'appelle `ppt-web-staging`. Rien ne se saisit dans le tableau de bord : l'adresse, les tâches planifiées et les liens de service viennent tous de `wrangler.jsonc`.

Ensuite, un secret qui change se pose seul, ou tous d'un coup, par le même canal :

```bash
op read "op://DEV - React Consulting/pupitre-staging/STRIPE_WEBHOOK_SECRET" \
  | bun x wrangler secret put STRIPE_WEBHOOK_SECRET --config apps/web/wrangler.jsonc --env staging
bun x wrangler secret bulk --config apps/web/wrangler.jsonc --env staging <(op item get pupitre-staging \
  --vault "DEV - React Consulting" --format json \
  | jq '[.fields[] | select(.label and .value)] | map({(.label): .value}) | add')
bun --cwd=apps/web run check:secrets staging     # doit dire que tout est là
```

**Recommence l'étape entière pour `production`**, avec `build:production`, `--env production` et `check:secrets production`. Les valeurs diffèrent : branche Neon `production`, ses propres `BETTER_AUTH_SECRET` et `INTERNAL_WORKFLOW_SECRET`, son propre webhook Stripe. Les quatre `R2_*`, le jeton de publication et — tant que Stripe reste en sandbox — les trois autres `STRIPE_*` sont les mêmes qu'en staging.

Vérifie :

```bash
curl -s https://staging-app.pupitre.studio/api/v1/health       # {"ok":true}
curl -sI https://staging-app.pupitre.studio/status | head -1    # 200, sans être connecté
```

## 7. Les déploiements automatiques

À partir d'ici, plus rien ne se déploie à la main.

**Deux projets Workers Builds** sur le dépôt — un par environnement, c'est ainsi que Cloudflare les sépare. La création passe par une autorisation GitHub dans le tableau de bord ; elle ne s'automatise pas.

| | staging | production |
| --- | --- | --- |
| Branche surveillée | `staging` | `main` |
| Commande de construction | `bun install --frozen-lockfile && bun --cwd=apps/web run build:staging` | `bun install --frozen-lockfile && bun --cwd=apps/web run build:production` |
| Commande de déploiement | `bun --cwd=apps/web run deploy:staging` | `bun --cwd=apps/web run deploy:production` |
| Variable de construction | `VITE_APP_URL=https://staging-app.pupitre.studio` | `VITE_APP_URL=https://app.pupitre.studio` |
| Secrets de construction | `DATABASE_URL` et `MIGRATE_DATABASE_URL` de la branche Neon `staging` | les mêmes, de la branche `production` |

La construction migre la base **avant** de construire, et le déploiement refuse de partir s'il manque un secret : les deux échouent avant d'avoir touché au Worker en place.

**Deux projets Workers Builds de plus** pour le site marketing, sur les Workers `ppt-site-staging` et `ppt-site`. Un projet Pages relié à Git ne se crée que dans le tableau de bord et ne se convertit jamais ; le site est donc un Worker à assets statiques comme la console, déployable d'ici avant que l'automatique existe.

| | staging | production |
| --- | --- | --- |
| Branche surveillée | `staging` | `main` |
| Commande de construction | `bun install --frozen-lockfile && bun --cwd=apps/site run build:staging` | `bun install --frozen-lockfile && bun --cwd=apps/site run build:production` |
| Commande de déploiement | `bun --cwd=apps/site run deploy:staging` | `bun --cwd=apps/site run deploy:production` |

Les deux scripts de construction portent `PUBLIC_RELEASES_URL` — la liste des versions que la page de téléchargement lit — et celui de production pose `PUPITRE_ENV=production`, ce qui fait refuser au garde légal un `TODO` dans une page légale. Si l'API ne répond pas, la construction n'échoue pas : la page part avec une liste écrite dans le dépôt et un avertissement. Les redirections et les en-têtes de sécurité sont dans `apps/site/public/`, lus par le calque d'assets ; `www` est renvoyé vers l'apex par `apps/site/worker/index.ts`, la seule chose que ce calque ne sait pas dire.

Le premier déploiement de chaque Worker du site se fait à la main, sans secret à fournir :

```bash
bun --cwd=apps/site run build:staging && bun --cwd=apps/site run deploy:staging
bun --cwd=apps/site run build:production && bun --cwd=apps/site run deploy:production
```

## 8. GitHub

### Les réglages du dépôt

```bash
gh repo edit <compte>/pupitre \
  --enable-squash-merge=false --enable-rebase-merge=false --enable-merge-commit
```

Le squash est interdit parce qu'il réécrit les commits : le commit tagué d'une version sortirait de l'historique de `main`, et la promotion de cette version ne le retrouverait plus.

**Ce dépôt est privé sur un plan GitHub gratuit**, qui refuse la protection de branche et les relecteurs obligatoires. `main` n'a donc **aucune protection côté serveur** : les hooks du dépôt sont la seule barrière, et ils ne protègent que la machine sur laquelle `bun install` est passé. GitHub Pro lève les deux.

## 8 bis. La note 1Password de la release

La chaîne de release ne tourne pas sur GitHub : elle tourne sur le Mac du propriétaire, `scripts/release.sh`, et lit ses valeurs dans **une note 1Password**, `pupitre-GitHub` dans le coffre partagé, par `op run` — rien n'est jamais écrit dans un fichier. `scripts/release/release.env.tpl` dit quels champs elle attend ; les valeurs publiques (les deux plateformes, les seaux, l'identifiant du compte R2) y sont en clair.

| Champ | D'où il vient | Sans lui |
| --- | --- | --- |
| `PUPITRE_PUBLISH_TOKEN` | la même valeur qu'à l'étape 3, mot pour mot | la version se construit et ne se déclare pas |
| `PUPITRE_RELEASE_PRIVATE_KEY` | `cd apps/agent && go run ./tools/release keygen`, une seule fois | rien ne se construit |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | le second jeton R2 de l'étape 3, *Object Read & Write* sur les deux seaux | rien ne monte sur les seaux |
| `APPLE_API_KEY_CONTENT` | `base64 -i AuthKey_<id>.p8 \| pbcopy` | pas de notarisation |
| `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | la page *Keys* d'App Store Connect | idem |

Les trois premières lignes suffisent pour publier. Les autres notarisent l'app macOS ; sa **signature** vient du certificat Developer ID du trousseau du Mac, qu'electron-builder trouve seul — il ne s'importe pas depuis un fichier. Windows sort non signé : Azure Trusted Signing n'existe que sur Windows.

**La clé de publication mérite une phrase.** Une seule paire de clés signe tout ce que Pupitre publie, pour toujours. Sa moitié privée est dans cette note et nulle part ailleurs ; sa moitié publique est déjà écrite dans le code de l'app. Les deux vont ensemble : une app qui connaît une clé publique et un agent signé avec une autre refusent toute mise à jour, sans message utile. Ne la régénère pas.

**Faire tourner le jeton de publication ne coupe rien**, dans cet ordre : poser le nouveau sur le Worker sous `PUPITRE_PUBLISH_TOKEN` et l'ancien sous `PUPITRE_PUBLISH_TOKEN_PREVIOUS`, changer le champ de la note, puis retirer l'ancien. La plateforme accepte les deux entre-temps.

## 9. La première version publiée

```bash
git switch staging && git pull --ff-only
scripts/release.sh --version=0.1.0     # écrit la version, rédige les notes, s'arrête
# relis apps/site/src/content/changelog/{en,fr}/0-1-0.mdx
scripts/release.sh                      # vérifie, construit, publie, commite, tague, pousse
```

Le second passage est l'acte de publication : l'agent puis l'app sur les seaux, la déclaration à la plateforme de la branche, et enfin le commit `chore(release): v0.1.0`, le tag et le push. La chaîne refuse de commencer si le changelog ne couvre pas la version dans les deux langues, ou si la branche n'est ni `staging` ni `main`.

Une version sort toujours en canal **`beta`**, déclarée à la plateforme de la branche — le staging, donc. Elle arrive en production et passe en `stable` quand la pull request `staging` → `main` est fusionnée, puis `scripts/release.sh promote 0.1.0` : les lignes gardées avec les artefacts sont dites à la production, puis promues. C'est **le même fichier**, celui qui a été éprouvé, qui devient la version stable — rien n'est reconstruit. Un second build donnerait d'autres signatures pour le même numéro.

## 10. Vérifier que tout tient

```bash
curl -s https://app.pupitre.studio/api/v1/health                      # {"ok":true}
curl -sI https://pupitre.studio | head -1                             # 200
curl -sI https://staging.pupitre.studio | head -1                     # 200
curl -s "https://app.pupitre.studio/api/v1/releases/app/latest?channel=beta" | head -c 200
curl -sI https://dl.pupitre.studio/app/0.1.0/latest.yml | head -1     # 200
```

Puis, à la main : ouvrir le `.dmg` sur un Mac qui n'a jamais vu le certificat, sans avertissement ; installer sur Windows sans que SmartScreen bloque ; et faire installer l'agent par l'app sur un serveur d'essai.

## 11. Si ça casse

| Symptôme | Cause la plus probable |
| --- | --- |
| Le déploiement refuse de partir en nommant des secrets | il en manque un : `check:secrets <environnement>` les liste |
| Le site répond mais aucune connexion n'aboutit | `BETTER_AUTH_SECRET` absent, ou différent de celui qui a signé les sessions |
| Aucun email ne part | Email Sending pas activé, ou `pupitre.studio` pas vérifié comme domaine expéditeur |
| L'app dit qu'il n'y a rien à télécharger | les quatre `R2_*` sont faux : la plateforme rend une adresse locale et le dit dans un en-tête |
| La construction échoue sur la migration | `MIGRATE_DATABASE_URL` désigne un point poolé, ou la mauvaise branche |
| `wrangler deploy` refuse `legacy_env` dans la configuration générée | `@cloudflare/vite-plugin` et `wrangler` ne sont plus au même niveau : le plugin écrit la configuration que wrangler lit, les deux se mettent à jour ensemble |
| Le premier déploiement refuse en nommant les seize secrets | c'est un Worker qui n'existe pas encore : il naît avec `--secrets-file`, étape 6 |
| La chaîne publie mais la plateforme refuse | `PUPITRE_PUBLISH_TOKEN` diffère entre la note 1Password et le Worker, ou a perdu son préfixe |
| Une version publiée ne devient jamais stable | la pull request a été fusionnée en squash, et le commit tagué a quitté l'historique |

Un retour arrière du Worker se fait sur ses versions : `bun x wrangler rollback --config apps/web/dist/server/wrangler.json`. Une migration de base, elle, ne se rejoue pas à l'envers — une migration qui casse se corrige par une migration suivante.

## 12. Ce que rien n'automatise

- **Un secret ou un certificat.** Aucun n'entre dans le dépôt, dans un journal de construction ou dans une conversation.
- **La création des projets Workers Builds**, qui passe par une autorisation GitHub dans le tableau de bord.
- **La signature Windows** : Azure Trusted Signing n'existe que sur Windows, et la chaîne tourne sur macOS.
- **La relecture des notes de version** : `claude -p` les rédige, le propriétaire les lit avant qu'elles soient commitées.
- **La mise à jour de ce document.** Quand un réglage change dans un tableau de bord, il change ici dans la même passe : c'est la seule trace qu'en garde le dépôt.
