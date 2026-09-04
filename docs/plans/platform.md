# Plan — Plateforme

Workspaces : `apps/web`, `packages/db`, `packages/auth`, `packages/api`. Préfixe `PLT`. Ce que la plateforme fait : comptes, organisations, appareils, serveurs enrôlés, droits d'usage, abonnements, distribution des binaires, console d'administration. Ce qu'elle ne fait jamais : entrer sur un serveur client, stocker son code ou ses secrets.

Contrats à lire : [platform-api.md](../contracts/platform-api.md), [security.md](../security.md), [DESIGN.md](../product/DESIGN.md), [architecture.md](../architecture.md). Modèle d'organisation : React-Box (`packages/api`, `packages/db`, `apps/web`).

## Cible

```
packages/db/
├── prisma/schema.prisma           tables Better Auth + Device, Server, Subscription, OrganizationBilling, Release, Event, StripeEvent
├── prisma/migrations/
├── prisma.config.ts
└── src/generated/                 clients prisma et prisma-cloudflare, committés, fraîcheur vérifiée

packages/auth/
├── src/server.ts                  createAuth(prisma, env) : plugins, hooks, emails
├── src/plugins/                   device-authorization, organization (rôles), admin, magic-link, github
├── src/client/web.ts              createAuthClient pour la console
├── src/client/desktop.ts          client device flow + bearer pour l'app
└── src/testing/                   sessions de test

packages/api/
├── src/server.ts                  app Elysia /api/v1, openapi, erreurs, handleApiRequest
├── src/client.ts                  Eden Treaty
├── src/types.ts
├── src/lib/api/plugins/           auth, guards (requireOrg, requireRole, requireServer, requirePlatformAdmin)
├── src/lib/api/routes/            me, devices, servers, agent, orgs, admin, webhooks
├── src/lib/                       devices/, servers/, entitlement/, billing/, releases/, audit/, emails/
├── src/testing/                   PGlite, bootApiTestServer, factories, session
└── src/__tests__/

apps/web/
├── src/routes/
│   ├── api/v1/$.ts · api/auth/$.ts
│   ├── auth/                      sign-in, device (page du device flow), invitation
│   ├── dashboard/                 servers, servers.$id, devices, members, billing, audit, settings
│   ├── admin/                     servers, releases, organizations, users
│   └── download.tsx
├── src/components/ui, dashboard, admin, auth
├── src/lib/                       api/, auth/, query/, schemas/, domain/
├── src/workflows/                 ReconcileSeats, DecommissionServer, ExpireEnrollments
├── src/worker.ts · wrangler.jsonc · vite.config.ts
└── CLAUDE.md
```

## Lot 3 — Comptes personnels

### PLT-01 — Schéma Prisma et Neon
Lot 3 · dépend de INF-03 · `packages/db`

Périmètre. `schema.prisma` avec les tables Better Auth générées par son CLI et les tables du contrat, adaptateurs Neon et pg, clients Node et Cloudflare, migrations, `db:*` scripts, `check-prisma-client-freshness`, `guard-neon-local`, projet Neon `staging` et `production`.
Critères d'acceptation.
1. `bun run db:migrate` sur une branche Neon vide crée le schéma ; `db:generate` produit les deux clients.
2. `bun run lint` échoue si le client committé est périmé.

### PLT-02 — Better Auth : serveur, plugins, clients
Lot 3 · dépend de PLT-01 · `packages/auth`

Périmètre. `createAuth` avec `prismaAdapter`, `magicLink`, GitHub social, `deviceAuthorization`, `bearer`, `organization` (rôles `owner`, `admin`, `member`, contrôle d'accès depuis `@pupitre/shared/permissions`), `admin` (réservé à `platform_admin`), `openAPI`, `tanstackStartCookies` ; hook `afterCreate` utilisateur qui crée l'organisation personnelle et la rend active ; emails de lien magique et d'invitation ; clients web et desktop ; cookies `Secure`, `HttpOnly`, `SameSite=Lax` ; limitation des tentatives ; sessions 60 jours renouvelées par jour.
Critères d'acceptation.
1. Inscription par lien magique → une organisation personnelle existe, l'utilisateur en est `owner`.
2. Device flow : un code émis, confirmé dans le navigateur, produit un jeton bearer qui passe `GET /me`.
3. `admin` refuse un utilisateur sans le rôle `platform_admin`.
Tests. `packages/api/src/__tests__/auth/` sur le harnais PGlite.

### PLT-03 — Elysia : socle, guards, erreurs, harnais de test
Lot 3 · dépend de PLT-02 · `packages/api`

Périmètre. `server.ts` (openapi, gestion d'erreurs `{ error: { code, message, fix } }`, codes stables, traduction fr/en des validations), `authPlugin`, `requireOrg`, `requireRole`, `requireServer` (jeton haché, `Server.status`), `requirePlatformAdmin`, `serializeData`, `client.ts` Eden, `testing/` (PGlite, `bootApiTestServer`, factories, `setTestSession`), skill `elysia-api-routes` mis à jour.
Critères d'acceptation. Un test d'intégration démarre l'API sur PGlite en moins de 3 secondes et appelle une route protégée avec une session de test.

### PLT-04 — Routes `me` et `devices`
Lot 3 · dépend de PLT-03 · `packages/api`

Périmètre. `GET /me`, `GET/POST/DELETE /me/devices`, `GET /me/servers` ; validation de la clé publique (ed25519 uniquement), empreinte calculée côté serveur, propagation aux serveurs ouvrables (mise à jour de l'état lu par les agents), audit.
Critères d'acceptation.
1. Une clé RSA est refusée avec `fix` : « générez une clé ed25519 ».
2. Ajouter un appareil rend `authorized_keys` de `/agent/state` cohérent pour chaque serveur assigné à l'utilisateur.
Tests. Intégration sur PGlite.

### PLT-05 — Enrôlement, jetons d'agent, `agent/state`, heartbeat
Lot 3 · dépend de PLT-04 · `packages/api`, `apps/web/src/workflows`

Périmètre. Migration `packages/db` qui ajoute `host`, `port` et `sshUser` à `Server` (PLT-04 a laissé ces champs nuls dans `ServerForUser`, faute de colonnes). `POST /servers/enroll` (quota de sièges, jeton d'enrôlement signé, une heure, brûlé à l'échange), `POST /agent/exchange`, `GET /agent/state` (droit d'usage, `valid_until`, clés autorisées, version cible, `module_params`), `POST /agent/heartbeat` (métriques 7 jours, `agentVersion`, `lastHeartbeatAt`), `GET /servers`, `GET /servers/:id`, `DELETE`, statuts `enrolling`, `active`, `grace`, `suspended`, `revoked`, Workflow `ExpireEnrollments`.
Critères d'acceptation.
1. Un jeton d'enrôlement s'échange une fois ; la seconde renvoie `enrollment_used`.
2. Un serveur sans heartbeat depuis 24 heures est marqué `stale` dans `GET /servers` sans changer son droit d'usage.
3. `DELETE /servers/:id` retire les clés de `/agent/state` immédiatement et programme `DecommissionServer` à sept jours.

### PLT-06 — Distribution des binaires signés
Lot 3 · dépend de PLT-05 · `packages/api`, R2

Périmètre. Table `Release`, `POST /admin/releases` (appelé par la CI de l'agent), `GET /agent/release/:version` et l'équivalent pour l'app (`GET /releases/agent/:version` avec bearer d'appareil), URL R2 signées de courte durée, canaux `stable` et `beta`, publication de la version cible dans `/agent/state`.
Critères d'acceptation. Sans jeton d'appareil ni de serveur, l'URL de release répond 401 ; la CI publie une version et elle devient cible en `beta` seulement.

### PLT-07 — Stripe Managed Payments
Lot 3 · dépend de PLT-05 · `packages/api`, `apps/web/src/workflows`

Périmètre. Produit « Serveur » en quantité, mensuel et annuel, euros et dollars ; `POST /orgs/:id/checkout` (Checkout Session, Managed Payments, quantité) ; `POST /orgs/:id/portal` ; `POST /webhooks/stripe` (signature, idempotence `StripeEvent`, miroir `Subscription`, `OrganizationBilling`) ; `GET /orgs/:id/subscription` ; quota de sièges = quantité ; impayé → `grace` 7 jours puis `suspended` ; Workflow `ReconcileSeats` quotidien ; mode test en staging.
Hors périmètre. Tout flux Elements ou personnalisé.
Critères d'acceptation.
1. Un checkout test de quantité 2 permet deux enrôlements et refuse le troisième avec `fix` vers le portail.
2. Un webhook rejoué n'a aucun effet.
3. `customer.subscription.deleted` passe les serveurs en `grace` avec la date de fin.
Tests. Fixtures d'événements Stripe signés en test.

### PLT-08 — Console : shell, connexion, serveurs, appareils
Lot 3 · dépend de PLT-05, INF-03 · `apps/web`

Périmètre. TanStack Start avec le plugin Cloudflare, `worker.ts` servant `/api/v1` directement, routes `auth/` (lien magique, GitHub, page du device flow qui affiche le code à confirmer), `dashboard/` shell (barre latérale, sélecteur d'organisation, thème), `dashboard/servers` (liste, statut par la forme, version, heartbeat, disque, RAM), `dashboard/servers.$id` (métriques 7 jours, appareils autorisés, événements, actions), `dashboard/devices`. Design de [DESIGN.md](../product/DESIGN.md) via `packages/design`, Base UI + shadcn, TanStack Query, `@/hooks/use-form`.
Critères d'acceptation.
1. Le device flow de bout en bout : code saisi, confirmation, l'app reçoit sa session.
2. Un serveur passe de `enrolling` à `active` dans la liste sans rechargement (polling 5 s).
Tests. Playwright : connexion, liste, fiche, révocation d'un appareil.

### PLT-16 — Harnais Playwright pour la console
Lot 3 · dépend de PLT-08 · `apps/web`

But. `apps/web` a le `test:e2e` que son guide annonce déjà.
Périmètre. `@playwright/test`, un dossier `e2e/`, et un scénario qui couvre la connexion par lien magique, le device flow et la liste des serveurs, contre une branche Neon éphémère ou le harnais PGlite servi en local. Étape CI non bloquante tant que le rendu n'est pas stable.
Hors périmètre. Les écrans, déjà livrés.
Critères d'acceptation.
1. `bun --cwd=apps/web run test:e2e` passe en local et échoue si une route de connexion casse.

### PLT-09 — Console : abonnement, téléchargements, profil
Lot 3 · dépend de PLT-07, PLT-08 · `apps/web`

Périmètre. `dashboard/billing` (quantité, statut, fin de période, bouton checkout ou portail), `download` (app pour les trois OS depuis `Release`, notes de version), `dashboard/settings` (profil, thème, suppression du compte).
Critères d'acceptation. Un nouvel utilisateur va de l'inscription à un serveur enrôlé en passant par le checkout test, sans quitter la console autrement que pour Stripe.

### PLT-11 — Emails transactionnels
Lot 3 · dépend de PLT-02 · `packages/api/src/emails`, Cloudflare Email

Périmètre. Lien magique, invitation, serveur enrôlé, serveur attribué, appareil ajouté, droit d'usage en tolérance, suspension, décommission dans sept jours. React Email, fr et en, thème monochrome, expéditeur `no-reply@pupitre.studio`.
Critères d'acceptation. Chaque email a une prévisualisation dans `bun run dev:email` et un test de rendu.

### PLT-14 — Déploiement Cloudflare Builds, staging et production
Lot 3 · dépend de PLT-08 · `apps/web`, dashboards

Périmètre. `wrangler.jsonc` avec `secrets.required`, `scripts/check-worker-secrets.ts`, deux environnements, migrations au build, domaines `staging-app.pupitre.studio` et `app.pupitre.studio`, page de statut minimale `/status` sur les heartbeats, observabilité Workers, Sentry.
Critères d'acceptation. Un push sur `main` déploie le staging ; un tag déploie la production ; un secret manquant refuse le déploiement avec son nom.

**Porte du lot 3** : un inconnu paie en mode test, télécharge, enrôle son VPS et travaille, sans écrire au propriétaire.

### PLT-15 — Workflows Cloudflare : déclencheurs des tâches longues
Lot 3 · dépend de PLT-05, PLT-08 · `apps/web`

But. Les fonctions de cycle de vie écrites par PLT-05 et PLT-07 ont un déclencheur.
Périmètre. `apps/web/src/workflows/` : `ExpireEnrollments` (horaire) qui appelle `expireEnrollments`, `DecommissionServer` (quotidien) qui appelle `decommissionDueServers`, `ReconcileSeats` (quotidien). Déclaration des Cron Triggers dans `wrangler.jsonc`, un secret partagé pour les invocations internes, et un test qui prouve que chaque workflow appelle bien sa fonction.
Hors périmètre. La logique elle-même, déjà livrée et testée dans `packages/api/src/lib/`.
Critères d'acceptation.
1. `wrangler dev` déclenche chaque cron en local et le journal montre l'appel.

## Lot 4 — Équipes

### PLT-10 — Organisations : membres, invitations, attribution, audit
Lot 4 · dépend de PLT-09 · `packages/api`, `apps/web`

Périmètre. `GET /orgs/:id/members`, `POST /orgs/:id/invitations`, `POST /servers/:id/assign` (utilisateur ou email inconnu → invitation avec attribution en attente), `unassign`, `revoke-device`, `GET /orgs/:id/events`, écrans `dashboard/members` et `dashboard/audit`, attribution depuis la fiche serveur, emails d'attribution.
Critères d'acceptation.
1. Attribuer un serveur à un email inconnu crée l'invitation ; à l'acceptation, le serveur est attribué et ses clés arrivent en moins d'une minute.
2. Retirer l'attribution retire les clés ; l'audit porte l'acteur.
3. Un `member` ne voit que ses serveurs ; un `admin` voit tout et attribue ; seul `owner` touche à la facturation.

## Lot 5 — Sécurité et fiabilité

### PLT-12 — Alertes et page de statut
Lot 5 · dépend de PLT-05 · `packages/api`, `apps/web`

Périmètre. Alertes email : serveur injoignable 30 minutes, disque au-dessus de 90 %, agent périmé de deux versions, droit d'usage en tolérance ; page `/status` publique.

### PLT-13 — Passkeys et MFA
Lot 5 · dépend de PLT-02 · `packages/auth`, `apps/web`

Périmètre. Plugins `passkey` et `twoFactor`, section sécurité du profil, codes de récupération.
Critères d'acceptation. Une passkey enregistrée connecte sans lien magique ; MFA activé exige le code au lien magique.

### Plus tard

SSO OIDC et SAML (plugin `sso`) quand une organisation le demande ; console de stock netcup pour l'offre hébergée après 100 serveurs payants ([0002](../decisions/0002-byo-server-first.md)).

### PLT-17 — Le workflow d'évaluation des alertes
Lot 5 · dépend de PLT-12, PLT-15 · `apps/web`

But. Les alertes livrées par PLT-12 sont réellement levées, sans qu'on les appelle à la main.
Périmètre. Un quatrième workflow `EvaluateAlerts`, toutes les cinq minutes, sur `evaluateAlerts()` — annoncé par `platform-api.md` (« Tâches longues ») mais absent du périmètre de PLT-15, qui a livré les trois autres. Même forme que les siens : entrée dans le registre, cron dans `wrangler.jsonc`, test sur le harnais PGlite qui prouve l'effet en base.
Hors périmètre. La logique d'alerte, livrée par PLT-12.
Critères d'acceptation.
1. Un serveur injoignable depuis trente minutes déclenche son alerte sans appel manuel, prouvé par un test.


### PLT-18 — Managed Payments : vendeur Stripe, un produit, deux prix
Lot 5 · dépend de PLT-07 · `packages/api`, `packages/shared`, `apps/web`, `apps/site`

But. Ce que PLT-07 a câblé est vendu par Stripe et non par nous, et la tarification cesse d'exister en deux devises.
Périmètre. `managed_payments[enabled]=true` sur chaque Checkout Session — sans lui, la vente se fait en notre nom et aucune taxe n'est collectée. Suppression de la devise déduite du pays (`cf-ipcountry`, `currencyForCountry`, `BillingCurrency`) : un seul prix par période, en dollars, Adaptive Pricing faisant la conversion. Deux variables au lieu de quatre, `STRIPE_PRICE_SERVER_MONTH` et `STRIPE_PRICE_SERVER_YEAR`, déclarées dans `turbo.json` et dans `secrets.required` de `wrangler.jsonc`, où aucune ne l'était. `monthlyPriceUsd`, `yearlyPriceUsd` et `formatUsd` dans `@pupitre/shared/plans`, seule source du prix affiché par le site et la console. Remplace le double prix euros/dollars de PLT-07.
Hors périmètre. Le portail client et la réconciliation des sièges, livrés par PLT-07.
Critères d'acceptation.
1. Un test sur le provider Stripe prouve que la session porte `managed_payments[enabled]=true`, le prix de l'intervalle demandé, et aucune devise.
2. Le site et la console n'affichent aucun montant en euros, et aucun littéral de prix hors de `@pupitre/shared/plans`.
Tests. Test unitaire du provider avec `fetch` doublé ; les tests de rendu du site sur les prix formatés.

### PLT-19 — Déclencheur planifié pour la fin de tolérance
Lot 3 · dépend de PLT-15 · `apps/web`

But. Un abonnement dont la tolérance expire est suspendu sans qu'on l'appelle à la main.
Périmètre. `suspendExpiredGrace` existe et est testée, mais aucun cron ne l'appelle : les quatre workflows livrés couvrent l'expiration des enrôlements, la décommission, la réconciliation des sièges et les alertes, pas celui-ci. Ajouter le cinquième, sur le patron exact des autres, avec son test sur le harnais PGlite.
Hors périmètre. La logique de tolérance, déjà livrée.
Critères d'acceptation.
1. Une tolérance expirée suspend les serveurs sans appel manuel, prouvé par un test qui passe par le workflow.

