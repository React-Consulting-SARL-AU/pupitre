# Suivi

Une ligne par tâche. L'agent qui prend une tâche met à jour sa ligne ; le propriétaire passe `en revue` à `fait` à la fusion. Les statuts sont définis dans [`plans/README.md`](./plans/README.md).

## Socle — `INF`

| ID | Tâche | Statut | Branche | PR |
| --- | --- | --- | --- | --- |
| INF-01 | Monorepo Bun + Turbo | fait | `feat/INF-01-monorepo` | fusionnée f8d075a |
| INF-02 | Fermeture du dépôt | fait | `feat/INF-02-closed-source` | fusionnée |
| INF-03 | Workspaces et packages vides | fait | `feat/INF-03-workspaces` | fusionnée |
| INF-04 | Contrats initiaux | fait | `feat/INF-04-contracts` | fusionnée |
| INF-05 | CI GitHub Actions | fait | `ci/INF-05-github-actions` | fusionnée |
| INF-06 | Skills et outillage agent | fait | `chore/INF-06-skills` | fusionnée |
| INF-07 | Contrat : champs booléens et listes dans le catalogue | fait | `feat/INF-07-catalog-fields` | fusionnée |
| INF-08 | Contrat : flux secret d'`install`, presets dans le schéma, code `no_report` | fait | `feat/INF-08-install-contract` | fusionnée |
| INF-09 | Design : ombres, rayons, espace, logos de services | fait | `feat/INF-09-design-tokens` | fusionnée |
| INF-10 | Flux secret sur l'entrée standard | à faire | | |
| INF-11 | Contrat : le verdict de la sonde | fait | `feat/INF-11-probe-contract` | fusionnée |

## Agent serveur — `AGT`

| ID | Tâche | Statut | Branche | PR |
| --- | --- | --- | --- | --- |
| AGT-01 | Squelette, protocole, `hello` et `ping` | fait | `feat/AGT-01-protocol` | fusionnée |
| AGT-02 | Sonde sh et sonde Go | fait | `feat/AGT-02-probe` | fusionnée |
| AGT-03 | Moteur de modules et rapport | fait | `feat/AGT-03-module-engine` | fusionnée |
| AGT-04 | Modules socle et durcissement | fait | `feat/AGT-04-core-modules` | fusionnée |
| AGT-05 | Modules runtimes | fait | `feat/AGT-05-runtimes` | fusionnée |
| AGT-06 | Modules bases de données | fait | `feat/AGT-06-databases` | fusionnée |
| AGT-07 | Modules agents IA et navigateur | à faire | | |
| AGT-08 | Modules éditeurs distants | à faire | | |
| AGT-09 | Modules exposition et outils | à faire | | |
| AGT-10 | Registre des projets et pilotage | fait | `feat/AGT-10-registry` | fusionnée |
| AGT-11 | Sessions, processus, captures, secrets, bases | à faire | | |
| AGT-12 | Shell de l'app et autocomplétion | à faire | | |
| AGT-13 | Mise à jour de l'agent | à faire | | |
| AGT-14 | Droit d'usage, enrôlement, heartbeat | à faire | | |
| AGT-15 | Obfuscation et distribution | à faire | | |
| AGT-16 | Validateur : messages d'erreur déterministes | à faire | | |

## App desktop — `APP`

| ID | Tâche | Statut | Branche | PR |
| --- | --- | --- | --- | --- |
| APP-01 | Design monochrome et thèmes | fait | `feat/APP-01-monochrome` | fusionnée |
| APP-02 | Client du protocole agent sur SSH | fait | `feat/APP-02-agent-client` | fusionnée |
| APP-03 | Serveurs, clés par appareil, config SSH propre à l'app | fait | `feat/APP-03-servers-keys` | fusionnée |
| APP-04 | Écran d'inspection | fait | `feat/APP-04-inspection` | fusionnée |
| APP-05 | Catalogue et configuration des services | à faire | | |
| APP-06 | Installation en direct et rapport | à faire | | |
| APP-07 | Durcissement et bascule root → dev | à faire | | |
| APP-08 | Premier projet | à faire | | |
| APP-09 | Tableau de bord et projets sur le nouveau protocole | à faire | | |
| APP-10 | Terminaux, agents, galerie | à faire | | |
| APP-11 | Services au quotidien | à faire | | |
| APP-12 | Mise à jour de l'agent depuis l'app | à faire | | |
| APP-13 | Build macOS signé, notarisé, bytecode, auto-update | à faire | | |
| APP-14 | Compte : device flow, appareils, enrôlement | à faire | | |
| APP-15 | Serveurs distants et organisations | à faire | | |
| APP-16 | Builds Windows et Linux | à faire | | |
| APP-17 | Harnais Playwright pour Electron | à faire | | |
| APP-18 | Fond natif de la fenêtre selon le thème | à faire | | |
| APP-19 | Appliquer le design accueillant à l'app | à faire | | |
| APP-20 | L'app parle deux langues | à faire | | |

## Plateforme — `PLT`

| ID | Tâche | Statut | Branche | PR |
| --- | --- | --- | --- | --- |
| PLT-01 | Schéma Prisma et Neon | fait | `feat/PLT-01-prisma-neon` | fusionnée |
| PLT-02 | Better Auth : serveur, plugins, clients | fait | `feat/PLT-02-better-auth` | fusionnée |
| PLT-03 | Elysia : socle, guards, erreurs, harnais de test | fait | `feat/PLT-03-elysia-base` | fusionnée |
| PLT-04 | Routes `me`, `devices` | fait | `feat/PLT-04-me-devices` | fusionnée |
| PLT-05 | Enrôlement, jetons d'agent, `agent/state`, heartbeat | fait | `feat/PLT-05-enrollment` | fusionnée |
| PLT-06 | Distribution des binaires signés (R2) | fait | `feat/PLT-06-releases` | fusionnée |
| PLT-07 | Stripe Managed Payments : checkout, portail, webhooks, réconciliation | fait | `feat/PLT-07-stripe` | fusionnée |
| PLT-08 | Console : shell, connexion, serveurs, appareils | à faire | | |
| PLT-09 | Console : abonnement, téléchargements, profil | à faire | | |
| PLT-10 | Organisations : membres, invitations, attribution, audit | à faire | | |
| PLT-11 | Emails transactionnels | à faire | | |
| PLT-12 | Alertes et page de statut | à faire | | |
| PLT-13 | Passkeys et MFA | à faire | | |
| PLT-14 | Déploiement Cloudflare Builds, staging et production | à faire | | |
| PLT-15 | Workflows Cloudflare : déclencheurs des tâches longues | à faire | | |

## Site marketing — `MKT`

| ID | Tâche | Statut | Branche | PR |
| --- | --- | --- | --- | --- |
| MKT-01 | Socle Astro, tokens, i18n, layout | fait | `feat/MKT-01-astro-base` | fusionnée |
| MKT-02 | Accueil | fait | `feat/MKT-02-home` | fusionnée |
| MKT-03 | Tarifs | fait | `feat/MKT-03-pricing` | fusionnée |
| MKT-04 | Téléchargement | à faire | | |
| MKT-05 | Documentation publique | à faire | | |
| MKT-06 | Blog et changelog | à faire | | |
| MKT-07 | Pages légales | à faire | | |
| MKT-08 | SEO, Open Graph, `llms.txt`, analytics | à faire | | |
| MKT-09 | Déploiement Cloudflare Pages | à faire | | |

## Blocages et demandes de contrat

Une ligne par blocage, supprimée quand il est levé.

| Date | Tâche | Ce qui bloque | Décision attendue de |
| --- | --- | --- | --- |
| 2026-09-04 | AGT-10 | L'énoncé et `docs/plans/desktop-and-agent.md` citent un état de projet `down` ; `packages/shared/src/agent-protocol/state.ts` n'en déclare que six (`online`, `starting`, `failed`, `stopped`, `external`, `service`) et le schéma refuse le septième. Une ligne `service` dont le port ne répond pas est rendue `stopped`. | propriétaire |
