# Monorepo

Même outillage que React-Box, mêmes versions quand elles sont compatibles : ce qui a été vérifié là-bas n'a pas à l'être deux fois.

## Outillage

| Outil | Rôle | Note |
| --- | --- | --- |
| Bun 1.3 | gestionnaire de paquets, runtime des scripts, `bun test` | Bun uniquement, jamais npm ni pnpm. `packageManager` épinglé dans `package.json` |
| Turbo 2 | graphe de tâches, cache, `--affected` | `envMode` strict : une variable non déclarée dans `globalPassThroughEnv` n'atteint aucune tâche |
| Biome via Ultracite | lint et format | `biome.jsonc` racine étend `ultracite/biome/core`, `semicolons: "asNeeded"`. Même épingle qu'React-Box (`7.8.3`) tant que la mise à niveau n'a pas été faite là-bas |
| tsgo | typecheck | `@typescript/native-preview`, TypeScript 6 |
| Husky + commitlint | hooks | pre-commit : `ultracite fix` par workspace sur les fichiers indexés ; pre-push : lint, `check:types`, `test` affectés ; commits conventionnels |
| Prisma 7 | schéma et migrations | client généré committé, empreinte `packages/db/src/generated/.prisma-inputs.sha256` vérifiée au lint par `scripts/check-prisma-client-freshness.ts` ; `db:migrate` et `db:migrate:reset` exigent `PUPITRE_ALLOW_MIGRATE_ON=staging` ou `local` |
| Wrangler 4 | Workers, Pages, R2, secrets | `secrets.required` déclarés dans `wrangler.jsonc`, vérifiés avant déploiement |
| Go 1.25+ | l'agent | `gofmt`, `go vet`, `go test`, `garble` en release. Installé par Homebrew sur la machine du propriétaire |
| electron-vite, electron-builder | l'app desktop | bytecode du processus principal, fusibles, signature et notarisation ; un runner par système |

## Développement local

```bash
bun install
bun dev              # site sur :4321, web sur :3000
bun run dev:desktop  # l'app, pointée sur le staging par défaut
```

`bun run dev:web` lance Vite et TanStack Start sous le plugin Cloudflare, avec les bindings locaux. Neon local via `neonctl` ou une branche de dev ; `DATABASE_URL` dans `.env.local`. L'agent se teste sur un VPS de staging réinstallable (`bun --cwd=apps/agent run staging:reset`), jamais sur la machine du propriétaire.

## Vérifications

```bash
bun run lint          # boundaries, ultracite, gofmt et go vet
bun run check:types
bun run test
bun run build
```

Les PR font tourner les tâches affectées ; `main` fait tout.

## Frontières de workspace

`scripts/assert-package-boundaries.ts` refuse : un import entre deux `apps/*` ; un import de `@pupitre/api/lib/*` hors de `packages/api` ; un import des entrées Prisma Node dans `packages/api/src`, `apps/web/src` ; un import de `packages/shared` depuis `apps/agent` autrement que par le JSON Schema exporté.

## Secrets

- Jamais dans le dépôt. Le hook pre-commit refuse toute chaîne ressemblant à une clé API, un jeton ou une clé privée.
- Local : `.env.local` racine, ignoré, symlinké dans `apps/web/`. Modèle : `.env.example`.
- Production : secrets Wrangler. `wrangler.jsonc` déclare `secrets.required` ; `scripts/check-worker-secrets.ts` compare avec ce qui est lié au Worker et refuse le déploiement s'il en manque un.
- Signature : certificats Apple et Azure Trusted Signing dans les secrets GitHub Actions uniquement.

## Cloudflare Builds

| Service | Commande de build | Commande de déploiement |
| --- | --- | --- |
| web | `bun install --frozen-lockfile && bun --cwd=packages/db run db:migrate:deploy && bun --cwd=apps/web run build:cloudflare` | `bun scripts/check-worker-secrets.ts web && cd apps/web/dist/server && bun x wrangler deploy --config wrangler.json --keep-vars` |
| site | `bun install --frozen-lockfile && bun --cwd=apps/site run build` | Pages, `apps/site/dist` |

Deux environnements : `staging` (`staging.pupitre.studio`, `staging-app.pupitre.studio`, Stripe en mode test, branche Neon `staging`) et `production` (branche Neon `production`). L'app desktop de développement pointe sur `staging`.

## Distribution de l'app desktop

### Les noms exacts

| Ce qui est créé | Où | Nom exact |
| --- | --- | --- |
| Identifiant de l'app | `apps/desktop/electron-builder.yml` | `dev.pupitre.app` |
| Dépôt des releases | GitHub | `jordanmonier/pupitre`, privé |
| Déclencheur | GitHub Actions `.github/workflows/release.yml` | un tag `v*` |
| Artefacts macOS | GitHub Releases | `Pupitre-<version>-arm64.dmg`, `Pupitre-<version>.dmg`, `latest-mac.yml` |
| Artefacts Windows | GitHub Releases | `Pupitre Setup <version>.exe`, `latest.yml` |
| Artefacts Linux | GitHub Releases | `Pupitre-<version>.AppImage`, `pupitre_<version>_amd64.deb`, `latest-linux.yml` |
| Certificat macOS | Apple Developer | `Developer ID Application: <société marocaine> (<Team ID>)` |
| Clé de notarisation | App Store Connect | clé d'API, rôle *Developer*, fichier `AuthKey_<KeyID>.p8` |
| Signature Windows | Azure Trusted Signing | compte `pupitre-signing`, profil de certificat `pupitre` |

Les trois `latest*.yml` sont ce que lit `electron-updater` : ils sont produits par `electron-builder --publish always` et n'ont pas à être écrits à la main.

### Les secrets du dépôt, par leur nom

| Secret GitHub | Ce que c'est | Comment l'obtenir |
| --- | --- | --- |
| `PUPITRE_UPDATE_TOKEN` | jeton d'accès personnel, portée `repo` en lecture seule | GitHub → *Developer settings* → *Fine-grained tokens*, accès au seul dépôt `pupitre`, permission *Contents: read* |
| `APPLE_CERTIFICATE` | le `.p12` du certificat Developer ID, en base 64 | `base64 -i DeveloperID.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | le mot de passe de ce `.p12` | choisi à l'export depuis Trousseau d'accès |
| `APPLE_API_KEY_CONTENT` | le `.p8` de la clé de notarisation, en base 64 | `base64 -i AuthKey_<KeyID>.p8 \| pbcopy` |
| `APPLE_API_KEY_ID` | l'identifiant de la clé | la colonne *Key ID* dans App Store Connect |
| `APPLE_API_ISSUER` | l'identifiant de l'émetteur | en haut de la page *Keys* d'App Store Connect |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | l'application Entra ID qui signe | Azure → *App registrations*, un secret client, puis le rôle *Trusted Signing Certificate Profile Signer* sur le compte de signature |

`PUPITRE_UPDATE_TOKEN` entre dans le binaire de l'app : c'est un jeton de **lecture** sur un dépôt privé, rien d'autre. Il est passé au build par `MAIN_VITE_UPDATE_TOKEN`, se retrouve dans le bytecode du processus principal, et le plugin bytecode le protège pour qu'un `strings` ne le rende pas. Le faire tourner suffit à couper les anciennes versions du flux de mise à jour.

### L'ordre de création, une fois pour toutes

1. **Le compte Apple.** Le compte Apple Developer de la société marocaine existe déjà. Dans le portail, créer un certificat **Developer ID Application** (pas *Mac App Distribution* : la distribution se fait hors App Store), le télécharger, l'installer dans Trousseau d'accès, puis l'exporter en `.p12` avec un mot de passe.
2. **La clé de notarisation.** App Store Connect → *Users and Access* → *Integrations* → *Keys*, une clé avec le rôle *Developer*. Le `.p8` ne se télécharge **qu'une fois** ; relever l'*Issuer ID* et le *Key ID* sur la même page.
3. **Azure Trusted Signing.** Créer un compte de signature (région proche, par exemple *West Europe*), y créer une identité validée puis un profil de certificat. La validation d'identité d'une organisation prend quelques jours et demande des justificatifs ; un profil *Public Trust* est ce qu'il faut pour que Windows ne prévienne pas. Créer ensuite une application Entra ID, lui donner un secret client, et lui attribuer le rôle *Trusted Signing Certificate Profile Signer* sur le compte.
4. **Le jeton de mise à jour.** Le jeton fin décrit ci-dessus, sur le seul dépôt `pupitre`, en lecture des contenus.
5. **Les secrets du dépôt.** GitHub → *Settings* → *Secrets and variables* → *Actions*, les neuf noms du tableau ci-dessus. Rien de tout cela n'entre dans le dépôt sous aucune forme.
6. **Aligner `electron-builder.yml`.** Les quatre valeurs de la signature Windows se lisent dans le portail Azure et ne s'inventent pas ; une fois connues, ajouter sous `win:` :

   ```yaml
   azureSignOptions:
     publisherName: <le sujet exact du certificat émis>
     endpoint: https://weu.codesigning.azure.net
     codeSigningAccountName: pupitre-signing
     certificateProfileName: pupitre
   ```

   `endpoint` dépend de la région du compte de signature. Tant que ce bloc n'existe pas, le build Windows va au bout et sort **non signé** : Windows affiche alors un avertissement SmartScreen au premier lancement.
7. **Publier.** `git tag v0.2.0 && git push origin v0.2.0`. Le workflow construit les trois systèmes, signe, notarise, et pousse les artefacts sur une release GitHub.
8. **Vérifier.** Sur un Mac qui n'a jamais vu le certificat : télécharger le `.dmg`, l'ouvrir, l'app démarre sans avertissement Gatekeeper. `spctl --assess --type execute -vv /Applications/Pupitre.app` répond `accepted, source=Notarized Developer ID`.

### Ce que fait chaque release

`electron-vite build` compile le processus principal en bytecode V8 ; `electron-builder --publish always` empaquette, retourne les fusibles (`onlyLoadAppFromAsar`, validation d'intégrité de l'asar, `runAsNode` coupé), signe, notarise sur macOS, puis téléverse. Un build sans identité de signature ne s'arrête pas : electron-builder le dit et produit un artefact non signé — c'est ce qui rend `bun --cwd=apps/desktop run build:mac` utilisable sur la machine du propriétaire.

Un retour arrière se fait en publiant la version précédente : `electron-updater` ne redescend pas de version, il faut donc republier au-dessus. Une release retirée de GitHub disparaît du flux, mais n'annule pas ce qui est déjà installé.

### Ce qui se construit où

Un module natif ne se compile pas pour un autre système : `node-pty` impose un runner par OS, et c'est la raison de la matrice `macos-15`, `windows-2025`, `ubuntu-24.04` du workflow. Depuis un Mac, `bun --cwd=apps/desktop run build:linux` s'arrête sur `node-gyp does not support cross-compiling native modules` — ce n'est pas une erreur de configuration.

| Système | Ce qui sort | Ce qui le signe |
| --- | --- | --- |
| macOS | `.dmg` arm64 et x64 | certificat Developer ID, puis notarisation |
| Windows | installateur NSIS de l'architecture du runner | Azure Trusted Signing, si le bloc existe |
| Linux | AppImage et `.deb` de l'architecture du runner | rien : Linux ne signe pas les applications |

Le `.deb` s'appelle `pupitre` et non `@pupitre/desktop` : le nom du workspace porte une barre oblique, que dpkg refuse. L'exécutable Linux s'appelle `pupitre` pour la même raison, et `pupitre.desktop` s'aligne dessus pour que l'environnement de bureau relie la fenêtre à son lanceur.

### Ce que la mise à jour ne couvre pas

Le `.deb` est installé par apt et mis à jour par apt : l'app n'y touche pas, et le dit. L'AppImage, le `.dmg` et l'installateur Windows se remplacent seuls. Une app construite sans `MAIN_VITE_UPDATE_TOKEN` ne cherche aucune mise à jour, ce qui est le cas de tout build local.

## Neon

Projet `pupitre` (`royal-morning-15862824`, [console](https://console.neon.tech/app/projects/royal-morning-15862824)), région `aws-eu-central-1`, Postgres 18, créé le 4 septembre 2026. C'est la région sur laquelle le Worker `apps/web` est épinglé (`placement` dans `wrangler.jsonc`). Branche `production` par défaut ; branche `staging` pour le staging et la CI de migration ; les branches de développement se créent depuis `staging` avec `neonctl`. `DATABASE_URL` utilise l'endpoint poolé de la branche visée ; `MIGRATE_DATABASE_URL` l'endpoint direct (sans `-pooler`), le seul que Prisma Migrate accepte. `db:migrate:deploy` lit `MIGRATE_DATABASE_URL` et refuse de migrer une autre branche que celle de `DATABASE_URL`.

## Dépendances

Les `overrides` du `package.json` racine sont la seule source de vérité de l'arbre d'installation ; Bun ignore les overrides par workspace. Chaque épingle a une raison écrite ici ; on n'en ajoute pas sans `bun audit` et un `bun run build` qui passent.

Épingles héritées de React-Box, à revérifier à la première mise à niveau : `typescript ^6` (TS 7 casse encore des outils), `ultracite 7.8.3` (la version suivante reformate tout le dépôt), `better-auth` exact (les mineures ont déjà cassé `customSession`).

## Dashboards externes

Cloudflare Builds, Stripe, Neon (projet `pupitre`), Apple Developer, Azure Trusted Signing, GitHub Releases. Ce document est ce qui les décrit ; rien dans le dépôt ne peut vérifier ce qu'ils exécutent. Quand un tableau ci-dessus change, le dashboard change dans la même passe.
