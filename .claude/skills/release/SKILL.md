---
name: release
description: "Sortir une version de Pupitre — tag `vX.Y.Z`, ce que la CI construit, notarisation macOS avec le compte Apple existant, signature Windows par Azure Trusted Signing, publication de l'app sur GitHub Releases privées et de l'agent sur R2 via `POST /api/v1/admin/releases`, entrée de changelog dans `apps/site/src/content/changelog`, version cible en `beta` puis `stable`. À utiliser quand le propriétaire demande une release, un correctif à publier, ou quand une tâche touche au pipeline de release. Dit clairement ce qui n'existe pas encore."
---

# Sortir une version

Une release livre deux artefacts : l'app desktop (macOS, Windows, Linux) et l'agent `pupitred` (`linux/amd64`, `linux/arm64`). Les deux sortent sur le **même tag** `vX.Y.Z`, parce que l'app embarque la version de l'agent qu'elle sait installer et que le protocole les lie. Le site publie l'entrée de changelog correspondante.

## Fichiers gouvernés

| Fichier | Rôle | Existe ? |
| --- | --- | --- |
| `.github/workflows/quality.yml`, `agent.yml` | CI des PR et de `main` (INF-05) | **non** — INF-05 en cours |
| `.github/workflows/release.yml` | pipeline déclenché par un tag (AGT-15, APP-13, APP-16) | **non** |
| `apps/desktop/package.json` | `version` de l'app, scripts `build:mac`, `build:win`, `build:linux` | oui |
| `apps/desktop/electron-builder.yml` | cibles, `asarUnpack`, icônes ; signature, notarisation et `publish` à ajouter (APP-13) | oui, sans signature |
| `apps/agent/package.json` | `build:linux-amd64`, `build:linux-arm64` ; `release` (garble + signature) à ajouter (AGT-15) | oui, sans `release` |
| `apps/site/src/content/changelog/` | une entrée par version, fr et en (MKT-06) | **non** |
| `docs/monorepo.md` | les dashboards externes : Apple Developer, Azure Trusted Signing, GitHub Releases, R2 | oui |
| `docs/contracts/platform-api.md` | `POST /admin/releases`, `GET /agent/release/:version`, table `Release` | oui |
| `docs/TRACKING.md` | ce qui est `fait` sur `main` au moment du tag | oui |

## Ce qui existe au 2026-09-04

| Brique | Tâche | État |
| --- | --- | --- |
| CI `Quality` et `Agent` (lint, typecheck, test, build, binaires en artefacts) | INF-05 | en cours |
| Build de release de l'agent : `-trimpath -ldflags="-s -w"`, garble, signature Ed25519, publication R2 par `POST /admin/releases`, canaux `stable` et `beta` | AGT-15 | à faire |
| Table `Release`, `POST /admin/releases`, `GET /agent/release/:version`, URL R2 signées, version cible dans `/agent/state` | PLT-06 | à faire |
| App macOS : bytecode main et preload, asar avec intégrité, signature, notarisation, electron-updater sur GitHub Releases privées, workflow par tag | APP-13 | à faire |
| App Windows (Azure Trusted Signing) et Linux (AppImage, `.deb`) | APP-16 | à faire |
| Changelog du site lu depuis les notes de version | MKT-06 | à faire |
| Page de téléchargement de la console depuis `Release` | PLT-09 | à faire |

Tant que ces tâches ne sont pas `fait` dans `docs/TRACKING.md`, **il n'y a pas de pipeline de release**. Ce skill décrit la procédure cible pour que chacune de ces tâches la construise dans le même sens ; une étape marquée « (cible) » ne s'exécute pas aujourd'hui.

## Versionnage

- Un tag `vX.Y.Z`, semver. `Z` pour un correctif, `Y` pour une fonctionnalité, `X` quand le protocole app ↔ agent retire ou renomme un champ (`docs/contracts/agent-protocol.md`, « Versionnage »).
- La même version est écrite dans `apps/desktop/package.json` (`version`) et injectée dans l'agent au build par `-ldflags "-s -w -X main.version=X.Y.Z"` (cible, AGT-15 : le script `build` actuel ne passe pas `-X`).
- L'entier `protocol` du contrat est indépendant de la version : il change seulement quand un champ est retiré ou renommé, et l'agent accepte la version courante et la précédente.
- Le tag est annoté, posé sur `main`, jamais réécrit. Une release ratée donne un tag suivant.

## Procédure

### 1. Vérifier `main`

- `docs/TRACKING.md` : tout ce qui entre dans la version est `fait`, rien n'est `en revue` avec une PR fusionnée par erreur.
- `bun run lint`, `bun run check:types`, `bun run test`, `bun run build` verts en local sur `main` à jour.
- Le propriétaire a fait tourner la version candidate sur son propre VPS (porte du MVP dans `docs/plans/desktop-and-agent.md`).

### 2. Préparer la version

1. `apps/desktop/package.json` : `version` → `X.Y.Z`.
2. `apps/site/src/content/changelog/X.Y.Z.md` (cible, MKT-06) : une entrée en anglais et une en français, même passe, format de la collection `changelog`. Ce qui change pour le client, pas les identifiants de tâches. Aucun mot de la liste interdite du site.
3. Un commit `chore(release): vX.Y.Z` — **seulement si le propriétaire l'a demandé** (`CLAUDE.md`, « Git »). Jamais `--no-verify`.

### 3. Poser le tag

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

Le push du tag est l'acte de release ; il déclenche `release.yml` (cible). Il est fait par le propriétaire ou sur sa demande explicite.

### 4. Ce que la CI construit (cible)

`release.yml` enchaîne, après `Quality` et `Agent` :

| Job | Fait | Secrets GitHub Actions | Tâche |
| --- | --- | --- | --- |
| `agent-release` | `go vet`, `go test`, build `amd64` et `arm64` avec garble et `-X main.version`, `sha256`, signature Ed25519 des binaires, envoi sur R2, `POST /api/v1/admin/releases` `{ version, arch, sha256, signature, r2_key }` pour chaque architecture | clé privée Ed25519 de signature, `R2_*`, jeton d'un compte `platform_admin` | AGT-15, PLT-06 |
| `desktop-macos` | `bun --cwd=apps/desktop run build:mac` avec le plugin bytecode, signature avec le certificat Developer ID du compte Apple existant, notarisation par `notarytool`, agrafage, `.dmg` `arm64` et `x64`, `latest-mac.yml` pour electron-updater | certificat `.p12` et son mot de passe, identifiant Apple, mot de passe d'app, `Team ID` | APP-13 |
| `desktop-windows` | `build:win`, signature par Azure Trusted Signing (`electron-builder` avec l'endpoint et le profil de signature), installateur NSIS, `latest.yml` | identifiants Azure du compte de signature | APP-16 |
| `desktop-linux` | `build:linux` : AppImage et `.deb`, `latest-linux.yml` | aucun | APP-16 |
| `publish` | GitHub Release **privée**, en brouillon tant que les trois OS ne sont pas là, puis publiée ; les fichiers `latest*.yml` servent electron-updater avec le jeton d'accès de l'app | jeton GitHub avec accès au dépôt privé | APP-13 |

Le binaire de l'agent n'est **jamais** attaché à la GitHub Release : il n'est pas public, l'app le télécharge depuis la plateforme avec le jeton de l'appareil (`docs/security.md`). Les certificats et clés ne vivent que dans les secrets GitHub Actions et les dashboards listés dans `docs/monorepo.md` ; rien dans le dépôt, jamais dans un log de CI.

### 5. Vérifier la release

- macOS : le `.dmg` s'ouvre sur un Mac vierge sans avertissement Gatekeeper ; `spctl --assess --type open --context context:primary-signature Pupitre.dmg` accepte.
- Windows : SmartScreen ne bloque pas l'installateur signé.
- Agent : `strings pupitred-linux-amd64 | grep -c pupitre` proche de zéro ; `GET /api/v1/agent/release/X.Y.Z` répond 401 sans jeton, une redirection signée avec.
- Sur le staging réinstallé : l'app installe l'agent de la version, `hello` renvoie `agent_version: "X.Y.Z"`.
- Mise à jour : l'app précédente propose et installe la nouvelle ; un agent précédent est mis à jour par le bandeau de l'app (APP-12).

### 6. Promouvoir `beta` → `stable` (cible)

La publication par la CI rend la version **cible en `beta` seulement** (`PLT-06`) : les serveurs dont l'organisation est sur le canal `beta` la voient dans `/agent/state` ; les autres restent sur `stable`. Après une semaine sans incident sur le staging et sur le VPS du propriétaire, la version passe en `stable` depuis la console d'administration.

Le contrat ne décrit pas encore le mécanisme de promotion (`POST /admin/releases` ne porte pas `channel`, aucune route ne le change) : PLT-06 complète `docs/contracts/platform-api.md` par une tâche de contrat avant de l'implémenter.

### 7. Revenir en arrière

- Agent : la version cible de `/agent/state` revient à la précédente depuis la console d'administration ; les agents déjà mis à jour restent sur la nouvelle version tant qu'une version plus récente n'est pas publiée (l'agent ne rétrograde pas).
- App : la GitHub Release repasse en brouillon ; electron-updater ne la propose plus. Les apps déjà mises à jour attendent la version corrigée.
- Un correctif sort sur un nouveau tag `vX.Y.Z+1`, jamais en réécrivant le tag.

## Ce qu'une tâche de release ne fait pas

- Commit ou push sans demande explicite ; `--force` ; `--no-verify`.
- Un secret, un certificat, un mot de passe dans le dépôt, un log, une transcription de session.
- Une publication de l'agent ailleurs que sur R2 par l'API de la plateforme.
- Un build de release depuis un poste de travail : la signature vit dans la CI.
- Une modification de `docs/monorepo.md` sans changer le dashboard dans la même passe, ou l'inverse.
