# Mettre Pupitre en ligne

Ce document suppose que tu ne connais pas le projet. Il donne les gestes dans l'ordre, la commande exacte à chaque fois, et ce qui casse quand une étape est sautée. Suivi de bout en bout, il mène d'un dépôt Git à un service qui répond.

Compte une demi-journée la première fois, dont la moitié à attendre des vérifications de comptes tiers.

## 1. Ce que tu mets en ligne

Quatre choses, sur un seul environnement en ligne.

| Ce qui est publié | Où | Ce qui le déclenche |
| --- | --- | --- |
| La console et l'API — un seul Worker Cloudflare | `app.pupitre.studio` | un push sur `main` |
| Le site marketing — un Worker à assets statiques | `pupitre.studio` | le même push |
| L'app desktop (macOS, Windows, Linux) | le seau public `ppt-downloads`, servi par `dl.pupitre.studio` | un tag `vX.Y.Z` sur `staging`, posé par `scripts/release.sh` depuis le Mac du propriétaire, construit et publié par `release.yml` |
| L'agent `pupitred`, installé sur le serveur du client | le seau privé `ppt-agent`, que rien n'atteint directement | le même tag |

**Pas de staging en ligne.** Tout s'essaie en local, de bout en bout : la console sur la D1 de miniflare, l'app desktop de développement par le tunnel `dev.pupitre.studio`, l'agent sur un VPS jetable. Une release est ce qui fait avancer `main` : `release.yml` construit, publie, vérifie, puis fusionne `staging` dans `main`, et ce push déploie le site et la console.

Les branches : `staging` est la branche de travail, `main` est la production et ne change que par la pull request `staging` → `main` — celle qu'une release ouvre et fusionne, ou une à la main quand ni l'app ni l'agent ne changent, toujours en merge commit. Les hooks du dépôt refusent d'y committer en local. Voir [`monorepo.md`](./monorepo.md#branches).

## 2. Avant de commencer

### Les comptes

| Compte | Ce qu'il porte | Coût | Délai |
| --- | --- | --- | --- |
| **Cloudflare** | le domaine, le Worker, le site, les deux seaux de fichiers | gratuit pour commencer | immédiat |
| **Stripe** | le produit et ses deux prix | commission par vente | quelques jours de vérification |
| **GitHub** | le dépôt et ses workflows | gratuit | immédiat |
| **Blacksmith** | les runners qui vérifient, construisent et publient chaque version — app GitHub installée sur l'organisation | à la minute, macOS et Windows plus chers | immédiat |
| Apple Developer | la signature de l'app macOS | 99 $/an | quelques jours |
| Azure Trusted Signing | la signature de l'app Windows | à l'usage | quelques jours de vérification |

Les cinq premiers suffisent pour mettre le service en ligne. Les deux derniers ne concernent que la publication de l'app desktop : sans eux elle se construit quand même, non signée, et les systèmes préviennent l'utilisateur au premier lancement.

### Les outils

```bash
bun install                 # depuis la racine du dépôt
bun x wrangler login        # ouvre le navigateur : choisir le compte qui porte le domaine, les Workers et les bases
gh auth status              # doit afficher le compte propriétaire du dépôt
```

### La règle sur les secrets

**Aucune valeur ne se tape à la main dans un fichier du dépôt.** Chaque secret est déposé dans 1Password — le coffre et la note de chaque environnement sont nommés dans [`environments.json`](../environments.json) — et `bun run dev:prepare` va chercher ceux de la note `local` pour le développement. Le dépôt ne contient que des références ; un hook refuse le commit qui porterait une valeur.

## 3. Les quinze secrets

C'est la partie qui bloque tout le monde. Elle est ici en entier.

Le Worker exige **les quinze**. La liste vit dans [`apps/web/wrangler.jsonc`](../apps/web/wrangler.jsonc) sous `secrets.required`, et `deploy:production` refuse de partir s'il en manque un : c'est un garde-fou, pas une préférence. Il n'y a donc pas de « déployer d'abord, compléter ensuite ».

En revanche tu peux les obtenir dans l'ordre, et trois d'entre eux se fabriquent en une commande.

### D'un coup d'œil

| Secret | À quoi il sert | Où le prendre | local et production |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | signe les sessions de connexion | tu le tires toi-même | **valeurs différentes** |
| `INTERNAL_WORKFLOW_SECRET` | ferme le déclencheur interne des tâches de fond | tu le tires toi-même | **valeurs différentes** |
| `PUPITRE_PUBLISH_TOKEN` | laisse la CI déclarer une version publiée | tu le tires toi-même | même valeur des deux côtés |
| `STRIPE_SECRET_KEY` | ouvrir un paiement | Stripe | sandbox / live |
| `STRIPE_WEBHOOK_SECRET` | vérifier que Stripe est bien l'émetteur | Stripe | sandbox / live |
| `STRIPE_PRICE_SERVER_MONTH` | le prix mensuel | Stripe | sandbox / live |
| `STRIPE_PRICE_SERVER_YEAR` | le prix annuel | Stripe | sandbox / live |
| `R2_ACCOUNT_ID` | servir le binaire de l'agent, signer les pièces jointes de la boîte | Cloudflare | même valeur des deux côtés |
| `R2_ACCESS_KEY_ID` | idem | Cloudflare | même valeur des deux côtés |
| `R2_SECRET_ACCESS_KEY` | idem | Cloudflare | même valeur des deux côtés |
| `R2_BUCKET_NAME` | le seau du binaire — vaut `ppt-agent` | c'est le nom du seau | même valeur des deux côtés |

| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | la connexion par GitHub | l'OAuth App GitHub | **une OAuth App par hôte** : GitHub n'accepte qu'une adresse de retour par app |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | la connexion par Google | Google Cloud, identifiant OAuth « application Web » | même client possible, une URI de redirection par hôte |

**Les quatre secrets de connexion sociale sont requis, mais le produit s'en passe** : l'écran de connexion n'affiche que les fournisseurs dont l'identifiant et le secret sont là, et sans eux il reste le lien par email et la clé d'accès. Ils sont dans la liste pour que la console en ligne les offre, et pour qu'une valeur oubliée se voie au déploiement plutôt qu'à l'écran. L'adresse de retour est `https://<hôte>/api/auth/callback/github` et `…/callback/google` ; une OAuth App GitHub ne connaît qu'un hôte, il en faut donc une pour `localhost:3000` et une pour la production.

### Ce qui casse si l'un est faux

Un secret présent mais faux ne bloque pas le déploiement : le garde-fou compte les secrets, il ne les essaie pas. Voici ce que tu observeras.

| Faux ou factice | Ce qui marche quand même | Ce qui casse |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | les pages publiques | toute connexion |
| `INTERNAL_WORKFLOW_SECRET` | tout, tâches planifiées comprises | seulement le déclenchement manuel d'une tâche de fond, qui ne sert qu'en développement |
| `PUPITRE_PUBLISH_TOKEN` | tout le service | la CI ne peut plus déclarer de version publiée |
| les quatre `STRIPE_*` | la connexion, la console, l'ajout d'un serveur | souscrire un abonnement |
| les quatre `R2_*` | la console entière | l'app ne peut pas télécharger l'agent, donc aucune installation sur un serveur ; la boîte ne peut ni ouvrir ni joindre une pièce jointe |

Autrement dit : `BETTER_AUTH_SECRET` est le seul dont une valeur fausse rend le service inutilisable. Les autres dégradent une fonction, et le disent. La base n'est pas un secret : c'est une D1 **liée** au Worker par `wrangler.jsonc`, sans adresse ni mot de passe.

### Les trois que la machine tire elle-même

Aucun compte tiers, et rien à taper : ils se tirent au hasard et se déposent directement dans les notes.

```bash
bun run secrets:draw
```

`scripts/draw-secrets.ts` lit chaque note nommée dans `environments.json` et la note de la release, et remplit ce qui manque : `BETTER_AUTH_SECRET` et `INTERNAL_WORKFLOW_SECRET` propres à chaque environnement en ligne (le poste tire les siens dans `dev:prepare`), et un seul `PUPITRE_PUBLISH_TOKEN`, mot pour mot identique dans les notes des environnements et dans celle de la release (étape 8) — s'il existe déjà dans l'une, c'est lui qui est recopié, et deux notes qui ne s'accordent pas arrêtent la commande. Un champ déjà rempli n'est jamais remplacé : tourner `BETTER_AUTH_SECRET` déconnecte tout le monde, alors pour retirer une valeur on vide le champ dans 1Password et on relance. Rien n'est imprimé que des noms.

Le préfixe `pupitre_pub_` est ce à quoi la plateforme reconnaît un jeton de publication ; sans lui elle le prend pour une session et le refuse. Une valeur nouvelle se pose ensuite sur le Worker (étape 6) et dans les secrets GitHub (étape 8).

### Les quatre `R2_*` — Cloudflare

Ils servent à deux choses : laisser la plateforme distribuer le binaire de l'agent depuis un seau que rien n'atteint autrement, et signer les adresses par lesquelles la console lit et dépose les pièces jointes de la boîte, sur `ppt-mail`.

Cloudflare → **R2** → *Manage API tokens* → *Create API token*. Permission **Object Read & Write**, restreinte aux deux seaux `ppt-agent` et `ppt-mail` — la lecture pour le binaire, l'écriture pour qu'un dépôt signé de la console soit accepté. Cloudflare affiche alors une clé et un secret — **le secret n'est montré qu'une fois**.

| Variable | Valeur |
| --- | --- |
| `R2_ACCOUNT_ID` | l'identifiant de ton compte Cloudflare, dans le tableau de bord |
| `R2_ACCESS_KEY_ID` | la clé que le jeton vient de rendre |
| `R2_SECRET_ACCESS_KEY` | le secret, montré une seule fois |
| `R2_BUCKET_NAME` | `ppt-agent` |

Le nom du seau des mails n'est pas un secret : `R2_MAIL_BUCKET_NAME` vaut `ppt-mail` dans les `vars` de `wrangler.jsonc`.

Crée **un second jeton** au même endroit, en **Object Read & Write** sur `ppt-agent` et `ppt-downloads` : sa clé et son secret deviennent `R2_ACCESS_KEY_ID` et `R2_SECRET_ACCESS_KEY` dans la note 1Password de la release, étape 8. La chaîne de release parle S3 directement, avec ce jeton-là, et rien d'autre : un jeton d'API Cloudflare ouvrirait tous les seaux du compte, celui-ci n'ouvre que les deux. Ne réutilise pas le premier — celui du Worker n'a pas à toucher au seau public.

### Les quatre `STRIPE_*` — Stripe

Un produit et deux prix, à créer **deux fois** : en sandbox pour le poste de travail, en live pour la production. Tant que la production reste volontairement en sandbox — c'est le cas au premier déploiement, le temps que le compte Stripe soit vérifié — les deux notes partagent la clé et les prix, et la production a son propre webhook.

| | |
| --- | --- |
| Produit | `Pupitre Server`, code fiscal `txcd_10103001` (logiciel en ligne, usage professionnel) |
| Prix mensuel | 5 $, taxe en sus → `STRIPE_PRICE_SERVER_MONTH` |
| Prix annuel | 50 $, deux mois offerts → `STRIPE_PRICE_SERVER_YEAR` |

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

**`ppt-mail`, privé.** Tout ce qu'un email porte au-delà de son texte : le message brut, son corps HTML, ses pièces jointes. La D1 tient le fil, le seau tient les octets. Ni adresse publique, ni URL `r2.dev`. Le Worker y écrit et y lit par le binding `MAIL` ; la console, elle, lit et dépose les pièces jointes **directement dans le seau**, par des adresses signées de dix minutes que la plateforme calcule avec les `R2_*` — d'où la règle CORS, sans laquelle le navigateur refuse le `PUT` et la lecture en ligne. Juridiction par défaut.

```bash
bun x wrangler r2 bucket create ppt-mail
bun x wrangler r2 bucket cors set ppt-mail --file apps/web/r2-mail-cors.json
```

`apps/web/r2-mail-cors.json` dit la règle : origines `https://app.pupitre.studio` et `http://localhost:3000`, méthodes `GET` et `PUT`, seul en-tête `content-type`, mise en cache de la pré-vérification une heure. Vérifie avec `bun x wrangler r2 bucket cors list ppt-mail`. Le jeton R2 du Worker (étape 3) doit lire et écrire sur ce seau : une adresse signée n'ouvre que ce que sa clé peut ouvrir.

**Email, ce qui part.** Le Worker envoie par le binding `send_email` d'Email Sending : active Email Sending sur le compte et fais vérifier le domaine `pupitre.studio` comme expéditeur (les enregistrements DKIM et SPF sont posés sur la zone). Fais vérifier aussi les quatre adresses d'expédition de la boîte — `support@`, `legal@`, `privacy@`, `security@` — dans *Email Sending → Destination addresses* : ce sont les seules qu'une réponse de la console peut porter. Sans domaine vérifié aucun lien de connexion ne part, donc personne ne se connecte.

**Email, ce qui arrive.** Tout ce qui est écrit à `*@pupitre.studio` entre dans la base de la plateforme, et l'équipe y répond depuis la console — [`contracts/platform-mail.md`](./contracts/platform-mail.md). Sur la zone, dans *Email → Email Routing* :

1. **Enable Email Routing** : Cloudflare pose les enregistrements MX et le TXT SPF sur `pupitre.studio`. Les enregistrements d'Email Sending restent ; les deux cohabitent.
2. **Routing rules → Catch-all address → Edit** : action *Send to a Worker*, destination `ppt-web-production`, puis **Enable**. Aucune adresse ne se déclare une par une.

Le Worker doit être déployé avant que la règle puisse le nommer : cette étape se fait donc après le premier déploiement. Vérifie en écrivant à `support@pupitre.studio` depuis une adresse extérieure ; le fil apparaît dans la console sous `/dashboard/admin`. Une exception dans le handler est un échec **temporaire** : Cloudflare représente le message, et un renvoi est reconnu comme un doublon.

## 5. La base de données

Une base **Cloudflare D1**, `ppt-db`, en Europe de l'Ouest, liée au Worker sous le nom `DB` dans `apps/web/wrangler.jsonc` — [`environments.json`](../environments.json) la nomme aussi. Elle existe déjà (`wrangler d1 create ppt-db --location weur`, une fois). Rien à connecter : le Worker s'exécute à côté d'elle (*smart placement*), et il n'y a ni adresse, ni mot de passe, ni compute qui dorme ou se réveille — on paie des lignes lues et écrites, et le palier gratuit en donne des millions par jour.

Les migrations sont des fichiers SQL, `packages/db/migrations/NNNN_<nom>.sql`, que D1 tient dans son propre registre. La construction les applique **avant** de construire, à chaque fois ; depuis ton poste :

```bash
bun run db:migrate local                                        # la D1 que miniflare tient sous apps/web/.wrangler/state
PUPITRE_ALLOW_MIGRATE_ON=production bun run db:migrate production
bun run db:migrate:new <nom>                                    # le prochain fichier, par diff du schéma Prisma contre les migrations
bun run db:reset local                                          # toutes les tables supprimées, puis toutes les migrations
bun run db:seed local <adresse>                                 # l'organisation de Pupitre et son administrateur
PUPITRE_ALLOW_MIGRATE_ON=production bun run db:seed production <adresse>
```

Une base migrée est vide : le seed y pose l'organisation de Pupitre, `pupitre` sous l'identifiant `org_pupitre`, puis fait du compte de l'adresse donnée son propriétaire et l'administrateur de la plateforme, sous `usr_pupitre_admin` et le rôle `platform_admin`. Le compte n'a pas à exister d'avance ; s'il existe — Better Auth l'a créé à la première connexion avec un identifiant tiré au hasard — le seed le renomme, et tout ce qui le désignait suit. On le rejoue autant qu'on veut : la deuxième fois ne change rien, et il s'arrête sans rien écrire si un autre compte ou une autre organisation tient déjà l'un de ces identifiants.

`db:reset` et `db:seed` sur production demandent le même drapeau. Une base D1 revient aussi à n'importe quel instant des trente derniers jours par *Time Travel* : `wrangler d1 time-travel restore ppt-db --timestamp=<ISO>`.

## 6. Le premier déploiement, à la main

Un Worker naît avec ses quinze secrets, ou ne naît pas : `wrangler deploy` refuse de créer un Worker dont un secret de `secrets.required` manque, et `wrangler secret put` ne sait rien attacher à un Worker qui n'existe pas encore. Le premier déploiement fournit donc les quinze d'un coup, par `--secrets-file`. On le fait une fois, sans passer par la construction automatique.

Les valeurs vivent dans 1Password : une note par environnement, `pupitre` (`local`, le poste de travail) et `pupitre-prod`, nommées dans [`environments.json`](../environments.json), un champ par secret, nommé exactement comme le Worker l'attend. Le fichier de secrets n'existe jamais sur le disque : il est composé à la volée depuis 1Password et remis à `wrangler` par une substitution de processus.

Depuis une branche de travail :

```bash
bun run env production -- bun --cwd=apps/web run build:production
bun x wrangler deploy --config apps/web/dist/server/wrangler.json --keep-vars \
  --secrets-file <(op item get pupitre-prod --vault "DEV - React Consulting" --format json \
    | jq '[.fields[] | select(.label and .value)] | map({(.label): .value}) | add')
```

Le Worker s'appelle `ppt-web-production`. Rien ne se saisit dans le tableau de bord : l'adresse, les tâches planifiées et les liens de service viennent tous de `wrangler.jsonc`.

Ensuite, un secret qui change se pose seul, ou tous d'un coup, par le même canal :

```bash
op read "op://DEV - React Consulting/pupitre-prod/STRIPE_WEBHOOK_SECRET" \
  | bun x wrangler secret put STRIPE_WEBHOOK_SECRET --config apps/web/wrangler.jsonc --env production
bun x wrangler secret bulk --config apps/web/wrangler.jsonc --env production <(op item get pupitre-prod \
  --vault "DEV - React Consulting" --format json \
  | jq '[.fields[] | select(.label and .value)] | map({(.label): .value}) | add')
bun --cwd=apps/web run check:secrets production     # doit dire que tout est là
```

Les valeurs de la note `pupitre-prod` diffèrent de celles du poste : ses propres `BETTER_AUTH_SECRET` et `INTERNAL_WORKFLOW_SECRET`, son propre webhook Stripe. Les quatre `R2_*`, le jeton de publication et — tant que Stripe reste en sandbox — les trois autres `STRIPE_*` sont les mêmes dans les deux notes.

Vérifie :

```bash
curl -s https://app.pupitre.studio/api/v1/health       # {"ok":true}
curl -sI https://app.pupitre.studio/status | head -1    # 200, sans être connecté
```

## 7. Les déploiements automatiques

À partir d'ici, plus rien ne se déploie à la main.

**Un projet Workers Builds** sur le dépôt, pour le Worker `ppt-web-production`. La création passe par une autorisation GitHub dans le tableau de bord — *Workers & Pages* → le Worker → *Settings* → *Build* → *Connect to Git* ; elle ne s'automatise pas.

| | production |
| --- | --- |
| Branche surveillée | `main` |
| Commande de construction | `bun install --frozen-lockfile && bun --cwd=apps/web run build:production` |
| Commande de déploiement | `bun --cwd=apps/web run deploy:production` |
| Variable de construction | `VITE_APP_URL=https://app.pupitre.studio` |
| Secrets de construction | aucun : la base est liée, et wrangler migre avec le jeton du projet Builds |

La construction migre la D1 **avant** de construire, et le déploiement refuse de partir s'il manque un secret : les deux échouent avant d'avoir touché au Worker en place.

**Un projet Workers Builds de plus** pour le site marketing, sur le Worker `ppt-site`. Un projet Pages relié à Git ne se crée que dans le tableau de bord et ne se convertit jamais ; le site est donc un Worker à assets statiques comme la console, déployable d'ici avant que l'automatique existe.

| | production |
| --- | --- |
| Branche surveillée | `main` |
| Commande de construction | `bun install --frozen-lockfile && bun --cwd=apps/site run build:production` |
| Commande de déploiement | `bun --cwd=apps/site run deploy:production` |

Le script de construction porte `PUBLIC_RELEASES_URL` — la liste des versions que la page de téléchargement lit — et pose `PUPITRE_ENV=production`, ce qui fait refuser au garde légal un `TODO` dans une page légale. Si l'API ne répond pas, la construction n'échoue pas : la page part avec une liste écrite dans le dépôt et un avertissement. Les redirections et les en-têtes de sécurité sont dans `apps/site/public/`, lus par le calque d'assets ; `www` est renvoyé vers l'apex par `apps/site/worker/index.ts`, la seule chose que ce calque ne sait pas dire.

Le premier déploiement du site se fait à la main, sans secret à fournir :

```bash
bun --cwd=apps/site run build:production && bun --cwd=apps/site run deploy:production
```

`main` avance par une release — la version est alors déjà déclarée à la plateforme et téléchargeable quand le site relit la liste des versions — ou par une pull request `staging` → `main` fusionnée en merge commit quand seuls la console, le site ou les mails changent.

## 8. GitHub

### Les réglages du dépôt

```bash
gh repo edit <compte>/pupitre \
  --enable-squash-merge=false --enable-rebase-merge=false --enable-merge-commit
gh api -X PUT repos/<compte>/pupitre/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
```

Le squash est interdit parce qu'il réécrit les commits : le commit tagué d'une version sortirait de l'historique de `main`, et `next` compterait depuis le mauvais tag. La seconde commande autorise GitHub Actions à ouvrir des pull requests — *Settings* → *Actions* → *General* → *Allow GitHub Actions to create and approve pull requests* : sans elle, le dernier job de `release.yml` construit tout et ne peut pas fusionner.

**Ce dépôt est privé sur un plan GitHub gratuit**, qui refuse la protection de branche et les relecteurs obligatoires. `main` n'a donc **aucune protection côté serveur** : les hooks du dépôt sont la seule barrière, et ils ne protègent que la machine sur laquelle `bun install` est passé. GitHub Pro lève les deux.

## 8 bis. La note 1Password de la release

Les runners de `release.yml` lisent leurs secrets dans ceux du dépôt GitHub, et ceux-ci viennent d'**une note 1Password**, `pupitre-GitHub` dans le coffre partagé : `scripts/release/release.env.tpl` dit quels champs elle attend, et `bun scripts/release/index.ts secrets` lit chacun par `op read` et le pose par `gh secret set` — à relancer à chaque valeur qui tourne. Rien n'est jamais écrit dans un fichier. Les valeurs publiques (la plateforme, les seaux, l'identifiant du compte R2) sont en clair dans le gabarit, et le workflow les y lit.

| Champ | D'où il vient | Sans lui |
| --- | --- | --- |
| `PUPITRE_PUBLISH_TOKEN` | la même valeur qu'à l'étape 3, mot pour mot | la version se construit et ne se déclare pas |
| `PUPITRE_RELEASE_PRIVATE_KEY` | `cd apps/agent && go run ./tools/release keygen`, une seule fois | rien ne se construit |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | le second jeton R2 de l'étape 3, *Object Read & Write* sur les deux seaux | rien ne monte sur les seaux |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` | le certificat Developer ID exporté du trousseau en `.p12`, `base64 -i certificat.p12 \| pbcopy`, et son mot de passe | l'app macOS sort non signée |
| `APPLE_API_KEY_CONTENT` | `base64 -i AuthKey_<id>.p8 \| pbcopy` | pas de notarisation |
| `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | la page *Keys* d'App Store Connect | idem |

Les trois premières lignes suffisent pour publier. Les autres signent et notarisent l'app macOS : le runner importe le certificat dans un trousseau jetable le temps du build. Windows sort non signé tant qu'Azure Trusted Signing n'est pas posé.

**La clé de publication mérite une phrase.** Une seule paire de clés signe tout ce que Pupitre publie, pour toujours. Sa moitié privée est dans cette note et nulle part ailleurs ; sa moitié publique est déjà écrite dans le code de l'app. Les deux vont ensemble : une app qui connaît une clé publique et un agent signé avec une autre refusent toute mise à jour, sans message utile. Ne la régénère pas.

**Faire tourner le jeton de publication ne coupe rien**, dans cet ordre : poser le nouveau sur le Worker sous `PUPITRE_PUBLISH_TOKEN` et l'ancien sous `PUPITRE_PUBLISH_TOKEN_PREVIOUS`, changer le champ de la note, puis retirer l'ancien. La plateforme accepte les deux entre-temps.

## 9. La première version publiée

```bash
git switch staging && git pull --ff-only
scripts/release.sh --version=0.1.0     # écrit la version, rédige les notes, s'arrête
# relis apps/site/src/content/changelog/{en,fr}/0-1-0.mdx
scripts/release.sh                      # vérifie, commite, tague, pousse
```

Le second passage commite `chore(release): v0.1.0`, pose le tag et pousse ; le push du tag lance `release.yml`, qui construit et publie l'agent puis l'app sur les seaux, déclare la version à la plateforme en `stable`, vérifie de l'extérieur que tout se télécharge — le résumé du run dit quoi — puis ouvre la pull request `staging` → `main` et la fusionne. Ce push de `main` reconstruit le site et la console. La chaîne refuse de commencer si le changelog ne couvre pas la version dans les deux langues, ou si le tag n'est pas sur `staging`. Un job qui échoue se relance seul depuis GitHub : chaque étape est idempotente, le merge compris.

Revenir en arrière, c'est promouvoir la version précédente : `gh workflow run promote.yml -f version=X.Y.Z`. C'est **le même fichier**, celui qui a été publié, que le canal désigne à nouveau — rien n'est reconstruit. Un second build donnerait d'autres signatures pour le même numéro.

## 10. Vérifier que tout tient

```bash
curl -s https://app.pupitre.studio/api/v1/health                      # {"ok":true}
curl -sI https://pupitre.studio | head -1                             # 200
curl -s "https://app.pupitre.studio/api/v1/releases/app/latest" | head -c 200
curl -sI https://dl.pupitre.studio/app/0.1.0/latest.yml | head -1     # 200
```

Puis, à la main : ouvrir le `.dmg` sur un Mac qui n'a jamais vu le certificat, sans avertissement ; installer sur Windows sans que SmartScreen bloque ; et faire installer l'agent par l'app sur un serveur d'essai.

## 11. Si ça casse

| Symptôme | Cause la plus probable |
| --- | --- |
| Le déploiement refuse de partir en nommant des secrets | il en manque un : `check:secrets <environnement>` les liste |
| Le site répond mais aucune connexion n'aboutit | `BETTER_AUTH_SECRET` absent, ou différent de celui qui a signé les sessions |
| Aucun email ne part | Email Sending pas activé, ou `pupitre.studio` pas vérifié comme domaine expéditeur |
| Rien n'arrive dans la boîte de la console | Email Routing pas activé sur la zone, ou la règle catch-all ne pointe pas le Worker de production |
| Un fil s'ouvre mais son HTML et ses pièces jointes manquent | le seau `ppt-mail` n'existe pas, ou le binding `MAIL` n'est pas dans l'environnement déployé |
| Une pièce jointe ne s'ouvre pas, ou le dépôt d'un fichier échoue dans le navigateur | la règle CORS de `ppt-mail` n'est pas posée (étape 4), ou le jeton R2 du Worker ne lit et n'écrit pas sur ce seau |
| L'app dit qu'il n'y a rien à télécharger | les quatre `R2_*` sont faux : la plateforme rend une adresse locale et le dit dans un en-tête |
| La construction échoue sur la migration | un fichier de `packages/db/migrations` ne s'applique pas sur D1 : il s'applique d'abord en local, `bun run db:migrate local`, et les tests le rejouent |
| `wrangler deploy` refuse `legacy_env` dans la configuration générée | `@cloudflare/vite-plugin` et `wrangler` ne sont plus au même niveau : le plugin écrit la configuration que wrangler lit, les deux se mettent à jour ensemble |
| Le premier déploiement refuse en nommant les quinze secrets | c'est un Worker qui n'existe pas encore : il naît avec `--secrets-file`, étape 6 |
| La chaîne publie mais la plateforme refuse | `PUPITRE_PUBLISH_TOKEN` diffère entre la note 1Password et le Worker, ou a perdu son préfixe |
| La release construit tout et le job `Merge into main` échoue en ouvrant la pull request | GitHub Actions n'a pas le droit de créer des pull requests : étape 8 |
| `next` propose une version déjà sortie | la pull request a été fusionnée en squash ou en rebase, et le commit tagué a quitté l'historique de `main` |

Un retour arrière du Worker se fait sur ses versions : `bun x wrangler rollback --config apps/web/dist/server/wrangler.json`. Une migration de base, elle, ne se rejoue pas à l'envers — une migration qui casse se corrige par une migration suivante.

## 12. Ce que rien n'automatise

- **Un secret ou un certificat.** Aucun n'entre dans le dépôt, dans un journal de construction ou dans une conversation.
- **La création des projets Workers Builds**, qui passe par une autorisation GitHub dans le tableau de bord.
- **La signature Windows** : Azure Trusted Signing n'existe que sur Windows, et la chaîne tourne sur macOS.
- **La relecture des notes de version** : `claude -p` les rédige, le propriétaire les lit avant qu'elles soient commitées.
- **La mise à jour de ce document.** Quand un réglage change dans un tableau de bord, il change ici dans la même passe : c'est la seule trace qu'en garde le dépôt.
