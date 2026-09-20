# apps/web — Guidelines

La plateforme : console, API et authentification. Monorepo → [`../../CLAUDE.md`](../../CLAUDE.md) · API → [`docs/contracts/platform-api.md`](../../docs/contracts/platform-api.md) · design → [`DESIGN.md`](../../docs/product/DESIGN.md).

> Le style est enforced par Ultracite (Biome). Ce fichier ne contient que ce que le linter ne dérive pas : choix d'architecture, primitives, règles.

## Stack imposée

TanStack Start (React 19) sur Cloudflare Workers via le plugin Vite · TS strict (`tsgo --noEmit`) · Elysia sur `/api/v1` + Eden Treaty (`@pupitre/api`) · Better Auth (`@pupitre/auth`) · Cloudflare D1 + Prisma 7 (`@pupitre/db`) · R2 pour les binaires · Cloudflare Email · Workflows pour les tâches longues · Stripe Managed Payments par Checkout et Payment Links uniquement.

**Ne pas dévier :**
- UI : Tailwind 4 sur `@pupitre/design` + Base UI + shadcn/ui. Prop `render`, jamais `asChild`. Jamais Radix.
- Forms : React Hook Form + Zod via `@/hooks/use-form`.
- State serveur : TanStack Query natif. State client : React.
- Icônes : Lucide uniquement.
- Paiement : Stripe Checkout et le portail client, rien d'autre. La quantité de sièges est la seule chose que la console change elle-même, par `POST /orgs/:id/seats` ; le portail ne la touche pas.

**Banned** : `@radix-ui/*`, `axios`, `react-query`, `@tanstack/react-table`, `express`, `@polar-sh/*`, Stripe Elements, toute couleur en dur.

## Architecture

```
src/routes/      api/v1/$ · api/auth/$ · auth/ (sign-in, device, invitation) · dashboard/ · dashboard/admin/ (membres de l'organisation plateforme) · download
src/components/  ui/ (Base UI + shadcn, 1 composant/fichier) · dashboard/ · admin/ (pages plateforme, admin/inbox/ pour les mails) · auth/
src/lib/         api/ (client Eden) · auth/ · query/ · schemas/ (Zod) · domain/ · config/
src/workflows/   étapes de ReconcileSeats · DecommissionServer · ExpireEnrollments · EvaluateAlerts · SuspendExpiredGrace, cron triggers, déclencheur interne
src/worker.ts    sert /api/v1 et /internal/workflows, porte les classes Workflow et le handler cron, délègue le reste à Start
packages/api/    app Elysia, client Eden, harnais de test — skill `elysia-api-routes`
packages/auth/   createAuth, plugins, clients web et desktop
```

## Règles

- **La console n'a pas de logique métier.** Elle appelle l'API comme l'app desktop le fait. Une règle métier vit dans `packages/api/src/lib/`, jamais dans une route TanStack ni un composant.
- **Multi-tenancy** : `const { user, activeOrganization, role } = useDashboardContext()`. Permissions via `usePermission(slug)`, slugs de `@pupitre/shared/permissions`. Gardes API : `requireOrg`, `requireRole`, `requireServer`, `requirePlatformAdmin`.
- **Les webhooks sont la seule entrée de la facturation Stripe.** La console ne crée rien à la fin d'un checkout ; elle attend l'événement Stripe. Idempotence par `event.id`. En `BILLING_MODE=launch`, il n'y a pas de Stripe : `POST /orgs/:id/checkout` accorde lui-même l'abonnement de lancement (`packages/api/src/lib/billing/launch.ts`), et c'est la seule exception.
- **La plateforme ne connaît pas le contenu d'un serveur.** Aucune route ne reçoit de projet, de secret ou de fichier client. Une PR qui ajoute un tel champ est refusée.
- **Routes admin** : sous `/admin/**` et `{ detail: { hide: true } }` côté Elysia.
- **Fichiers** `{feature}-{context}-{type}.tsx`, un composant React par fichier hors `ui/`, pas de barrel files. Types inférés depuis Prisma et Eden, jamais redéclarés. Zod dans `src/lib/schemas/`.
- **Anti-patterns → primitive** : `useForm` direct → `@/hooks/use-form` · `useState` loading/error → `useRequestCycle` · bloc vide inline → `<EmptyState>` · titre de page inline → `<PageHeader>` · tableau avec query manuelle → `<AsyncDataTable>` · dialogue de confirmation écrit à la main → `<ConfirmFormDialog>` · onglets écrits à la main → `<PageTabs>` · geste irréversible posé dans une carte quelconque → `<DangerZone>` · boutons empilés en fin de ligne → `<RowActionsMenu>` · filtre en `useState` perdu au rechargement → `useListSearch(Route)`.
- **Ce que chaque primitive fait** (`components/ui/`, `lib/domain/list-search.ts`) : `<AsyncDataTable>` rend une liste à partir de l'état d'un `useQuery` — colonnes, squelette, refus avec réessai, liste vide, recherche débouncée, filtres, tri, pagination, sélection, ligne cliquable ; `<ConfirmFormDialog>` demande une raison, un mot-clé à retaper et une échéance, et reste ouvert avec la saisie quand le serveur refuse ; `<PageTabs>` porte l'onglet courant dans l'adresse ; `<DangerZone>` encadre le geste qui ne se reprend pas ; `<RowActionsMenu>` met les gestes d'une ligne derrière un bouton à icône ; `useListSearch(Route)` tient `q`, `offset`, `sort`, `direction` et les filtres nommés dans l'adresse, en omettant les valeurs par défaut.
- **Breadcrumb** : toute page sous `/dashboard/**` et `/admin/**` a une entrée dans `src/lib/domain/page-titles.ts` avec sa hiérarchie.
- **i18n** : fr et en dans la même passe, aucune chaîne utilisateur en dur. Les phrases vivent dans `src/lib/i18n/strings/<domaine>.ts` (`{ en, fr }`), fusionnées dans `en.ts` et `fr.ts` ; un composant lit `useTranslations()`, un module hors React reçoit le `Translate` en argument, et un module de domaine rend une **clé** (`DictionaryKey`), jamais une phrase. La langue vient du cookie `pupitre_locale`, lue au rendu serveur par `readLocale()` et posée dans le contexte de la route racine ; sans cookie, l'`Accept-Language` du navigateur tranche. Deux tests gardent la règle : parité des clés et des paramètres entre les langues, et aucune phrase française hors du dictionnaire.
- **Thème, langue et pages légales sont partout**, y compris sur l'authentification. Hors de la console, c'est le pied de page global de la route racine qui les porte ; sous `/dashboard/**`, c'est le menu de compte en bas de la barre latérale, et le pied de page s'efface (`sidebarCarriesChrome`).

## Tests

Intégration Elysia sur le harnais SQLite (`@pupitre/api/testing`, les mêmes migrations que D1) pour auth, guards, enrôlement, webhooks. Playwright dans `e2e/` pour connexion, device flow, serveurs, facturation en mode test. Assertions dans `it()`, pas de `.only` committé.

`test:e2e` sert tout depuis une seule origine locale : `e2e/harness/server.ts` répond aux appels `/api/v1` et `/api/auth` depuis le harnais SQLite et proxie le reste vers le serveur Vite. Aucune base ni aucun service distant. L'origine est `localhost:3000` ; quand un autre serveur de développement tient ce port, `PUPITRE_E2E_PORT=3300 bun run test:e2e` déplace le harnais et Vite (port + 100) ensemble.

## Commandes

```bash
bun run dev
bun run build:cloudflare
bun run test
bun run test:e2e
bun run db:migrate local
bun run openapi:export
```
