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

### PLT-20 — Le client de base de données ne survit pas à une requête
Lot 5 · dépend de PLT-08 · `packages/auth`, `packages/api`, `packages/db`

But. Une requête authentifiée aboutit à chaque fois, pas une sur quatre.

Le constat. Sur `bun run dev`, trois requêtes authentifiées sur quatre se figent et le runtime rend « your Worker's code had hung and would never generate a response ». Le journal donne la cause exacte : « A promise was resolved or rejected from a different request context than the one it was created in ». `getAuth` et `getPrisma` gardent chacun un `PrismaClient` sur l'adaptateur Neon **au niveau du module** ; sa connexion appartient au contexte d'entrée-sortie de la première requête, et un Worker interdit d'en changer. C'est aussi pourquoi `/status` annonce la base « down » alors que `/servers` répond.

Périmètre. Choisir entre un client par requête et le pilote Neon en HTTP, qui est sans état et se partage sans danger. Mesurer avant et après sur une série de requêtes, pas sur une seule. Vérifier que le harnais PGlite des tests n'est pas affecté.

Mesure faite. Sans cache de client, le taux passe de 2 sur 8 à 4 sur 8 : la piste est la bonne mais elle ne suffit pas seule, une autre ressource partagée subsiste.

Hors périmètre. Le comportement en production, non observé — le constat vient de miniflare en local. Le partage d'un client au niveau du module reste un contre-emploi connu du runtime.

Critères d'acceptation.
1. Vingt requêtes authentifiées consécutives aboutissent toutes.
2. `/status` rend la base « ok » quand elle répond.

### PLT-21 — Sans abonnement, aucun droit d'usage
Lot 3 · dépend de INF-22 · `packages/api`

But. L'accès au produit suppose un abonnement en cours, fût-il en essai.
Périmètre. `entitlementForOrganization` rend aujourd'hui `valid` lorsqu'aucun abonnement n'existe, et la fenêtre de validité se renouvelle à chaque lecture : une organisation qui ne passe jamais par le paiement garde l'accès sans limite de temps. L'absence d'abonnement rend désormais `{ state: "suspended", valid_until: now }`. Dans `seats.ts`, `seatQuotaFor` rend `{ quota: 0, source: "none" }` sans abonnement payant et `SeatQuotaSource` devient `"subscription" | "none"`. Un `requireEntitlement` s'ajoute aux guards de `packages/api/src/lib/api/plugins/guards.ts`, composé après `requireOrg` : il refuse en 403 `entitlement_required`, ou `server_suspended` quand l'organisation est explicitement suspendue, avec un `fix` qui renvoie vers `/dashboard/billing` ; il garde `POST /servers/enroll` et les routes d'attribution de `servers/assign.ts`. Dans `servers/enrollment.ts`, le droit d'usage se vérifie avant le quota, pour qu'une organisation sans abonnement lise « démarre ton essai » et non « tes zéro sièges sont pris » ; le `fix` de `SeatQuotaReachedError` perd sa branche `source === "development"`.
Hors périmètre. L'essai lui-même, tenu par Stripe et ouvert par PLT-25. La console et l'app, qui suivent.
Critères d'acceptation.
1. Une organisation sans aucun abonnement : `GET /me` rend `entitlement: "suspended"` et `POST /servers/enroll` rend 403 `entitlement_required`.
2. Une organisation en `trialing` enrôle jusqu'à `subscription.quantity` serveurs, et le serveur suivant est refusé.
3. Un essai qui se termine sans carte, donc `canceled`, coupe l'accès : les serveurs passent en `grace` puis `suspended`, et `GET /agent/state` le dit.
4. Les codes `entitlement_required` et `server_suspended` de `packages/shared/src/api/errors.ts`, jusqu'ici émis par aucune route, le sont.
Tests. `packages/api/src/__tests__/api/billing.test.ts`, dont le cas « aucun abonnement » change de verdict, et `__tests__/api/servers.test.ts`, sur le harnais PGlite.

### PLT-22 — La console prend les arrondis du système
Lot S · dépend de MKT-13 · `apps/web`

But. La console suit le tour de vis d'arrondi qui a rendu le site accueillant, sans rien changer à sa densité.
Périmètre. Les rayons viennent des tokens, donc `sm` 6→8, `md` 10→12 et `lg` 14→18 s'appliquent seuls. Restent les choix par primitive : boutons et entrées de menu en pastille, carte et popover en `lg`, champs et encarts en `md`. Le menu de thème existait déjà — icône, menu, coche — et ne bouge pas.
Hors périmètre. La densité, la typographie, la mise en page des écrans.
Critères d'acceptation.
1. Aucun rayon écrit à la main : tout passe par une classe adossée aux tokens.
2. Les tests de la console et le parcours Playwright restent verts.


### PLT-25 — De l'inscription à l'essai, en une action
Lot 3 · dépend de PLT-21 · `apps/web`

But. Un compte fraîchement créé n'a qu'une action possible : démarrer son essai de quatorze jours.
Périmètre. Aujourd'hui `/` et `/dashboard` redirigent vers `/dashboard/servers`, dont l'état vide dit « Enrôlez un VPS depuis l'app Pupitre » sans lien ni bouton, et le checkout ne se trouve qu'en fouillant `/dashboard/billing`. Le `beforeLoad` de `apps/web/src/routes/dashboard.tsx` lit `entitlement` depuis `GET /me` et redirige vers `/dashboard/start` tant qu'il vaut `suspended`, en laissant passer `/dashboard/billing`, `/dashboard/start` et le profil. Une route `dashboard/start.tsx` porte l'étape : ce que l'essai donne, qu'aucune carte n'est demandée, et une seule action qui appelle `POST /orgs/:id/checkout` avec `quantity: 1` et l'intervalle par défaut de l'organisation, puis part sur Stripe. `CheckoutForm` sert en variante simplifiée plutôt qu'un second composant. Au retour `?checkout=done`, la page interroge `GET /orgs/:id/subscription` par `useRequestCycle` jusqu'à ce que le webhook ait atterri, puis mène au téléchargement : la console ne crée rien, les webhooks restent la seule entrée de la facturation. Un membre qui n'a pas `billing:manage` lit un état vide qui nomme le propriétaire. Dans `components/dashboard/billing-panel.tsx`, le repli du quota gratuit sur `paid` a disparu avec PLT-21, et l'essai est enfin nommé dans la console : jours restants, et ce qui arrive à la fin sans carte.
Hors périmètre. Le téléchargement et la liaison de l'app, livrés par PLT-24. La création d'abonnement hors Checkout, que la décision 0007 interdit.
Critères d'acceptation.
1. Un compte neuf atterrit sur `/dashboard/start` et aucune autre route du tableau de bord ne s'ouvre, sauf la facturation et le profil.
2. Le checkout de test aboutit à un abonnement `trialing`, `GET /me` rend alors `entitlement: "valid"`, et `/dashboard/servers` s'ouvre.
3. Un membre sans `billing:manage` lit qui doit démarrer l'essai, et n'a aucun bouton de checkout.
4. Les pages existent en français et en anglais dans la même passe.
Tests. `apps/web/e2e` : inscription, `/dashboard/start`, checkout falsifié par `packages/api/src/lib/billing/fake.ts`, puis `/dashboard/servers` atteignable.

### PLT-24 — La console fait télécharger, puis lier
Lot 3 · dépend de PLT-25 · `apps/web`

But. Les étapes qui suivent l'essai — télécharger l'app, la lier au compte — se lisent dans la console.
Périmètre. `apps/web/src/routes/download.tsx` devient l'étape qui suit le checkout : `DownloadPanel` garde sa source, `GET /releases/app/latest`, et gagne un en-tête de parcours puis, sous les trois systèmes, la marche à suivre pour lier l'app — ouvrir Pupitre, l'écran de connexion, le code affiché, `/auth/device`. L'état vide de `components/dashboard/server-list.tsx` gagne un bouton « Télécharger l'app » vers `/download`. Dans `components/dashboard/dashboard-sidebar.tsx`, « Télécharger l'app » sort d'`ACCOUNT_LINKS` pour devenir une entrée de premier plan tant qu'aucun serveur n'est enrôlé. `apps/web/src/routes/auth/device.tsx` ne change pas de mécanique ; sa copie rappelle qu'on lie l'app à son compte.
Hors périmètre. Le device flow, livré par PLT-04 et APP-14. La publication des releases, livrée par INF-12.
Critères d'acceptation.
1. Un compte dont l'essai est en cours et qui n'a aucun serveur voit, dans cet ordre : télécharger, lier, enrôler.
2. Sans release publiée, la page le dit et n'affiche aucun lien mort.
3. Français et anglais dans la même passe.
Tests. `apps/web/e2e`, en suite du parcours de PLT-25.

### PLT-23 — La console parle deux langues, et porte ses réglages partout
Lot S · dépend de PLT-09 · `apps/web`

But. Le thème, la langue et les pages légales manquaient aux écrans d'authentification, et la console n'existait qu'en français malgré la règle du workspace.

Périmètre.
- **Un pied de page global**, monté dans la route racine, donc présent sur la connexion, le device flow, l'invitation, le second facteur, le tableau de bord, le téléchargement et la page de statut : thème en menu d'icône, langue, et les cinq pages légales du site plus le statut. Le sélecteur de thème quitte la barre latérale — un seul contrôle, partout.
- **Un i18n complet** : `src/lib/i18n` sur le modèle de l'app desktop — un fichier de chaînes par domaine, `translator(locale)` avec paramètres et pluriels, `useTranslations()` dans les composants. Les modules de domaine (`server-status`, `alerts`, `billing`, `audit`, `roles`, `downloads`, `page-titles`) rendent désormais des clés ; les formateurs et les schémas Zod prennent le traducteur en argument.
- **La langue est celle du lecteur** : cookie `pupitre_locale` lu au rendu serveur par `createIsomorphicFn`, donc la page arrive déjà traduite et l'hydratation ne la retourne pas. Sans cookie, l'`Accept-Language` tranche. Connecté, changer la langue met aussi à jour celle du compte, qui gouverne les emails.
- **Un état de thème partagé** : `useTheme` passe à `useSyncExternalStore`, si bien que le pied de page et la carte des préférences ne se contredisent plus.

Critères d'acceptation.
1. Toutes les pages, authentification comprise, portent le thème, la langue et les liens légaux.
2. Le dictionnaire porte les mêmes clés et les mêmes paramètres dans les deux langues ; test.
3. Aucune phrase française hors du dictionnaire dans `src/` ; test.
4. Le bundle client ne contient aucun module serveur ; le parcours Playwright reste vert.

Reste à faire. Une relecture de la traduction anglaise par un humain : elle est écrite, pas relue.

### PLT-26 — Un ré-enrôlement répare, il ne duplique pas
Lot 3 · dépend de INF-23, APP-29 · `packages/api`

But. Réparer un serveur ne consomme pas un second siège et ne crée pas une seconde ligne.

Périmètre. `enrollServer` de `packages/api/src/lib/servers/enrollment.ts` fait toujours `prisma.server.create`, et vérifie le quota avant. INF-23 et APP-29 ont pourtant ouvert un chemin de réparation : un serveur restreint se ré-enrôle depuis l'app. Aujourd'hui ce geste enregistre **une seconde ligne pour le même hôte** et consomme un siège de plus ; et sur un quota plein il rend `seat_quota_reached` au lieu de réparer — c'est-à-dire qu'il échoue exactement là où il servirait. Rendre `POST /servers/enroll` idempotent sur le triplet `(organisation, hôte, appareil)` : un enrôlement qui retrouve un serveur existant le met à jour et lui rend un jeton frais, sans toucher au quota ni créer de ligne. Un enrôlement pour un hôte inconnu garde le comportement actuel, quota compris. Les formes de requête et de réponse ne changent pas : c'est une correction d'implémentation, pas un changement de contrat.

Hors périmètre. Le mode restreint et l'action de l'app, livrés par INF-23 et APP-29.

Critères d'acceptation.
1. Deux enrôlements successifs du même hôte, par le même appareil et la même organisation, laissent **une seule** ligne de serveur et **un seul** siège consommé.
2. Le second enrôlement rend un jeton valide et réactive un serveur suspendu ou en sursis.
3. Sur un quota plein, ré-enrôler un serveur **déjà connu** réussit ; enrôler un hôte inconnu est toujours refusé par `seat_quota_reached`.
4. Un enrôlement du même hôte par une **autre** organisation n'est pas confondu avec une réparation.
Tests. `packages/api/src/__tests__/api/servers.test.ts` sur le harnais PGlite.

### PLT-27 — Deux enrôlements simultanés ne font qu'un serveur
Lot 3 · dépend de PLT-26 · `packages/db`, `packages/api`

But. La réparation d'un serveur est idempotente jusque sous une course.

Périmètre. PLT-26 a rendu `POST /servers/enroll` idempotent en lisant puis en écrivant, ce qui ferme le cas courant mais laisse la course ouverte : **deux enrôlements simultanés du même hôte inconnu créent encore deux lignes et consomment deux sièges**. Rien dans `packages/api` ne peut le fermer ; l'outil juste est une contrainte d'unicité, donc une migration. La contrainte voulue est partielle — `UNIQUE (organizationId, host, port, deviceId)` restreinte aux serveurs qui consomment un siège — parce qu'une ligne `revoked` doit garder son quadruplet sans interdire de ré-enrôler l'hôte après une décommission.

Deux voies, à trancher dans la tâche. Un index partiel en SQL brut est juste sémantiquement, mais Prisma ne sait pas exprimer un `WHERE` sur `@@unique` : l'index n'apparaîtrait pas dans le schéma et `migrate` le verrait comme une dérive à chaque diff. Une colonne discriminante — `enrollmentKey String? @unique` portant le quadruplet, mise à `null` à la révocation, Postgres tolérant plusieurs `NULL` — est exprimable en Prisma, au prix de l'écrire à l'enrôlement et de l'effacer à la révocation **et** dans `DecommissionServer`. Un `@@unique` simple sans discriminant est le mauvais choix : la ligne révoquée garderait le quadruplet et interdirait de ré-enrôler l'hôte.

Hors périmètre. L'idempotence de lecture-écriture, livrée par PLT-26.

Critères d'acceptation.
1. Deux enrôlements concurrents du même hôte inconnu, par le même appareil et la même organisation, laissent **une seule** ligne et **un seul** siège ; le perdant répare au lieu de créer, ou échoue proprement avec un code que l'app sait rejouer.
2. Ré-enrôler un hôte après une décommission complète réussit et crée une ligne neuve.
3. `bun run db:migrate` et un diff Prisma à blanc ne signalent aucune dérive après la migration.
Tests. `packages/api/src/__tests__/api/servers.test.ts`, dont un cas qui lance les deux enrôlements en parallèle.

### PLT-28 — La connexion n'offre que les fournisseurs configurés
Lot S · dépend de PLT-23 · `packages/api`, `apps/web`

But. Un bouton de connexion sociale qui ne peut pas marcher n'est pas affiché.

Périmètre. `sign-in-form.tsx` rend « Continuer avec Google » et « Continuer avec GitHub » sans condition, alors que `socialProviders` de `packages/auth/src/server.ts` n'ajoute un fournisseur que si ses **deux** variables sont présentes. Cliquer un fournisseur non configuré rend aujourd'hui `404 PROVIDER_NOT_FOUND` — vérifié. Rien côté client ne sait lesquels existent, et rien ne peut le savoir : la configuration est serveur. Faire dire à la plateforme quels fournisseurs sont montés — un champ sur une route publique déjà existante plutôt qu'une route de plus — et n'afficher que ceux-là. Quand aucun n'est monté, le séparateur « ou » et le bloc social disparaissent au lieu de laisser un titre orphelin. Le lien magique et la clé d'accès ne dépendent d'aucune configuration et ne bougent pas.

Hors périmètre. La configuration elle-même, qui vit dans l'environnement.

Critères d'acceptation.
1. Sans `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, le bouton Google n'est pas rendu ; avec les deux, il l'est.
2. Un fournisseur à moitié configuré — l'identifiant sans le secret — est traité comme absent, comme le serveur le fait déjà.
3. Aucun fournisseur monté : la page n'affiche ni séparateur, ni bloc social, et le lien magique reste au centre.
4. Les deux langues dans la même passe.
Tests. Un test de rendu de `sign-in-form`, et un test d'API sur le champ.

