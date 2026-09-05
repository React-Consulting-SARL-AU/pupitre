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
| INF-15 | Contrat : détecter le gestionnaire d'un dépôt | fait | `feat/INF-15-project-detect` | fusionnée |
| INF-17 | Contrat : lire la valeur d'un identifiant de service | fait | `feat/INF-17-secret-value` | fusionnée |
| INF-18 | Contrat : la plateforme publie l'empreinte et refuse le retour en arrière | fait | `feat/INF-18-release-floor` | fusionnée |
| INF-19 | Contrat : `/status` dit depuis quand il sait | fait | `feat/INF-19-status-freshness` | fusionnée |
| INF-20 | Contrat : le contenu d'une capture | fait | `feat/INF-20-shot-url` | fusionnée |
| INF-21 | Contrat : l'app remet le jeton d'enrôlement à l'agent | fait | `feat/INF-21-enroll` | fusionnée |
| INF-16 | Contrat : le chemin absolu d'un projet | fait | `feat/INF-16-project-path` | fusionnée |
| INF-11 | Contrat : le verdict de la sonde | fait | `feat/INF-11-probe-contract` | fusionnée |
| INF-22 | Contrat : rien sans compte ni abonnement | fait | `main` | 6cf10dc |
| INF-23 | Contrat : un serveur restreint peut se ré-enrôler | fait | `main` | ce6818e · critère 3 reporté sur APP-29 |

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
| AGT-15 | Obfuscation et distribution | fait | `feat/AGT-15-release` | fusionnée |
| AGT-16 | Validateur : messages d'erreur déterministes | fait | `feat/AGT-16-validator` | fusionnée |
| AGT-17 | La racine rendue par `project.git_status` reste dans la racine des projets | fait | `feat/AGT-17-git-root` | fusionnée |

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
| APP-13 | Build macOS signé, notarisé, bytecode, auto-update | fait | `feat/APP-13-builds` | fusionnée |
| APP-14 | Compte : device flow, appareils, enrôlement | fait | `feat/APP-14-account` | fusionnée |
| APP-15 | Serveurs distants et organisations | en revue | `main` | e968f10 · le sélecteur d'organisation est réduit à un renvoi vers la console, faute de route : voir le blocage du 2026-09-05 |
| APP-16 | Builds Windows et Linux | fait | `feat/APP-13-builds` | fusionnée |
| APP-17 | Harnais Playwright pour Electron | fait | `feat/APP-17-electron-e2e` | fusionnée |
| APP-18 | Fond natif de la fenêtre selon le thème | fait | `feat/APP-18-window-and-font` | fusionnée |
| APP-19 | Appliquer le design accueillant à l'app | fait | `feat/APP-19-warm-design` | fusionnée |
| APP-21 | Embarquer la police d'affichage dans l'app | fait | `feat/APP-18-window-and-font` | fusionnée |
| APP-22 | L'écran Services révèle une vraie valeur | fait | `main` | 8f54f57 |
| APP-23 | La galerie affiche vraiment les captures | fait | `main` | 8f54f57 |
| APP-24 | L'app se fie à la plateforme pour la signature | fait | `main` | a914da3 |
| APP-25 | L'app lit le port libre dans le remède, pas dans la phrase | fait | `main` | a914da3 |
| APP-26 | L'app prend les arrondis du système | fait | `main` | c660cd0 |
| PLT-20 | Le client de base de données ne survit pas à une requête | fait | `main` | 4e04670 |
| APP-20 | L'app parle deux langues | fait | `feat/APP-20-i18n` | fusionnée |
| APP-27 | Le compte est le premier écran | fait | `main` | 8f01f5f |
| APP-28 | Le droit d'usage refuse les actions, pas seulement l'installation | fait | `main` | 8f01f5f puis 62e640c · le garde vit dans le client, aucun canal ne peut dériver |
| APP-29 | Réparer un serveur restreint depuis l'app | fait | `main` | e7aa924 · dépend de PLT-26 pour ne pas dupliquer côté plateforme |

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
| PLT-14 | Déploiement Cloudflare Builds, staging et production | en revue | `main` | b070300 · porté à la main sur `main` ; le projet Cloudflare Workers Builds reste à créer dans le dashboard |
| PLT-15 | Workflows Cloudflare : déclencheurs des tâches longues | fait | `feat/PLT-15-workflows` | fusionnée |
| PLT-19 | Déclencheur planifié pour la fin de tolérance | fait | `feat/PLT-19-grace-cron` | fusionnée |
| PLT-21 | Sans abonnement, aucun droit d'usage | fait | `main` | 1eff365 |
| PLT-22 | La console prend les arrondis du système | fait | `main` | b2a3ab4 |
| PLT-23 | La console parle deux langues, et porte ses réglages partout | fait | `main` | b2a3ab4 · relecture humaine de l'anglais toujours souhaitable |
| PLT-17 | Le workflow d'évaluation des alertes | fait | `feat/PLT-17-alerts-workflow` | fusionnée |
| PLT-16 | Harnais Playwright pour la console | fait | `feat/PLT-16-e2e` | fusionnée |
| PLT-18 | Managed Payments : vendeur Stripe, un produit, deux prix | fait | `main` | réserve : pas de test de littéral de prix côté console |
| PLT-25 | De l'inscription à l'essai, en une action | fait | `main` | c10eb27 |
| PLT-24 | La console fait télécharger, puis lier | fait | `main` | c10eb27 |
| PLT-26 | Un ré-enrôlement répare, il ne duplique pas | fait | `main` | 278cb02 |
| PLT-27 | Deux enrôlements simultanés ne font qu'un serveur | à faire | | ouverte par PLT-26 : la course demande une migration |


## Site marketing — `MKT`

| ID | Tâche | Statut | Branche | PR |
| --- | --- | --- | --- | --- |
| MKT-01 | Socle Astro, tokens, i18n, layout | fait | `feat/MKT-01-astro-base` | fusionnée |
| MKT-02 | Accueil | fait | `feat/MKT-02-home` | fusionnée |
| MKT-03 | Tarifs | fait | `feat/MKT-03-pricing` | fusionnée |
| MKT-04 | Téléchargement | fait | `main` 2ab1e97 | empreintes factices retirées |
| MKT-05 | Documentation publique | fait | `main` ee745b3 | critère 2 « la doc suffit » demande un parcours humain, par le propriétaire |
| MKT-06 | Blog et changelog | fait | `main` ee745b3 | spec sans critère d'acceptation ; RSS et rendu non couverts par un test |
| MKT-07 | Pages légales | en revue | `main` | ee745b3 · les 10 pages légales sont des brouillons : textes et DPA téléchargeable attendus du propriétaire |
| MKT-08 | SEO, Open Graph, `llms.txt`, analytics | fait | `main` 2ab1e97 | JSON-LD jamais passé à un validateur schema.org réel |
| MKT-09 | Déploiement Cloudflare Pages | en revue | `main` | ee745b3 · projet Cloudflare Pages à créer et relier dans le dashboard ; le dépôt est prêt |
| MKT-10 | Refonte du design du site | fait | `main` 2ab1e97 |  |
| MKT-11 | Redirections manquantes vers les tarifs et le téléchargement | fait | `main` ee745b3 |  |
| MKT-12 | Un accueil accueillant : langage courant et logos des services | fait | `main` 2ab1e97 |  |
| MKT-13 | Le design accueillant sur tout le site, sélecteur de thème en icônes | fait | `main` 2ab1e97 |  |
| MKT-14 | Le site mène à la création de compte | fait | `main` 2ab1e97 |  |

## Blocages et demandes de contrat

Une ligne par blocage, supprimée quand il est levé.

| Date | Tâche | Ce qui bloque | Décision attendue de |
| --- | --- | --- | --- |
| 2026-09-05 | APP-15 | Trois manques du contrat, découverts en livrant APP-15, chacun contourné proprement plutôt que forcé. **(a)** `GET /me/servers` ne porte pas d'`organization_id` et la route n'est pas cadrée par organisation : l'app ne peut ni grouper ni filtrer les serveurs attribués. **(b)** Aucune route accessible au porteur ne change l'organisation active — `GET /me` rend `organizations[]` et `active_organization`, `PATCH /me` ne prend que `locale`. L'app nomme donc les organisations et renvoie vers la console ; un vrai sélecteur demande `PATCH /me { organization_id }` ou la documentation de `set-active` pour le porteur. **(c)** `key_ready` est calculé par compte (« cet utilisateur a au moins un appareil ») et non par serveur : il dit que la plateforme a une clé à pousser, pas qu'elle a atterri. L'attente est donc optimiste. Décider lesquels valent une tâche de contrat pour le MVP. | propriétaire |
| 2026-09-05 | PLT-25 | Deux demandes de contrat nées du parcours d'essai, contournées proprement plutôt que forcées. **(a)** `startCheckout` de `packages/api` code en dur `successUrl = /dashboard/billing?checkout=done`, alors que l'étape d'essai vit sur `/dashboard/start`. La console redirige donc l'une vers l'autre tant que le droit d'usage vaut `suspended` — un filet testé, pas une solution. Il faudrait que l'appelant dise où revenir. **(b)** « L'intervalle par défaut de l'organisation » n'est pas lisible avant qu'un abonnement existe : `OrganizationBilling.defaultInterval` ne vient que de `GET /orgs/:id/subscription`, qui rend `null` sans abonnement — donc toujours, à l'instant précis où l'on démarre l'essai. La console envoie `month`. | propriétaire |
| 2026-09-05 | APP-13 | Le preload ne peut pas être compilé en bytecode : Electron le charge dans le processus de rendu, dont le V8 refuse les données de cache produites par l'isolat Node du compilateur, et la fenêtre s'ouvre alors sans son pont — constaté par Playwright. Le processus principal, lui, l'est, et c'est là que vivent la logique et le jeton de mise à jour. Rien à décider dans l'immédiat : c'est une limite d'Electron, consignée pour qu'on ne la redécouvre pas. | pour information |
| 2026-09-05 | APP-14 · AGT-15 | Une **seule** paire Ed25519 signe toutes les releases de l'agent, stable dans le temps : décidé. La marche à suivre est écrite dans `.claude/skills/release/SKILL.md`, section « La clé de release, une fois pour toutes ». **Reste au propriétaire** de lancer `go run ./tools/release keygen` hors session d'agent, de mettre la moitié privée dans 1Password puis dans le secret GitHub Actions, et de recopier la moitié publique dans `AGENT_RELEASE_PUBLIC_KEY`. Tant que ce n'est pas fait, la vérification des releases est en place mais rien ne la nourrit. | propriétaire — action à faire |
