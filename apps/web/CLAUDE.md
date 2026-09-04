# apps/web — Guidelines

La plateforme : console, API et authentification. Monorepo → [`../../CLAUDE.md`](../../CLAUDE.md) · plan → [`docs/plans/platform.md`](../../docs/plans/platform.md) · API → [`docs/contracts/platform-api.md`](../../docs/contracts/platform-api.md) · design → [`DESIGN.md`](../../docs/product/DESIGN.md).

> Le style est enforced par Ultracite (Biome). Ce fichier ne contient que ce que le linter ne dérive pas : choix d'architecture, primitives, règles.

## Stack imposée

TanStack Start (React 19) sur Cloudflare Workers via le plugin Vite · TS strict (`tsgo --noEmit`) · Elysia sur `/api/v1` + Eden Treaty (`@pupitre/api`) · Better Auth (`@pupitre/auth`) · Neon + Prisma 7 (`@pupitre/db`) · R2 pour les binaires · Cloudflare Email · Workflows pour les tâches longues · Stripe Managed Payments par Checkout et Payment Links uniquement.

**Ne pas dévier :**
- UI : Tailwind 4 sur `@pupitre/design` + Base UI + shadcn/ui. Prop `render`, jamais `asChild`. Jamais Radix.
- Forms : React Hook Form + Zod via `@/hooks/use-form`.
- State serveur : TanStack Query natif. State client : React.
- Icônes : Lucide uniquement.
- Paiement : Stripe Checkout et le portail client, rien d'autre.

**Banned** : `@radix-ui/*`, `axios`, `react-query`, `@tanstack/react-table`, `express`, `@polar-sh/*`, Stripe Elements, toute couleur en dur.

## Architecture

```
src/routes/      api/v1/$ · api/auth/$ · auth/ (sign-in, device, invitation) · dashboard/ · admin/ (platform_admin) · download
src/components/  ui/ (Base UI + shadcn, 1 composant/fichier) · dashboard/ · admin/ · auth/
src/lib/         api/ (client Eden) · auth/ · query/ · schemas/ (Zod) · domain/ · config/
src/workflows/   ReconcileSeats · DecommissionServer · ExpireEnrollments
src/worker.ts    sert /api/v1 directement, délègue le reste à Start
packages/api/    app Elysia, client Eden, harnais de test — skill `elysia-api-routes`
packages/auth/   createAuth, plugins, clients web et desktop
```

## Règles

- **La console n'a pas de logique métier.** Elle appelle l'API comme l'app desktop le fait. Une règle métier vit dans `packages/api/src/lib/`, jamais dans une route TanStack ni un composant.
- **Multi-tenancy** : `const { user, activeOrganization, role } = useDashboardContext()`. Permissions via `usePermission(slug)`, slugs de `@pupitre/shared/permissions`. Gardes API : `requireOrg`, `requireRole`, `requireServer`, `requirePlatformAdmin`.
- **Les webhooks sont la seule entrée de la facturation.** La console ne crée rien à la fin d'un checkout ; elle attend l'événement Stripe. Idempotence par `event.id`.
- **La plateforme ne connaît pas le contenu d'un serveur.** Aucune route ne reçoit de projet, de secret ou de fichier client. Une PR qui ajoute un tel champ est refusée.
- **Routes admin** : sous `/admin/**` et `{ detail: { hide: true } }` côté Elysia.
- **Fichiers** `{feature}-{context}-{type}.tsx`, un composant React par fichier hors `ui/`, pas de barrel files. Types inférés depuis Prisma et Eden, jamais redéclarés. Zod dans `src/lib/schemas/`.
- **Anti-patterns → primitive** : `useForm` direct → `@/hooks/use-form` · `useState` loading/error → `useRequestCycle` · bloc vide inline → `<EmptyState>` · titre de page inline → `<PageHeader>` · tableau avec query manuelle → `<AsyncDataTable>`.
- **Breadcrumb** : toute page sous `/dashboard/**` et `/admin/**` a une entrée dans `src/lib/domain/page-titles.ts` avec sa hiérarchie.
- **i18n** : fr et en dans la même passe, aucune chaîne utilisateur en dur.

## Tests

Intégration Elysia sur le harnais PGlite (`@pupitre/api/testing`) pour auth, guards, enrôlement, webhooks. Playwright dans `e2e/` pour connexion, device flow, serveurs, facturation en mode test. Assertions dans `it()`, pas de `.only` committé.

## Commandes

```bash
bun run dev
bun run build:cloudflare
bun run test
bun run test:e2e
bun run db:migrate
bun run openapi:export
```
