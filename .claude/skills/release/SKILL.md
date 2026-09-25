---
name: release
description: "Sortir une version de Pupitre — `scripts/release.sh` sur le Mac du propriétaire : version suivante, entrée de changelog rédigée par `claude -p` et relue, commit et tag `vX.Y.Z` ; puis `release.yml` sur GitHub : agent et app construits sur les trois systèmes, notarisation macOS, signature Ed25519 de tous les artefacts, publication sur les seaux R2, déclaration à la plateforme en `stable`, vérification de l'extérieur, puis la pull request `staging` → `main` ouverte et fusionnée par le même run — ce qui déploie le site et la console ; `promote.yml` pour revenir en arrière, feuille de compatibilité app ↔ agent. À utiliser quand le propriétaire demande une release, un correctif à publier, ou quand on touche à la chaîne de release. Dit clairement ce qui n'existe pas encore."
---

# Sortir une version

Une release livre deux artefacts : l'app desktop (macOS, Windows, Linux) et l'agent `pupitred` (`linux/amd64`, `linux/arm64`). Les deux sortent sur le **même tag** `vX.Y.Z`, parce que le protocole les lie et que la feuille de compatibilité se lit avec leurs deux numéros.

Le Mac du propriétaire écrit la version et les notes et pose le tag, par `scripts/release.sh`, sans aucun secret ; le tag fait construire, publier et vérifier la version par `.github/workflows/release.yml`, un runner par système, puis le même run ouvre la pull request `staging` → `main` et la fusionne. La release se fait depuis **`staging`** et sort directement en `stable` sur la production, `app.pupitre.studio` : il n'y a pas de staging en ligne, tout s'essaie en local avant. Le push de `main` est ce qui déploie le site et la console. Voir [`docs/monorepo.md`](../../../docs/monorepo.md#branches).

## Fichiers gouvernés

| Fichier | Rôle | Existe ? |
| --- | --- | --- |
| `scripts/release.sh` | la part du Mac : `next`, `resolve`, `notes` — s'arrête là pour que les notes soient lues — puis `check` et `ship` quand on le relance | oui |
| `.github/workflows/release.yml` | la part des runners, sur le tag : `ci.yml` d'abord, puis `agent build`, `agent publish`, puis `desktop` sur les runners Blacksmith `blacksmith-6vcpu-macos-15`, `blacksmith-4vcpu-windows-2025`, `blacksmith-4vcpu-ubuntu-2404`, puis `app publish`, `verify` et `merge` | oui |
| `.github/workflows/promote.yml` | à la main, `gh workflow run promote.yml -f version=X.Y.Z` : remet une version publiée dans un canal — le retour arrière | oui |
| `scripts/release/release.env.tpl` | les références 1Password et les valeurs publiques — aucun secret dedans ; `release secrets` en fait les secrets du dépôt, le workflow y lit les valeurs en clair | oui |
| `scripts/release/` | **la chaîne elle-même** : `next`, `resolve`, `notes`, `check`, `ship`, `agent build`, `agent publish`, `desktop`, `app publish`, `verify`, `merge`, `promote`, `secrets` — chaque étape est une commande `bun scripts/release/index.ts <étape>`, idempotente, pilotée par l'environnement, avec `--dry-run` ; R2 en S3 pour seul bus, avec une clé limitée aux deux seaux | oui |
| `apps/desktop/package.json` | `version` de l'app, `build:mac`, `build:win`, `build:linux` | oui |
| `apps/desktop/electron-builder.yml` | cibles, noms d'artefacts, ce qui entre dans l'archive (`out/**` et `package.json`, plus les `dependencies` que le main charge à l'exécution — tout le reste est une `devDependency` regroupée par Vite), `asarUnpack`, fusibles, signature, flux générique | oui |
| `apps/desktop/scripts/release-artefacts.ts` | ce qu'un fichier d'artefact est, sa clé dans le seau, le message que la clé de release signe, la réécriture des flux — partagé par la chaîne et par l'app qui vérifie | oui |
| `apps/agent/package.json` | `release` (garble, `-X main.version`, signature) | oui |
| `apps/agent/tools/release` | `keygen`, `public-key`, `sign` — la cryptographie de l'agent, rien d'autre | oui |
| `packages/shared/src/compat` | la feuille de compatibilité app ↔ agent | oui |
| `packages/api/src/lib/releases/publish-token.ts` | le jeton que la chaîne présente, et sa rotation à deux valeurs | oui |
| `apps/site/src/content/changelog/` | une entrée par version et par langue — la seule source des notes de version | oui |
| `scripts/release-notes.ts` | `--check` qu'une version est couverte partout, sinon écrit le corps de l'entrée anglaise | oui |
| `scripts/assert-branch-writable.ts` | le refus de commiter et de pousser sur `main` | oui |
| `docs/monorepo.md` | les branches, et les dashboards externes : Apple Developer, Azure Trusted Signing, R2, Cloudflare | oui |
| `docs/deploy.md` | la mise en ligne de bout en bout, et les seize secrets du Worker | oui |
| `docs/contracts/platform-api.md` | `/admin/releases`, `/admin/app-releases`, `/releases/app`, table `Release` et `AppRelease` | oui |
| `git log <dernier tag>..staging` | ce qui entre dans la version | oui |

## Ce qui manque encore

| Brique | État |
| --- | --- |
| La signature Windows | le compte Azure Trusted Signing n'existe pas encore : tant que ses quatre variables `AZURE_SIGNING_*` et ses trois secrets `AZURE_*` manquent, une release `stable` refuserait de construire Windows ; en attendant, le job `desktop` de `release.yml` pose `PUPITRE_ALLOW_UNSIGNED_WINDOWS: "1"` et Windows sort non signé (SmartScreen avertit au premier lancement), macOS reste tenu. Voir `docs/tasks/windows-signing.md` |
| La protection de branche de `main` | refusée par GitHub Free sur un dépôt privé d'organisation (GitHub Team la lève). Les barrières sont les hooks locaux, le job `ci` de `release.yml` dont dépend tout build, et `merge` qui refuse de fusionner sans CI verte sur le commit de tête ; une pull request fusionnée à la main n'est tenue par rien |

## Versionnage

- Un tag `vX.Y.Z`, semver. `Z` pour un correctif, `Y` pour une fonctionnalité, `X` quand le protocole app ↔ agent retire ou renomme un champ.
- La version est celle d'`apps/desktop/package.json`, que `next` écrit ; `check` refuse de continuer si le changelog ne la couvre pas dans les deux langues, et l'agent la reçoit au build par `-X main.version`.
- L'entier `protocol` du contrat est indépendant de la version : il change seulement quand un champ est retiré ou renommé. Ce jour-là, une ligne s'ajoute à `packages/shared/src/compat` — l'entier, la première version d'app et la première version d'agent qui le parlent — et `bun run contracts:export` la porte jusqu'à l'agent.
- **Une version qui change la forme d'un fichier posé sur une machine emporte sa migration.** Un champ d'`install.json` renommé, une clé de `/etc/pupitre/env` déplacée, un champ de `servers.json` qui bouge : l'entrée est dans le registre correspondant avant que le tag soit posé, sinon la mise à jour laisse un agent qui lit de travers ce qu'il trouve. Voir le skill `config-migrations` et [`docs/contracts/config-migrations.md`](../../../docs/contracts/config-migrations.md). La révision de configuration a son propre compteur : elle ne suit ni la version ni l'entier `protocol`.
- Le tag est annoté, posé par `ship` en dernier sur le Mac, jamais réécrit. Son annotation ne sert qu'à l'historique : **les notes de version sont l'entrée de changelog**, lue par `app publish`, enregistrée dans `AppRelease`, reprise en corps de la pull request et affichée partout ailleurs. Une release compte comme sortie quand son tag est sur `origin` — `next` ne lit que ceux-là ; une release arrêtée avant, y compris après le commit et le tag de `ship` quand le push a été refusé, se reprend telle quelle en relançant `scripts/release.sh` : `next` garde la version taguée sur `HEAD`, `ship` ne fait que les deux push. Chaque étape est idempotente.

## Procédure

Une release, c'est une commande, lancée deux fois :

```bash
scripts/release.sh            # un correctif ; --minor pour une fonctionnalité, --major pour le protocole, --version=X.Y.Z pour nommer
```

Avant : `staging` à jour, l'arbre propre, `bun run lint`, `bun run check:types`, `bun run test`, `bun run build` verts, et le propriétaire a fait tourner la version candidate en local — l'app de dev sur la console de dev, l'agent sur son VPS. `claude` dans le PATH ; les secrets du dépôt à jour (`bun scripts/release/index.ts secrets` après toute rotation dans la note). Ce que le tag pousse est ce qui arrive sur `main` : rien d'inachevé ne traîne sur `staging` à ce moment-là.

### 1. La version et les notes

Le premier passage fait `next` — la version suivante dans `apps/desktop/package.json` — puis `resolve`, puis `notes` : `claude -p` lit les commits depuis le dernier tag, en ouvre le diff quand un message ne dit pas l'effet client, et écrit les deux fichiers `apps/site/src/content/changelog/{en,fr}/X-Y-Z.mdx`. Le script **s'arrête** et nomme les deux fichiers.

Ce qu'une entrée dit, et ce que le propriétaire vérifie en la relisant :

- **Ce qui change pour le client**, dans ses mots. Un commit `refactor(api): extraire le sérialiseur` ne produit aucune ligne ; un commit `fix(desktop): l'installation ne perd plus son terminal` en produit une.
- Un titre par surface quand il y a de quoi : l'app, l'agent, la plateforme. Puis, si elles existent, les **limites connues** — ce que cette version ne fait pas encore, ce qui reste à la main.
- Les deux langues disent la même chose. Le français n'est pas une traduction littérale, mais il ne dit rien que l'anglais tait.
- Rien d'inventé. Un commit dont on ne peut pas dire l'effet client se lit dans son diff, ou ne se mentionne pas.

Le corps de l'entrée anglaise **est** la note de version enregistrée dans `AppRelease.notes` : elle finit sur la page de téléchargement de la console et dans l'app. Elle se relit pour ce lecteur-là. `bun scripts/release/index.ts notes --again` fait rédiger de nouveau.

### 2. Taguer, puis laisser les runners construire, publier et fusionner

Le second passage vérifie (`check`) puis `ship` : commit `chore(release): vX.Y.Z`, tag annoté, push de `staging` et du tag. Le push du tag lance `release.yml`, dont les jobs enchaînent — `gh run watch` le suit depuis le terminal :

| Étape | Fait |
| --- | --- |
| `ci` | `ci.yml` appelé sur le commit tagué : gitleaks sur `origin/main..HEAD`, migrations, lint, typecheck, tests, build hors desktop. Rouge, rien d'autre ne part : ni signature, ni seau, ni déclaration |
| `agent build` | garble, signature, épreuve du binaire — clé publique embarquée, moins de dix chaînes lisibles, `version` et `hello` sur la machine de chaque architecture — l'amd64 sur le runner qui construit, l'arm64 sur un runner arm64 (`agent smoke`), jamais sous émulation ; ou reprise depuis le seau si la version y est déjà, parce que garble ne reproduit pas un binaire et que la plateforme tient les empreintes de la première déclaration |
| `agent publish` | `agent/<version>/` du seau **privé** — binaires, `release.json`, `publications.json` — puis `POST /admin/releases` à la plateforme |
| `desktop` | un job par système : macOS signé et notarisé en arm64 et x64, Windows signé par Azure Trusted Signing, Linux — en `stable`, une valeur de signature qui manque arrête le job, electron-builder reçoit `forceCodeSigning` ; l'agent repris du seau et embarqué ; installateurs, blockmaps et flux sous `work/<version>/<système>/` du seau privé |
| `app publish` | chaque installateur et chaque `.zip` de mise à jour macOS signé avec la clé de release — l'app installée ne met rien en place sans ce `.sig`, sur les trois systèmes —, fichiers et `.sig` sur le seau **public**, flux `latest*.yml` réécrits en URL absolues sous `app/<version>/` et `app/<canal>/`, `POST /admin/app-releases` par fichier — en envoyant sa **clé** dans le seau, jamais une adresse — et les lignes gardées en `app/<version>/publications.json` |
| `verify` | de l'extérieur : la plateforme décrit la version, chaque fichier qu'elle nomme est servi entier par le seau public, les flux du canal la nomment et chaque fichier qu'ils nomment a son `.sig` — le rapport est le résumé du run |
| `merge` | la pull request `staging` → `main`, corps = l'entrée de changelog anglaise ; attend jusqu'à cinq minutes le check `CI / Quality` (ou `Quality`) sur son commit de tête et refuse s'il a échoué, tarde ou manque — ce qui arrive si `staging` a bougé après le tag —, puis la fusionne par un merge commit (`gh pr merge --merge --match-head-commit`) ; une pull request restée ouverte est reprise, un `main` qui tient déjà le tag n'a rien à faire. Le push de `main` reconstruit le site et la console par Cloudflare Builds ; fait avec `GITHUB_TOKEN`, il ne lance aucun workflow, et le run `pull_request` de la pull request, faute d'approbation, expire à la fusion en croix rouge sans job — ce n'est pas la CI |

Si le protocole a changé, avant le second passage : une ligne de plus dans `packages/shared/src/compat`, puis `bun --cwd=packages/shared run contracts:export`, commités avant.

Un job qui échoue se relance seul depuis GitHub (*Re-run failed jobs*) — ce qui est déjà dans le seau y est réécrit à l'identique, ce qui est déjà déclaré répond 200, et le merge arrive au bout. Un `merge` qui refuse faute de check sur la tête de `staging` veut dire que des commits sont arrivés après le tag : la version est publiée, mais `main` attend — la pull request restée ouverte se vérifie à la main (approuver son run en attente, ou en ouvrir une nouvelle depuis le compte du propriétaire) puis se fusionne en merge commit au vert. Une version à republier sans nouveau tag : `gh workflow run release.yml --ref vX.Y.Z`. Le job `merge` exige que le dépôt autorise GitHub Actions à ouvrir des pull requests (`docs/deploy.md`, étape 8).

### 3 bis. La clé de release, une fois pour toutes

Une **seule** paire Ed25519 signe toutes les releases, l'agent comme les artefacts de l'app, stable dans le temps. Sa moitié publique est déjà dans `apps/desktop/src/main/agent-release.ts` ; ce qui suit dit comment elle a été faite, et ce qu'il ne faut pas refaire à la légère.

Le propriétaire la crée lui-même, hors de toute session d'agent — la moitié privée ne doit traverser ni un transcript, ni un fichier du dépôt :

```
cd apps/agent && go run ./tools/release keygen
```

La commande écrit `public <base64>` et `private <base64>` sur la sortie standard, et nulle part ailleurs. Ensuite, trois gestes :

1. **La moitié privée** va dans la note 1Password de la release, champ `PUPITRE_RELEASE_PRIVATE_KEY`, d'où `release secrets` la recopie en secret du dépôt. Elle n'est jamais écrite dans un fichier.
2. **La moitié publique** est recopiée dans `AGENT_RELEASE_PUBLIC_KEY` de `apps/desktop/src/main/agent-release.ts`. Le test `src/main/__tests__/agent-release.test.ts` vérifie qu'elle fait bien 32 octets ; il ne fige pas sa valeur, mais la changer répudie tout ce qui a été publié avant.
3. **L'agent** ne la porte pas en dur : `apps/agent/package.json` l'injecte au build par `-X …/selfupdate.releasePublicKey=$(go run ./tools/release public-key)`, qui la dérive de la moitié privée. Rien à recopier là.

Les deux moitiés vont ensemble : une app qui embarque une clé publique et un agent construit avec une autre refusent toute mise à jour, sans message utile. Si la paire doit changer un jour, l'app doit connaître l'ancienne **et** la nouvelle le temps que le parc se mette à jour.

### 3. Vérifier la release

- macOS : le `.dmg` s'ouvre sur un Mac vierge sans avertissement Gatekeeper ; `spctl --assess --type open --context context:primary-signature Pupitre.dmg` accepte.
- Windows : SmartScreen ne bloque pas l'installateur signé, et `resources/app-update.yml` de l'app installée porte `publisherName`.
- Agent : `strings pupitred-linux-amd64 | grep -c pupitre` proche de zéro ; `GET /api/v1/releases/agent/X.Y.Z` répond 401 sans jeton, une redirection signée avec.
- App : `GET /api/v1/releases/app/latest` répond sans session et nomme les cinq artefacts ; `curl -I https://dl.pupitre.studio/app/X.Y.Z/<fichier>` répond 200.
- Sur un VPS réinstallé : l'app installe l'agent de la version, `hello` renvoie `agent_version: "X.Y.Z"`.
- `main` porte le merge commit `release: vX.Y.Z`, et `pupitre.studio` liste la version.
- Mise à jour : l'app précédente propose et installe la nouvelle ; un agent précédent est mis à jour par le bandeau de l'app.

### 4. Revenir en arrière

La version est sortie `stable` en une fois. Revenir en arrière, c'est remettre la précédente dans le canal :

```bash
gh workflow run promote.yml -f version=X.Y.Z -f channel=stable
```

`promote` change le canal de l'agent (`POST /admin/releases/:version/promote`) et de l'app (`POST /admin/app-releases/:version/promote`), puis recopie les trois `latest*.yml` de la version sous `app/stable/`. Rien n'est reconstruit ni re-signé.

- Agent : les agents déjà mis à jour restent sur la nouvelle version tant qu'une version plus récente n'est pas publiée (l'agent ne rétrograde pas sans un geste explicite du propriétaire).
- App : `electron-updater` ne redescend pas, une app déjà à jour attend la version corrigée.
- Les artefacts d'une version publiée ne sont jamais supprimés du bucket : un lien écrit ailleurs continue d'aboutir.
- Un correctif sort sur un nouveau tag `vX.Y.Z+1`, jamais en réécrivant le tag.

## Ce qu'une release ne fait pas

- Commit ou push sans demande explicite ; `--force` ; `--no-verify` ; `PUPITRE_ALLOW_MAIN=1`. `scripts/release.sh` est la demande : son second passage commite, tague et pousse.
- Un squash ou un rebase sur la pull request `staging` → `main` : le tag de la version sortirait de l'historique.
- Une release pour un changement qui ne touche ni l'app ni l'agent : la console, le site et les mails partent par une pull request `staging` → `main` fusionnée en merge commit, sans numéro, et Cloudflare Builds reconstruit les Workers.
- Un second build du même numéro : la version publiée est celle que le canal désigne, un retour arrière promeut la précédente.
- Un secret, un certificat, un mot de passe dans le dépôt, un log, une transcription de session.
- Une publication de l'agent ailleurs que sur le bucket privé, par l'API de la plateforme.
- Un build de release sur un Mac : `node-pty` ne se compile pas pour un autre système, et Windows et Linux ne se construisent que chez eux.
- Une modification de `docs/monorepo.md` sans changer le dashboard dans la même passe, ou l'inverse.
