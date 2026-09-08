---
name: release
description: "Sortir une version de Pupitre — lire les commits depuis le dernier tag, écrire l'entrée de changelog en anglais et en français, poser le tag `vX.Y.Z` sur `staging`, ce que `release.yml` construit, notarisation macOS avec le compte Apple existant, signature Windows par Azure Trusted Signing, signature Ed25519 de tous les artefacts, publication de l'app sur le bucket R2 public `dl.pupitre.studio` et de l'agent sur le bucket privé, déclaration à la plateforme par `POST /api/v1/admin/releases` et `/admin/app-releases`, promotion `beta` → `stable` au merge de la pull request `staging` → `main`, feuille de compatibilité app ↔ agent. À utiliser quand le propriétaire demande une release, un correctif à publier, ou quand on touche au pipeline de release. Dit clairement ce qui n'existe pas encore."
---

# Sortir une version

Une release livre deux artefacts : l'app desktop (macOS, Windows, Linux) et l'agent `pupitred` (`linux/amd64`, `linux/arm64`). Les deux sortent sur le **même tag** `vX.Y.Z`, parce que le protocole les lie et que la feuille de compatibilité se lit avec leurs deux numéros.

Le tag se pose sur **`staging`**, jamais sur `main`. Une version est donc toujours publiée en `beta`, éprouvée, puis promue en `stable` par le merge de la pull request `staging` → `main` — le même artefact, celui qui a été essayé, sans reconstruction. Voir [`docs/monorepo.md`](../../../docs/monorepo.md#branches).

## Fichiers gouvernés

| Fichier | Rôle | Existe ? |
| --- | --- | --- |
| `.github/workflows/ci.yml` | CI des pull requests, de `staging` et de `main`, y compris un build de release de l'agent avec une clé jetable | oui |
| `.github/workflows/release.yml` | le pipeline du tag : `agent` → `desktop` → `publish` | oui |
| `.github/workflows/release-agent.yml` | l'agent seul, à la main, entre deux versions de l'app | oui |
| `.github/workflows/promote.yml` | `beta` → `stable` au push sur `main`, sans rien reconstruire ; s'appelle aussi à la main sur une version précise | oui |
| `apps/desktop/package.json` | `version` de l'app, `build:mac`, `build:win`, `build:linux`, `release:publish` | oui |
| `apps/desktop/electron-builder.yml` | cibles, noms d'artefacts, `asarUnpack`, fusibles, signature, flux générique | oui |
| `apps/desktop/scripts/publish-release.ts` | signature Ed25519 des artefacts, envoi sur R2, déclaration à la plateforme | oui |
| `apps/agent/package.json` | `release` (garble, `-X main.version`, signature), `release:publish`, `release:promote` | oui |
| `packages/shared/src/compat` | la feuille de compatibilité app ↔ agent | oui |
| `packages/api/src/lib/releases/publish-token.ts` | le jeton que la CI présente, et sa rotation à deux valeurs | oui |
| `apps/site/src/content/changelog/` | une entrée par version et par langue — la seule source des notes de version | oui |
| `scripts/release-notes.ts` | `--check` qu'une version est couverte partout, sinon écrit le corps de l'entrée anglaise | oui |
| `scripts/assert-branch-writable.ts` | le refus de commiter et de pousser sur `main` | oui |
| `docs/monorepo.md` | les branches, et les dashboards externes : Apple Developer, Azure Trusted Signing, R2, Cloudflare | oui |
| `docs/contracts/platform-api.md` | `/admin/releases`, `/admin/app-releases`, `/releases/app`, table `Release` et `AppRelease` | oui |
| `git log <dernier tag>..staging` | ce qui entre dans la version | oui |

## Ce qui manque encore

| Brique | État |
| --- | --- |
| La paire Ed25519 de release | la moitié publique est dans `apps/desktop/src/main/agent-release.ts` ; vérifier que la moitié privée est bien dans 1Password **et** dans le secret `PUPITRE_RELEASE_PRIVATE_KEY` de l'environnement `release` |
| Le compte Azure Trusted Signing et ses trois variables | consigné dans `docs/tasks/windows-signing.md` ; sans elles, le build Windows sort non signé et le dit |
| La protection de branche de `main` | à poser sur GitHub : pull request obligatoire, merge commit seul, `Quality` requis. Les hooks locaux ne remplacent pas ce réglage |

## Versionnage

- Un tag `vX.Y.Z`, semver. `Z` pour un correctif, `Y` pour une fonctionnalité, `X` quand le protocole app ↔ agent retire ou renomme un champ.
- La même version est écrite dans `apps/desktop/package.json` et injectée dans l'agent au build par `-X main.version` ; le job `agent` **refuse de continuer** si les deux ne coïncident pas.
- L'entier `protocol` du contrat est indépendant de la version : il change seulement quand un champ est retiré ou renommé. Ce jour-là, une ligne s'ajoute à `packages/shared/src/compat` — l'entier, la première version d'app et la première version d'agent qui le parlent — et `bun run contracts:export` la porte jusqu'à l'agent.
- Le tag est annoté, posé sur `staging`, jamais réécrit. Son annotation ne sert qu'à l'historique : **les notes de version sont l'entrée de changelog**, lue par le job `publish`, enregistrée dans `AppRelease` et affichée partout ailleurs. Une release ratée donne un tag suivant.

## Procédure

### 1. Lire ce qui entre dans la version

```bash
git fetch --tags --prune
git switch staging && git pull --ff-only
LAST=$(git describe --tags --abbrev=0 2>/dev/null || true)
git log --no-merges --format='%h %s' ${LAST:+$LAST..}HEAD
```

Sans tag précédent, la liste part du premier commit. Lis-la en entier : c'est la matière de l'entrée de changelog, et rien d'autre ne la remplace — ni le tableau des tâches, ni ce dont tu te souviens de la session.

Puis : `bun run lint`, `bun run check:types`, `bun run test`, `bun run build` verts en local sur `staging` à jour, et le propriétaire a fait tourner la version candidate sur son propre VPS.

### 2. Écrire l'entrée de changelog

Deux fichiers, même passe, mêmes faits : `apps/site/src/content/changelog/en/X-Y-Z.mdx` et `apps/site/src/content/changelog/fr/X-Y-Z.mdx`. Le nom du fichier est la version avec des tirets. Le frontmatter porte `title`, `description`, `locale`, `version`, `channel: beta`, `date`, `order` — `order` d'un cran au-dessus de l'entrée précédente.

Ce qui s'écrit :

- **Ce qui change pour le client**, dans ses mots. Un commit `refactor(api): extraire le sérialiseur` ne produit aucune ligne ; un commit `fix(desktop): l'installation ne perd plus son terminal` en produit une.
- Un titre par surface quand il y a de quoi : l'app, l'agent, la plateforme. Puis, si elles existent, les **limites connues** — ce que cette version ne fait pas encore, ce qui reste à la main.
- Les deux langues disent la même chose. Le français n'est pas une traduction littérale, mais il ne dit rien que l'anglais tait.
- Rien d'inventé. Un commit dont tu ne peux pas dire l'effet client se lit dans son diff, ou ne se mentionne pas.

Le corps de l'entrée anglaise **est** la note de version enregistrée dans `AppRelease.notes` : elle finit sur la page de téléchargement de la console et dans l'app. Écris-la pour ce lecteur-là.

```bash
bun scripts/release-notes.ts X.Y.Z --check   # doit nommer les deux langues
bun scripts/release-notes.ts X.Y.Z           # relis ce que la plateforme enregistrera
```

### 3. Préparer et taguer

1. `apps/desktop/package.json` : `version` → `X.Y.Z`.
2. Si le protocole a changé : une ligne de plus dans `packages/shared/src/compat`, puis `bun --cwd=packages/shared run contracts:export`.
3. Un commit `chore(release): vX.Y.Z` sur `staging` — **seulement si le propriétaire l'a demandé** (`CLAUDE.md`, « Git »). Jamais `--no-verify`.
4. Le tag, sur `staging`, une fois le commit poussé :

```bash
git tag -a vX.Y.Z -m "Pupitre X.Y.Z"
git push origin vX.Y.Z
```

Le push du tag est l'acte de release ; il déclenche `release.yml`. Il est fait par le propriétaire ou sur sa demande explicite. Un tag posé ailleurs que sur `staging` ou `main` fait échouer le workflow avant le premier build, comme une version dont le changelog manque dans une langue.

### 3 bis. La clé de release, une fois pour toutes

Une **seule** paire Ed25519 signe toutes les releases, l'agent comme les artefacts de l'app, stable dans le temps. Sa moitié publique est déjà dans `apps/desktop/src/main/agent-release.ts` ; ce qui suit dit comment elle a été faite, et ce qu'il ne faut pas refaire à la légère.

Le propriétaire la crée lui-même, hors de toute session d'agent — la moitié privée ne doit traverser ni un transcript, ni un fichier du dépôt :

```
cd apps/agent && go run ./tools/release keygen
```

La commande écrit `public <base64>` et `private <base64>` sur la sortie standard, et nulle part ailleurs. Ensuite, trois gestes :

1. **La moitié privée** va dans 1Password, puis dans le secret GitHub Actions `PUPITRE_RELEASE_PRIVATE_KEY` de l'environnement `release`. Elle ne descend jamais sur un poste de travail autrement.
2. **La moitié publique** est recopiée dans `AGENT_RELEASE_PUBLIC_KEY` de `apps/desktop/src/main/agent-release.ts`. Le test `src/main/__tests__/agent-release.test.ts` vérifie qu'elle fait bien 32 octets ; il ne fige pas sa valeur, mais la changer répudie tout ce qui a été publié avant.
3. **L'agent** ne la porte pas en dur : `apps/agent/package.json` l'injecte au build par `-X …/selfupdate.releasePublicKey=$(go run ./tools/release public-key)`, qui la dérive de la moitié privée. Rien à recopier là.

Les deux moitiés vont ensemble : une app qui embarque une clé publique et un agent construit avec une autre refusent toute mise à jour, sans message utile. Si la paire doit changer un jour, l'app doit connaître l'ancienne **et** la nouvelle le temps que le parc se mette à jour.

### 4. Ce que la CI construit

`release.yml` enchaîne trois jobs, tous dans l'environnement `release` pour les secrets :

| Job | Fait | Secrets |
| --- | --- | --- |
| `agent` | vérifie la version de l'app contre le tag, construit `amd64` et `arm64` avec garble, signe, éprouve le binaire (`version`, `hello`, moins de dix chaînes lisibles), l'envoie sur le bucket **privé**, déclare la version par `POST /admin/releases`, et publie binaires et `release.json` en artefact de CI | `PUPITRE_RELEASE_PRIVATE_KEY`, `CLOUDFLARE_*`, `PUPITRE_PUBLISH_TOKEN` |
| `desktop` | sur `macos-15`, `windows-2025`, `ubuntu-24.04` : reprend l'agent signé, compile le processus principal en bytecode, empaquette, retourne les fusibles, signe et notarise sur macOS, signe par Azure sur Windows | certificat Apple, clé de notarisation, application Entra ID |
| `publish` | rassemble les artefacts, les signe avec la clé de release, les dépose sur le bucket **public** avec leur `.sig`, réécrit les flux `latest*.yml` en URL absolues, les dépose sous `app/beta/`, et déclare chaque fichier par `POST /admin/app-releases` | `PUPITRE_RELEASE_PRIVATE_KEY`, `CLOUDFLARE_*`, `PUPITRE_PUBLISH_TOKEN` |

Le binaire de l'agent n'entre **jamais** dans le bucket public : il n'est pas public, l'app le télécharge depuis la plateforme avec le jeton de l'appareil (`docs/security.md`). Les certificats et les clés ne vivent que dans les secrets GitHub Actions et les dashboards listés dans `docs/monorepo.md` ; rien dans le dépôt, jamais dans un log de CI.

### 5. Vérifier la release

- macOS : le `.dmg` s'ouvre sur un Mac vierge sans avertissement Gatekeeper ; `spctl --assess --type open --context context:primary-signature Pupitre.dmg` accepte.
- Windows : SmartScreen ne bloque pas l'installateur signé.
- Agent : `strings pupitred-linux-amd64 | grep -c pupitre` proche de zéro ; `GET /api/v1/releases/agent/X.Y.Z` répond 401 sans jeton, une redirection signée avec.
- App : `GET /api/v1/releases/app/latest?channel=beta` répond sans session et nomme les cinq artefacts ; `curl -I https://dl.pupitre.studio/app/X.Y.Z/<fichier>` répond 200.
- Sur le staging réinstallé : l'app installe l'agent de la version, `hello` renvoie `agent_version: "X.Y.Z"`.
- Mise à jour : l'app précédente propose et installe la nouvelle ; un agent précédent est mis à jour par le bandeau de l'app.

### 6. Promouvoir `beta` → `stable`

La publication rend la version **cible en `beta` seulement** : les serveurs dont l'organisation est sur le canal `beta` la voient dans `/agent/state`, et une app construite pour `beta` la voit dans son flux. Après une semaine sans incident sur le staging et sur le VPS du propriétaire, la version part en production par une pull request :

1. Basculer `channel: beta` → `channel: stable` dans les deux entrées de changelog, sur `staging`. C'est le badge que le site affiche ; il devient juste au moment où la version le devient.
2. Ouvrir la pull request, sur demande du propriétaire :

   ```bash
   gh pr create --base main --head staging \
     --title "release: vX.Y.Z" \
     --body "$(bun scripts/release-notes.ts X.Y.Z)"
   ```

3. La fusionner **par un merge commit** — `gh pr merge --merge`, jamais `--squash` ni `--rebase` : le commit tagué doit rester dans l'historique de `main`, sans quoi `promote.yml` ne le compte pas et `git describe` ne le voit plus.

Le push sur `main` déclenche alors `promote.yml`, qui reprend les tags que le merge vient de rendre accessibles, change le canal de l'agent (`POST /admin/releases/:version/promote`) et de l'app (`POST /admin/app-releases/:version/promote`), puis recopie les trois `latest*.yml` de la version sous `app/stable/`. Rien n'est reconstruit ni re-signé. Le même workflow s'appelle à la main, sur une version précise, pour revenir en arrière.

Le merge déploie aussi la console en production : Cloudflare Builds suit `main`.

### 7. Revenir en arrière

- Agent : promouvoir à nouveau la version précédente ; les agents déjà mis à jour restent sur la nouvelle version tant qu'une version plus récente n'est pas publiée (l'agent ne rétrograde pas sans un geste explicite du propriétaire).
- App : promouvoir la version précédente remet son flux dans le canal ; `electron-updater` ne redescend pas, une app déjà à jour attend la version corrigée.
- Les artefacts d'une version publiée ne sont jamais supprimés du bucket : un lien écrit ailleurs continue d'aboutir.
- Un correctif sort sur un nouveau tag `vX.Y.Z+1`, jamais en réécrivant le tag.

## Ce qu'une release ne fait pas

- Commit ou push sans demande explicite ; `--force` ; `--no-verify` ; `PUPITRE_ALLOW_MAIN=1`.
- Un squash ou un rebase sur la pull request `staging` → `main` : le tag de la version sortirait de l'historique.
- Un second build pour la production : c'est l'artefact éprouvé en `beta` qui est promu, pas une recompilation du même numéro.
- Un secret, un certificat, un mot de passe dans le dépôt, un log, une transcription de session.
- Une publication de l'agent ailleurs que sur le bucket privé, par l'API de la plateforme.
- Un build de release depuis un poste de travail : la signature vit dans la CI.
- Une modification de `docs/monorepo.md` sans changer le dashboard dans la même passe, ou l'inverse.
