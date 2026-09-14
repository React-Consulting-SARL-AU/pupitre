# Architecture

Pupitre est un monorepo Bun. Trois surfaces et un agent : l'app desktop qui pilote un serveur, l'agent compilé sur ce serveur, la plateforme qui vend et autorise, le site qui présente. Le serveur du client est la source de vérité de tout ce qui le concerne ; la plateforme ne connaît de lui que son existence.

## Runtimes

| Workspace | Runtime | Responsabilité |
| --- | --- | --- |
| `apps/desktop` | Electron 42, React 19, node-pty, `ssh` système | Onboarding d'un serveur, catalogue de services, projets, terminaux, agents, compte |
| `apps/agent` | Go, binaire statique, systemd | Sonde, modules d'installation, registre des projets, pilotage tmux, clés, heartbeat, mise à jour |
| `apps/web` | TanStack Start sur Cloudflare Workers | Console `app.pupitre.studio`, montage de `/api/v1` (Elysia) et `/api/auth` (Better Auth), emails, Workflows |
| `apps/site` | Astro sur un Worker Cloudflare à assets statiques | `pupitre.studio` : marketing, docs publiques, blog, légal, téléchargement |
| `packages/api` | Elysia + Eden | Contrat `/api/v1`, client typé, harnais de test API/DB |
| `packages/auth` | Better Auth | `createAuth` et ses plugins, clients web et desktop |
| `packages/db` | Prisma 7 + Cloudflare D1 | Schéma, migrations SQL, clients Bun et Cloudflare |
| `packages/shared` | TypeScript + Zod | Contrats : protocole agent, catalogue, plans, permissions, erreurs |
| `packages/design` | CSS + Tailwind 4 | Tokens monochrome partagés |

```
Pupitre Desktop ──── ssh, clé du client ────▶ pupitred (VPS du client)
       │                                            │
       │ https, bearer                              │ https sortant, jeton de serveur
       ▼                                            ▼
                 apps/web : console + /api/v1 + /api/auth ── D1, Stripe, R2
```

## Les règles qui ne bougent pas

1. **Le serveur du client est la source de vérité** pour ses projets, ses services, ses secrets. L'app affiche ce que l'agent renvoie. La plateforme ne stocke ni code, ni secrets, ni contenu.
2. **Aucune clé privée hors du laptop du client.** L'app génère ses clés ed25519 dans son dossier, une par appareil et une par serveur qu'elle installe ; seules les moitiés publiques remontent à la plateforme, qui les transmet à l'agent.
3. **Aucune connexion entrante vers le serveur du client**, ni de la plateforme, ni du support. L'agent tire ce dont il a besoin par HTTPS sortant. Le seul port ouvert est SSH, pour le client.
4. **Rien de lisible n'est déposé sur le serveur.** Un binaire, des unités systemd générées, des fichiers de configuration. Pas de script.
5. **L'app exige une première connexion réussie, puis reste utilisable sans la plateforme pendant sept jours** : le droit d'usage est mis en cache, puis l'agent passe en mode restreint sans rien casser de ce qui tourne. L'exposition ne dépend pas d'elle du tout : le tunnel est sur le compte Cloudflare du client, monté par l'app depuis son laptop, et rien de la plateforme n'est sur le chemin.
6. **Le contrat avant l'implémentation.** Ce qui traverse une frontière est typé dans `packages/shared` et documenté dans `docs/contracts/` avant d'exister des deux côtés.
7. **Une mise à jour ne réinstalle rien.** Un binaire ne lit jamais une configuration qu'il n'a pas migrée : chaque changement de forme d'un fichier de `/etc/pupitre` ou d'un fichier de l'app est une migration numérotée, rejouée dans l'ordre, sauvegardée avant et remise en l'état si elle refuse. L'app enchaîne mise à jour du binaire, migration, puis modules ; l'agent migre aussi tout seul au démarrage. Voir [migrations de configuration](./contracts/config-migrations.md).

## Desktop

`apps/desktop` est l'app Electron existante, étendue. Le main process tient un canal SSH unique vers chaque serveur (`ssh -F <config de l'app>`), y écrit des requêtes JSON par ligne et lit des réponses et des événements ([protocole](./contracts/agent-protocol.md)). Les terminaux utilisent node-pty et le `ssh` du système. Le renderer ne touche jamais au système : `contextIsolation`, API explicite du preload, validation des noms de projets contre la liste que l'agent vient de donner.

La configuration SSH de l'app vit dans son dossier de données (`ssh/config`, `keys/<serveur>` en 0600). Le `~/.ssh/config` de l'utilisateur n'est jamais modifié ; un hôte existant peut être désigné à la place.

Le compte est requis. L'app demande une connexion au premier lancement, puis lit le droit d'usage de l'organisation active : sans abonnement en cours, fût-il en essai, elle n'enrôle aucun serveur. Seul un build de développement porte un droit d'usage à lui, miroir du tag `dev` de l'agent, et il ne sort jamais du dépôt.

## Agent

`apps/agent` produit `pupitred`, un binaire Go statique pour `linux/amd64` et `linux/arm64`, installé en `/usr/local/bin/pupitred`, avec `/etc/pupitre/` en 0600 root et une unité systemd. Il contient la sonde, les modules du catalogue, le registre des projets, le pilotage de tmux, les commandes de l'app, la synchronisation des clés, le heartbeat et sa propre mise à jour.

Il porte aussi le registre de migrations de sa propre configuration : `pupitred migrate` sur la machine, `agent.migrate` sur le protocole.

Deux interfaces : le protocole JSON sur SSH pour l'app (un processus `pupitred serve` par session), et l'API de la plateforme en HTTPS sortant pour le droit d'usage, les clés et les mises à jour. La sous-commande `pupitred dev` — aussi appelable `dev`, un lien vers le binaire — donne les mêmes commandes à un humain dans un terminal SSH : elle passe par les mêmes gestionnaires, avec les mêmes refus. Le durcissement ferme root en dernier, après avoir vérifié que `dev` accepte une clé.

La stack bash sous `server/` est la spécification des modules : ordre des étapes, pièges d'apt, rapport de fin, commandes de pilotage. Elle disparaît module par module.

## Plateforme

`apps/web` combine TanStack Start, React 19, Vite et le plugin Cloudflare. Les routes de la console vivent dans `src/routes/` ; `src/routes/api/v1/$.ts` délègue à `@pupitre/api/server`, `src/routes/api/auth/$.ts` à `@pupitre/auth/server`. Le Worker sert `/api/v1/*` directement ; la route TanStack Start reste le chemin de dev.

Elysia est montée sur `/api/v1` dans `packages/api/src/server.ts` et reste le contrat unique pour la console et l'app desktop, consommé via Eden Treaty (`@pupitre/api/client`). Les tests d'intégration démarrent la même API sur PGlite via `@pupitre/api/testing`.

Better Auth vit dans `packages/auth` avec l'adaptateur Prisma : lien magique, GitHub, `deviceAuthorization` et `bearer` pour l'app desktop, `organization` avec les rôles `owner`, `admin`, `member`, `admin` pour le support, `openAPI`. Passkeys, `twoFactor` et `sso` s'ajoutent sans migration. Une organisation personnelle est créée à l'inscription : tout appartient à une organisation.

Prisma 7 sur l'adaptateur Cloudflare D1, une base par environnement, liée au Worker sans adresse ni secret ; le Worker est en *smart placement*, exécuté à côté de sa base. Cloudflare Workflows portent les tâches longues (réconciliation des sièges, décommission différée), R2 les binaires signés de l'agent, Cloudflare Email les transactionnels. Stripe Managed Payments encaisse en Merchant of Record par Checkout et Payment Links uniquement.

## Site

`apps/site` est un Astro statique déployé sur un Worker Cloudflare à assets statiques : accueil, tarifs, intégrations, docs publiques en MDX, blog, légal, téléchargement lisant les releases, `llms.txt`. Anglais par défaut, français en `/fr`. Mêmes tokens que la console.

## Frontières

- `apps/*` n'importe jamais un autre `apps/*`.
- `@pupitre/api/lib/*` n'est importable qu'à l'intérieur de `packages/api` ; les apps passent par `./server`, `./client`, `./testing`.
- Les entrées Prisma Node (`@pupitre/db/client`) sont interdites dans le code qui part sur Workers ; les variantes `@pupitre/db/cloudflare/*` s'y substituent.
- `apps/agent` ne dépend d'aucun package TypeScript ; il consomme le JSON Schema exporté de `packages/shared`.
- `scripts/assert-package-boundaries.ts` vérifie tout cela au lint.

## Environnement

Variables publiques du web en `VITE_*` ; secrets en variables runtime ou secrets Wrangler. `.env.local` à la racine est la source unique des secrets locaux ; `.env.example` en liste les noms, alignés sur `apps/web/wrangler.jsonc`. L'app desktop n'a pas de secret : jeton via `safeStorage`, clés dans son dossier de données.

## Déploiement

`apps/web` : un seul environnement Wrangler en ligne, `production`, déployé par Cloudflare Builds sur un push de `main` — `build:production` (migrations D1 puis build) puis `deploy:production` (vérification des secrets requis puis `wrangler deploy --keep-vars`). Il n'y a pas de staging en ligne : tout s'essaie en local. `main` n'avance que par une release, dont le dernier job fusionne `staging` dans `main` une fois l'app et l'agent publiés. Runbook dans [deploy.md](./deploy.md), noms exacts dans [monorepo.md](./monorepo.md). `apps/site` : un Worker à assets statiques, Cloudflare Builds sur le même push de `main`. `apps/desktop` : GitHub Actions par tag, builds signés et notarisés, publication sur un bucket R2 public — `dl.pupitre.studio` — et déclaration à la plateforme, qui sert la page de téléchargement du site. `apps/agent` : le même tag, garble, signature, publication sur le bucket R2 privé via l'API de la plateforme.
