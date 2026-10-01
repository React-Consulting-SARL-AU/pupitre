# apps/web — Guidelines

The platform: console, API and authentication. Monorepo → [`../../CLAUDE.md`](../../CLAUDE.md) · API → [`docs/contracts/platform-api.md`](../../docs/contracts/platform-api.md) · design → [`DESIGN.md`](../../docs/product/DESIGN.md).

> Style is enforced by Ultracite (Biome). This file only contains what the linter does not derive: architecture choices, primitives, rules.

## Mandatory stack

TanStack Start (React 19) on Cloudflare Workers via the Vite plugin · strict TS (`tsgo --noEmit`) · Elysia on `/api/v1` + Eden Treaty (`@pupitre/api`) · Better Auth (`@pupitre/auth`) · Cloudflare D1 + Prisma 7 (`@pupitre/db`) · R2 for binaries · Cloudflare Email · Workflows for long tasks · Stripe Managed Payments through Checkout and Payment Links only, dormant as long as `BILLING_MODE=off`.

**Do not deviate:**
- UI: Tailwind 4 on `@pupitre/design` + Base UI + shadcn/ui. `render` prop, never `asChild`. Never Radix.
- Forms: React Hook Form + Zod via `@/hooks/use-form`.
- Server state: native TanStack Query. Client state: React.
- Icons: Lucide only.
- Licence: Pupitre is free up to `FREE_SERVERS` servers per organization; beyond that, a licence (live `Subscription`, `granted` or Stripe product) adds its seats. The console says "licence", never "subscription", "plan" or "trial". Today only the platform admin grants a licence; the Stripe code — Checkout, portal, `POST /orgs/:id/seats` — stays in place but only serves under `BILLING_MODE=stripe`, and nothing else would pay.

**Banned**: `@radix-ui/*`, `axios`, `react-query`, `@tanstack/react-table`, `express`, `@polar-sh/*`, Stripe Elements, any hard-coded colour.

## Architecture

```
src/routes/      api/auth/$ · auth/ (sign-in, consent, device, invitation) · dashboard/ · dashboard/admin/ (members of the platform organization) · download
src/components/  ui/ (Base UI + shadcn, 1 component/file) · dashboard/ · admin/ (platform pages, admin/inbox/ for mail) · auth/
src/lib/         api/ (Eden client) · auth/ · query/ · schemas/ (Zod) · domain/ · config/
src/workflows/   steps of ReconcileSeats · DecommissionServer · ExpireEnrollments · EvaluateAlerts · SuspendExpiredGrace · PurgeDeletions, cron triggers, internal trigger
src/worker.ts    serves /api/v1, /internal/email and /internal/workflows, receives Email Routing mail, carries the Workflow classes, the Durable Objects (InboxRealtime, RateLimit) and the cron handler, delegates the rest to Start
packages/api/    Elysia app, Eden client, test harness — `elysia-api-routes` skill
packages/auth/   createAuth, plugins, web and desktop clients
```

## Rules

- **The console has no business logic.** It calls the API the way the desktop app does. A business rule lives in `packages/api/src/lib/`, never in a TanStack route or a component.
- **Multi-tenancy**: `const { user, activeOrganization, role } = useDashboardContext()`. Permissions via `usePermission(slug)`, slugs from `@pupitre/shared/permissions`. API guards: `requireOrg`, `requireRole`, `requireServer`, `requirePlatformAdmin`.
- **Webhooks are the only entry of Stripe billing.** The console creates nothing at the end of a checkout; it waits for the Stripe event. Idempotence by `event.id`. Under `BILLING_MODE=off` — production —, nothing calls Stripe: checkout and portal are refused, and a licence beyond the free servers only comes from an admin grant (`granted`).
- **The platform does not know the content of a server.** No route receives a project, a secret or a customer file. A PR that adds such a field is refused.
- **Admin routes**: under `/admin/**` and `{ detail: { hide: true } }` on the Elysia side.
- **Files** `{feature}-{context}-{type}.tsx`, one React component per file outside `ui/`, no barrel files. Types inferred from Prisma and Eden, never redeclared. Zod in `src/lib/schemas/`.
- **Anti-patterns → primitive**: direct `useForm` → `@/hooks/use-form` · loading/error `useState` → `useRequestCycle` · inline empty block → `<EmptyState>` · inline page title → `<PageHeader>` · table with a manual query → `<AsyncDataTable>` · hand-written confirmation dialog → `<ConfirmFormDialog>` · hand-written tabs → `<PageTabs>` · irreversible action dropped into any card → `<DangerZone>` · buttons stacked at the end of a row → `<RowActionsMenu>` · filter in a `useState` lost on reload → `useListSearch(Route)`.
- **What each primitive does** (`components/ui/`, `lib/domain/list-search.ts`): `<AsyncDataTable>` renders a list from the state of a `useQuery` — columns, skeleton, refusal with retry, empty list, debounced search, filters, sort, pagination, selection, clickable row; `<ConfirmFormDialog>` asks for a reason, a keyword to retype and a deadline, and stays open with the input when the server refuses; `<PageTabs>` carries the current tab in the address; `<DangerZone>` frames the action that cannot be taken back; `<RowActionsMenu>` puts a row's actions behind an icon button; `useListSearch(Route)` keeps `q`, `offset`, `sort`, `direction` and the named filters in the address, omitting default values.
- **Breadcrumb**: every page under `/dashboard/**` and `/admin/**` has an entry in `src/lib/domain/page-titles.ts` with its hierarchy.
- **i18n**: fr and en in the same pass, no hard-coded user string. Sentences live in `src/lib/i18n/strings/<domain>.ts` (`{ en, fr }`), merged into `en.ts` and `fr.ts`; a component reads `useTranslations()`, a module outside React receives the `Translate` as an argument, and a domain module returns a **key** (`DictionaryKey`), never a sentence. The language comes from the `pupitre_locale` cookie, read at server render by `readLocale()` and set in the root route's context; without a cookie, the browser's `Accept-Language` decides. Two tests guard the rule: parity of keys and parameters between languages, and no French sentence outside the dictionary.
- **Theme, language and legal pages are everywhere**, including on authentication. Outside the console, the global footer of the root route carries them; under `/dashboard/**`, it is the account menu at the bottom of the sidebar, and the footer disappears (`sidebarCarriesChrome`).

## Tests

Elysia integration on the SQLite harness (`@pupitre/api/testing`, the same migrations as D1) for auth, guards, enrolment, webhooks. Playwright in `e2e/` for sign-in, device flow, servers, billing in test mode. Assertions in `it()`, no committed `.only`.

`test:e2e` serves everything from a single local origin: `e2e/harness/server.ts` answers `/api/v1` and `/api/auth` calls from the SQLite harness and proxies the rest to the Vite server. No database and no remote service. The origin is `localhost:3000`; when another development server holds that port, `PUPITRE_E2E_PORT=3300 bun run test:e2e` moves the harness and Vite (port + 100) together.

## Commands

```bash
bun run dev
bun run build:cloudflare
bun run test
bun run test:e2e
```

From the root, `bun run db:migrate local` applies the migrations to the D1 that miniflare keeps under `.wrangler/state`. The OpenAPI document is read at `/api/v1/openapi/json`, served by the API itself.
