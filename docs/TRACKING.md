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
| INF-10 | Flux secret sur l'entrée standard | fait | `feat/INF-10-secret-stream` | fusionnée |
| INF-12 | Contrat : les releases de l'app | fait | `feat/INF-12-app-releases` | fusionnée |
| INF-13 | Le quota gratuit vit dans le contrat partagé | fait | `main` | constante unique dans `@pupitre/shared/plans` |
| INF-14 | La langue de l'utilisateur est enregistrée | fait | `feat/INF-14-user-locale` | fusionnée |
| INF-15 | Contrat : détecter le gestionnaire d'un dépôt | à faire | | |
| INF-17 | Contrat : lire la valeur d'un identifiant de service | à faire | | |
| INF-18 | Contrat : la plateforme publie l'empreinte et refuse le retour en arrière | à faire | | |
| INF-19 | Contrat : `/status` dit depuis quand il sait | en revue | `feat/INF-19-status-freshness` | |
| INF-20 | Contrat : une adresse par capture | à faire | | |
| INF-16 | Contrat : le chemin absolu d'un projet | fait | `feat/INF-16-project-path` | fusionnée |
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
| AGT-07 | Modules agents IA et navigateur | fait | `feat/AGT-07-ai-modules` | fusionnée |
| AGT-08 | Modules éditeurs distants | fait | `feat/AGT-08-editors` | fusionnée |
| AGT-09 | Modules exposition et outils | fait | `feat/AGT-09-exposure` | fusionnée |
| AGT-10 | Registre des projets et pilotage | fait | `feat/AGT-10-registry` | fusionnée |
| AGT-11 | Sessions, processus, captures, secrets, bases | fait | `feat/AGT-11-sessions` | fusionnée |
| AGT-12 | Shell de l'app et autocomplétion | fait | `feat/AGT-12-shell` | fusionnée |
| AGT-13 | Mise à jour de l'agent | fait | `feat/AGT-13-self-update` | fusionnée |
| AGT-14 | Droit d'usage, enrôlement, heartbeat | fait | `feat/AGT-14-entitlement` | fusionnée |
| AGT-15 | Obfuscation et distribution | à faire | | |
| AGT-16 | Validateur : messages d'erreur déterministes | à faire | | |
| AGT-17 | La racine rendue par `project.git_status` reste dans la racine des projets | à faire | | |

## App desktop — `APP`

| ID | Tâche | Statut | Branche | PR |
| --- | --- | --- | --- | --- |
| APP-01 | Design monochrome et thèmes | fait | `feat/APP-01-monochrome` | fusionnée |
| APP-02 | Client du protocole agent sur SSH | fait | `feat/APP-02-agent-client` | fusionnée |
| APP-03 | Serveurs, clés par appareil, config SSH propre à l'app | fait | `feat/APP-03-servers-keys` | fusionnée |
| APP-04 | Écran d'inspection | fait | `feat/APP-04-inspection` | fusionnée |
| APP-05 | Catalogue et configuration des services | fait | `feat/APP-05-catalog` | fusionnée |
| APP-06 | Installation en direct et rapport | fait | `feat/APP-06-install` | fusionnée |
| APP-07 | Durcissement et bascule root → dev | fait | `feat/APP-07-harden` | fusionnée |
| APP-08 | Premier projet | fait | `feat/APP-08-first-project` | fusionnée |
| APP-09 | Tableau de bord et projets sur le nouveau protocole | fait | `feat/APP-09-dashboard` | fusionnée |
| APP-10 | Terminaux, agents, galerie | fait | `feat/APP-10-terminals` | fusionnée |
| APP-11 | Services au quotidien | fait | `feat/APP-11-services` | fusionnée |
| APP-12 | Mise à jour de l'agent depuis l'app | fait | `feat/APP-12-agent-update` | fusionnée |
| APP-13 | Build macOS signé, notarisé, bytecode, auto-update | à faire | | |
| APP-14 | Compte : device flow, appareils, enrôlement | à faire | | |
| APP-15 | Serveurs distants et organisations | à faire | | |
| APP-16 | Builds Windows et Linux | à faire | | |
| APP-17 | Harnais Playwright pour Electron | fait | `feat/APP-17-electron-e2e` | fusionnée |
| APP-18 | Fond natif de la fenêtre selon le thème | fait | `feat/APP-18-window-and-font` | fusionnée |
| APP-19 | Appliquer le design accueillant à l'app | fait | `feat/APP-19-warm-design` | fusionnée |
| APP-21 | Embarquer la police d'affichage dans l'app | fait | `feat/APP-18-window-and-font` | fusionnée |
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
| PLT-08 | Console : shell, connexion, serveurs, appareils | fait | `feat/PLT-08-console` | fusionnée |
| PLT-09 | Console : abonnement, téléchargements, profil | fait | `feat/PLT-09-billing-console` | fusionnée |
| PLT-10 | Organisations : membres, invitations, attribution, audit | fait | `feat/PLT-10-teams` | fusionnée |
| PLT-11 | Emails transactionnels | fait | `feat/PLT-11-emails` | fusionnée |
| PLT-12 | Alertes et page de statut | fait | `feat/PLT-12-alerts` | fusionnée |
| PLT-13 | Passkeys et MFA | fait | `feat/PLT-13-passkeys` | fusionnée |
| PLT-14 | Déploiement Cloudflare Builds, staging et production | en revue | `feat/PLT-14-deploy` | fusion en attente de PLT-18 : mêmes fichiers |
| PLT-15 | Workflows Cloudflare : déclencheurs des tâches longues | fait | `feat/PLT-15-workflows` | fusionnée |
| PLT-19 | Déclencheur planifié pour la fin de tolérance | fait | `feat/PLT-19-grace-cron` | fusionnée |
| PLT-17 | Le workflow d'évaluation des alertes | fait | `feat/PLT-17-alerts-workflow` | fusionnée |
| PLT-16 | Harnais Playwright pour la console | fait | `feat/PLT-16-e2e` | fusionnée |
| PLT-18 | Managed Payments : vendeur Stripe, un produit, deux prix | en revue | `main` | |


## Site marketing — `MKT`

| ID | Tâche | Statut | Branche | PR |
| --- | --- | --- | --- | --- |
| MKT-01 | Socle Astro, tokens, i18n, layout | fait | `feat/MKT-01-astro-base` | fusionnée |
| MKT-02 | Accueil | fait | `feat/MKT-02-home` | fusionnée |
| MKT-03 | Tarifs | fait | `feat/MKT-03-pricing` | fusionnée |
| MKT-04 | Téléchargement | en revue | `feat/MKT-04-09-site` | |
| MKT-05 | Documentation publique | à faire | | |
| MKT-06 | Blog et changelog | à faire | | |
| MKT-07 | Pages légales | à faire | | |
| MKT-08 | SEO, Open Graph, `llms.txt`, analytics | à faire | | |
| MKT-09 | Déploiement Cloudflare Pages | à faire | | |

## Blocages et demandes de contrat

Une ligne par blocage, supprimée quand il est levé.

| Date | Tâche | Ce qui bloque | Décision attendue de |
| --- | --- | --- | --- |
