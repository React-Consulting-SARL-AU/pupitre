---
name: elysia-api-routes
description: Write or modify an Elysia route of `/api/v1` in `packages/api/src/lib/api/routes` — flat router or folder, colocated `t` schemas, guards `authPlugin`, `requireAuth`, `requireOrg`, `requireRole`, `requireLicense`, `requireServer`, `requirePlatformAdmin`, `serializeData`, `withOrganization`, `{ error: { code, message, fix? } }` errors, registration in `routes/index.ts`, admin routes hidden by `hiddenRoutes`, integration test on the SQLite harness. Use whenever an API endpoint is added, moved or touched.
---

# Elysia routes — `/api/v1`

The API lives in `packages/api` and remains the single contract for the console (`apps/web`), the desktop app and the agent. It is consumed through Eden Treaty (`@pupitre/api/client`); its types come from the route code, so a badly typed route breaks all three consumers.

## Governed files

| File | Role |
| --- | --- |
| `packages/api/src/server.ts` | `createApi(routes)`, the `app` mounted on `/api/v1`: openapi, error handling, rate limiting, `handleApiRequest`, `configureApi({ prisma, auth })` |
| `packages/api/src/lib/api/routes/index.ts` | mounts `authPlugin` then each router; `hiddenRoutes(router)` for the admin group |
| `packages/api/src/lib/api/routes/<resource>.ts` | a router |
| `packages/api/src/lib/api/routes/<resource>-schemas.ts` | the colocated `t` schemas of that router |
| `packages/api/src/lib/api/plugins/auth.ts` | `authPlugin`, `resolveAuthContext`, `AuthContext` |
| `packages/api/src/lib/api/plugins/guards.ts` | `requireAuth`, `requireOrg`, `requireRole`, `requireLicense`, `requireServer`, `requirePlatformAdmin`, `hasPermission`, `ROLE_RANK` |
| `packages/api/src/lib/api/prisma.ts` | `getPrisma`, `configurePrisma`, `ApiPrisma`, `serializeData`, `withOrganization` |
| `packages/api/src/lib/api/errors.ts` | `apiError`, `createErrorRef` |
| `packages/api/src/lib/api/openapi-models.ts` | `errorResponse`, `withAuthErrors`, `dataResponse`, `paginatedResponse`, `dateTime` |
| `packages/api/src/lib/api/validation-errors.ts` | translation of `t` errors (called by `server.ts`) |
| `packages/api/src/lib/api/rate-limit.ts` | `createRateLimiter`, `GLOBAL_RATE_LIMIT` |
| `packages/api/src/lib/i18n/` | `resolveLocale(headers)`, `translate(locale, key, params)`, fr/en dictionary |
| `packages/api/src/lib/<domain>/` | the business logic: `me/`, `servers/`, then `devices/`, `billing/` (including `license.ts`), `releases/`, `audit/`, `emails/` |
| `packages/api/src/testing/` | SQLite harness: `bootApiTestServer`, `resetDb`, `request` (`apiRequest`, `authRequest`), `session` (`createUser`, `createSession`), `factories` (`createOrganizationWithMembers`, `createServer`) |
| `packages/api/src/__tests__/api/` | route integration tests |
| `packages/shared/src/api/errors.ts` | `API_ERROR_CODES`, the stable codes, `ApiErrorBodySchema` |
| `packages/shared/src/permissions/` | roles `owner`, `admin`, `member` and `<scope>:<action>` slugs |
| `docs/contracts/platform-api.md` | the contract: routes, bodies, responses, guards, model |

## State of the repository

The foundation exists: `GET /health`, `GET /me` (the guards, and the active organization's licence: `none` without an organization, otherwise `valid`, `grace` or `suspended`, through `licenseForOrganization` — free up to `FREE_SERVERS` servers, beyond that a live licence is needed), the guards (including `requireLicense`: an organization suspended by the team, or beyond its free servers without a licence, enrols and assigns nothing), `serializeData`, `withOrganization`, `apiError`, the openapi at `/api/v1/openapi` (document at `/api/v1/openapi/json`), the SQLite harness and the Eden client. This skill describes what is delivered; a pass that changes a name updates this skill at the same time.

## Rules

- **Contract first.** A route absent from `docs/contracts/platform-api.md` does not exist. A new need is flagged to the owner and the contract is amended first; a route is not added "in passing".
- **The router only wires**: HTTP → domain function in `src/lib/<domain>/` → `serializeData`. No Prisma call in a router. The domain reads the client through `getPrisma()` (`src/lib/api/prisma.ts`), never by instantiating it.
- **Error codes come from `@pupitre/shared/api/errors`.** A new code is declared there, never as a free string in a handler. `apiError` refuses an unknown code at compile time.
- **Error messages are translated**: a key in `src/lib/i18n/index.ts` (fr and en in the same pass), `translate(resolveLocale(request.headers), key)` in the handler. No hard-coded sentence.
- **The platform does not know the content of a server.** No route receives a project, a secret or a customer file. A PR that adds such a field is refused (`apps/web/CLAUDE.md`).
- **Stripe webhooks are the only entry of Stripe billing.** A route never creates a licence or a seat at the end of a checkout. One exception, outside Stripe (`PLATFORM_PRODUCTS` of `@pupitre/shared/plans`): the `granted` licence that the team grants from `/admin` (`lib/billing/admin.ts`). Under `BILLING_MODE=off` (production), checkout, portal, seats and webhook refuse with 409 `conflict` (`BillingOffError`, `assertBillingOn` of `lib/billing/runtime.ts`) and nothing calls Stripe. Nothing else writes `Subscription` outside the webhook, and a Stripe subscription only stops through the Stripe API (the provider's `cancelSubscription`), never through a row.
- **Inferred types**, never redeclared: Prisma for entities, `t` for inputs and outputs, Eden on the client side.
- **Relative imports** in `packages/api`: no `@/` alias. `@pupitre/api/lib/*` is forbidden outside the package (`scripts/assert-package-boundaries.ts`). The Prisma client is imported from `@pupitre/db/cloudflare/client` (`ApiPrisma`), never from `@pupitre/db/client` outside tests.
- Monorepo Biome style: double quotes, no semicolon, blank lines between blocks, no comment that repeats the code, no `export … from` (Biome `noBarrelFile`).

## Route structure

A flat router for most resources, a folder when the domain has several sub-routers:

```
routes/health.ts                  GET /health
routes/me.ts · me-schemas.ts      GET /me
routes/devices.ts                 the router
routes/device-schemas.ts          the colocated t schemas

routes/servers/
├── index.ts                      composes the sub-routers, carries prefix and tags
├── enroll.ts · assign.ts         sub-routers without their own prefix
└── schemas.ts                    the domain's shared schemas
```

A router carries a `name`, its `tags` and, if it needs one, its `prefix`; the sub-routers of a folder have neither prefix nor tags. A single-route router (`me`) writes the whole path rather than a prefix, so that the openapi lists `/api/v1/me` and not `/api/v1/me/`.

## Guards

Composition, never reimplementation. The guard is mounted **once**, right after `new Elysia(...)`. Each guard resolves the session itself through `resolveAuthContext(request)` (memoized per request), so it depends neither on mount order nor on `authPlugin`. Elysia deduplicates a named plugin mounted several times.

| Guard | What it injects | What it refuses | For |
| --- | --- | --- | --- |
| `authPlugin` | `user`, `session`, `organizationId`, `role`, `platformRole` (the role held in the Pupitre organization, `PLATFORM_ORGANIZATION_ID`), `isPlatformAdmin` (`platformRole !== null`), all nullable except the last | nothing: the anonymous passes with `user: null` | `routes/index.ts` mounts it first; a route with an optional session |
| `requireAuth` | same, `user` and `session` non-null | 401 `unauthenticated` | everything that talks to a human: `/me`, `/me/devices` |
| `requireOrg` | same, `organizationId` and `role` non-null (the role comes from the `member` table) | 401 `unauthenticated`; 403 `forbidden` with `fix` without an active organization; 403 `forbidden` if the user is no longer a member | `/servers`, `/orgs/:id/*` |
| `requireRole("admin")` | same as `requireOrg` | 403 `forbidden` if the role is below the one requested; `owner` > `admin` > `member` (`ROLE_RANK`) | `/servers/:id/assign`, `/orgs/:id/invitations`, billing as `owner` |
| `requireLicense` | same as `requireOrg` | 403 `license_required` when the organization exceeds its free servers without a live licence; 403 `server_suspended` when the team holds it suspended or closed; `fix` towards support in both cases | everything that presupposes a usable licence: `POST /servers/enroll`, the assignment routes |
| `requireServer` | `currentServer`: the `Server` whose `serverTokenHash` is the SHA-256 of the bearer, whatever its status except `revoked` | 401 `unauthenticated` without a bearer, unknown token, or `revoked` server (with `fix`) | `/agent/state`, `/agent/heartbeat`, `/agent/release/:version` |
| `requirePlatformAdmin` | `user`, `session` non-null, `platformRole` non-null: any member of the Pupitre organization | 401 `unauthenticated`; 403 `forbidden` (`platform_admin_required`) | **reading** under `/admin/**`: lists, sheets, inbox |
| `requirePlatformRole("admin")` | same, `platformRole` equal to `admin` or `owner` in the Pupitre organization | 403 `forbidden` (`platform_role_required`) for a plain `member` | **acting** under `/admin/**`: suspend, ban, create a link, answer a mail; an `/admin` router is split into a read instance and a write instance |
| `requirePublisher` | `actor`: `{ userId, source: "console" }` for an `admin`/`owner` session of the Pupitre organization, `PIPELINE_ACTOR` for the `PUPITRE_PUBLISH_TOKEN` token | 401 `publish_token_invalid`; 403 like `requirePlatformRole("admin")` | publishing and promoting a version |

`currentServer` and not `server`: Elysia reserves `server` in its context (the Bun instance). A `suspended` server passes `requireServer`: it is `/agent/state` that tells it `license: "suspended"` (and `entitlement`, the same, for agents from before 2.0.0). Server tokens are prefixed `pupitre_srv_` (`src/lib/servers/tokens.ts`: `generateServerToken`, `hashServerToken`, `isServerToken`); `authPlugin` does not look for a Better Auth session behind such a bearer.

`POST /agent/exchange` and `POST /webhooks/stripe` have no session guard: the first verifies the enrolment token, the second the Stripe signature, in their respective domains.

The console's fine-grained permissions (`usePermission(slug)`) are not guards: a handler that must distinguish more finely than the role calls `hasPermission(role, "servers:assign")` (re-exported by `guards.ts` from `@pupitre/shared/permissions`) and refuses with 403 `forbidden`.

## Errors

A single shape, the contract's: `{ error: { code, message, fix? } }`. `code` is an `ApiErrorCode`, `message` addresses the human in their language (`Accept-Language`, French by default), `fix` says the remedy when there is one and the app displays it as is.

```ts
const device = await findDevice(user.id, params.id)

if (!device) {
  set.status = 404
  return apiError("not_found", translate(locale, "device_not_found"))
}
```

A known domain error maps to a status; the rest bubbles up:

```ts
try {
  return { data: serializeData(await addDevice(user.id, body)) }
} catch (error) {
  if (error instanceof PublicKeyNotEd25519Error) {
    set.status = 422
    return apiError(
      "key_not_ed25519",
      translate(locale, "key_not_ed25519"),
      translate(locale, "key_not_ed25519_fix")
    )
  }

  throw error
}
```

`apiError` (`packages/api/src/lib/api/errors.ts`) builds the object and constrains `code` to the `ApiErrorCode` type; `errorResponse` (`openapi-models.ts`) is the matching `t` schema, to be declared in `response` for each error status; `withAuthErrors({ 200: … })` adds 401 and 403.

`server.ts` handles on its own, in the request's language: `t` validation (422 `validation`, message with the field's path, `fix` with the reason), an unreadable body (400 `validation`), an unknown route (404 `not_found`), an exception (500 `internal` with a logged reference, never the cause nor the stack), rate overflow (429 `rate_limited`, `retry-after`, 300 requests per minute and per `cf-connecting-ip` in memory).

## `serializeData` and `withOrganization`

Every value that comes from Prisma goes through `serializeData` before leaving: `Date` → ISO string, `BigInt` → string, `Decimal` → string, objects and arrays traversed, `null` kept. The `Serialized<T>` type follows the same rule, so a response schema declares dates as `dateTime` (`t.String({ format: "date-time" })`). A list leaves wrapped in `{ data }` (`dataResponse`, `paginatedResponse`), a single item too, because the contract says so.

A domain function that reads or writes an organization's tables (`Member`, `Invitation`, `Server`, `Subscription`, `OrganizationBilling`, `Event`) goes through `withOrganization(getPrisma(), organizationId)`: every `where` receives `organizationId`, every `create` too, and a query that points at another organization throws `OrganizationScopeViolationError`. Tables without an `organizationId` column (`User`, `Device`, `Release`…) are not touched. Filters nested in `OR` or `AND` are not inspected: no `organizationId` goes in them.

## `t` validation

Elysia's `t` drives validation, OpenAPI and the Eden types. Bodies live in the colocated `*-schemas.ts` file; a response schema carries an `$id` to be reused in the OpenAPI.

```ts
{
  params: t.Object({ id: t.String() }),
  body: deviceInputBody,
  query: t.Object({ status: t.Optional(t.String()) }),
}
```

The contract's field names are in `snake_case` (`public_key`, `device_id`, `enrollment_token`, `active_organization`): the `t` schema takes them as they are, the domain function translates to the Prisma model.

## Registration

`routes/index.ts` mounts `authPlugin` first, then each router, then the hidden admin group:

```ts
import { type AnyElysia, Elysia } from "elysia"
import { authPlugin } from "../plugins/auth"
import { adminReleasesRoutes } from "./admin/releases"
import { devicesRoutes } from "./devices"
import { healthRoutes } from "./health"
import { meRoutes } from "./me"

export function hiddenRoutes<Routes extends AnyElysia>(routes: Routes) {
  return new Elysia().guard({ detail: { hide: true } }).use(routes)
}

const adminRoutes = hiddenRoutes(
  new Elysia({ name: "admin-routes", prefix: "/admin" }).use(adminReleasesRoutes)
)

export const routes = new Elysia({ name: "routes" })
  .use(authPlugin)
  .use(healthRoutes)
  .use(meRoutes)
  .use(devicesRoutes)
  .use(adminRoutes)
```

`server.ts` mounts `routes` through `createApi(routes)` under `/api/v1` with the openapi and error handling; `createApi` accepts another router, which serves the mechanism tests. The app is built with `aot: false`: Cloudflare Workers forbids `new Function`, on which Elysia's ahead-of-time compilation depends. In dynamic mode, an unreadable JSON body bubbles up as a `SyntaxError` and not as the `PARSE` code; `onError` handles both. The `/admin/**` routes remain reachable but never appear in the OpenAPI document: `hiddenRoutes` sets `{ detail: { hide: true } }` once on the group, and `requirePlatformAdmin` goes on each admin router.

## Complete example: `devices`

The contract (`platform-api.md`, "Me" section): `GET /me/devices` → `{ data: Device[] }`, `POST /me/devices` `{ name, public_key }` → `{ data: Device }`, `DELETE /me/devices/:id` → 204. The key is ed25519 only, the fingerprint is computed server-side, the key is pushed to the servers the user can open. All of this lives in the domain, not in the route.

`packages/api/src/lib/api/routes/device-schemas.ts`:

```ts
import { t } from "elysia"
import { dateTime } from "../openapi-models"

export const deviceSchema = t.Object(
  {
    id: t.String(),
    name: t.String(),
    fingerprint: t.String(),
    last_used_at: t.Nullable(dateTime),
    created_at: dateTime,
  },
  { $id: "Device" }
)

export const deviceInputBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 80 }),
  public_key: t.String({ minLength: 1 }),
})
```

`packages/api/src/lib/devices/devices.ts` exposes the domain, without HTTP:

```ts
export class PublicKeyNotEd25519Error extends Error {}

export function listDevices(userId: string): Promise<Device[]>
export function addDevice(userId: string, input: { name: string; public_key: string }): Promise<Device>
export function removeDevice(userId: string, deviceId: string): Promise<boolean>
```

`packages/api/src/lib/api/routes/devices.ts`:

```ts
import { Elysia, t } from "elysia"
import {
  addDevice,
  listDevices,
  PublicKeyNotEd25519Error,
  removeDevice,
} from "../../devices/devices"
import { resolveLocale, translate } from "../../i18n"
import { apiError } from "../errors"
import { dataResponse, errorResponse } from "../openapi-models"
import { requireAuth } from "../plugins/guards"
import { serializeData } from "../prisma"
import { deviceInputBody, deviceSchema } from "./device-schemas"

export const devicesRoutes = new Elysia({
  name: "devices-routes",
  prefix: "/me/devices",
  tags: ["Devices"],
})
  .use(requireAuth)
  .get(
    "/",
    async ({ user }) => ({ data: serializeData(await listDevices(user.id)) }),
    {
      detail: { summary: "The user's devices" },
      response: {
        200: t.Object({ data: t.Array(deviceSchema) }),
        401: errorResponse,
      },
    }
  )
  .post(
    "/",
    async ({ user, body, request, set }) => {
      try {
        const device = await addDevice(user.id, body)

        set.status = 201
        return { data: serializeData(device) }
      } catch (error) {
        if (error instanceof PublicKeyNotEd25519Error) {
          const locale = resolveLocale(request.headers)

          set.status = 422
          return apiError(
            "key_not_ed25519",
            translate(locale, "key_not_ed25519"),
            translate(locale, "key_not_ed25519_fix")
          )
        }

        throw error
      }
    },
    {
      body: deviceInputBody,
      detail: { summary: "Add a device" },
      response: {
        201: dataResponse(deviceSchema),
        401: errorResponse,
        422: errorResponse,
      },
    }
  )
  .delete(
    "/:id",
    async ({ user, params, request, set }) => {
      const removed = await removeDevice(user.id, params.id)

      if (!removed) {
        set.status = 404
        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "device_not_found")
        )
      }

      set.status = 204
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Remove a device" },
      response: {
        204: t.Void(),
        401: errorResponse,
        404: errorResponse,
      },
    }
  )
```

Then `.use(devicesRoutes)` in `routes/index.ts`, as above, and the keys `device_not_found`, `key_not_ed25519`, `key_not_ed25519_fix` in `src/lib/i18n/index.ts`.

## Integration test

The harness (`@pupitre/api/testing`) starts the same Elysia app on a SQLite built from D1's migrations, in a few dozen milliseconds (`boot.test.ts` measures it and requires less than three). Pattern: `bootApiTestServer` once per file, `resetDb` before each test, a user through `createUser`, a session through `createSession` (personal organization active by default, `activeOrganizationId: null` for a bare session), requests through `apiRequest(path, { method, body, session, bearer, headers, locale })`. An organization shared with its members and their sessions comes from `createOrganizationWithMembers({ roles })`, an enrolled server with its plain-text token from `createServer({ organizationId, status })`. Tests write the expected behaviour, before the code.

`packages/api/src/__tests__/api/devices.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "../../testing"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

const ED25519_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleOfEd25519PublicKey laptop"

describe("POST /me/devices", () => {
  let session: { token: string }

  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    const { user } = await createUser({ email: "jordan@test.local" })

    session = await createSession({ userId: user.id })
  })

  it("registers an ed25519 key and computes its fingerprint", async () => {
    const response = await apiRequest<{ data: { fingerprint: string } }>(
      "/me/devices",
      { body: { name: "MacBook", public_key: ED25519_KEY }, session }
    )

    expect(response.status).toBe(201)
    expect(response.json.data.fingerprint).toMatch(/^SHA256:/)
  })

  it("refuses an RSA key with a remedy", async () => {
    const response = await apiRequest<{ error: { code: string; fix: string } }>(
      "/me/devices",
      {
        body: { name: "Old PC", public_key: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABExample pc" },
        session,
      }
    )

    expect(response.status).toBe(422)
    expect(response.json.error.code).toBe("key_not_ed25519")
    expect(response.json.error.fix).toContain("ed25519")
  })

  it("refuses without a session", async () => {
    const response = await apiRequest("/me/devices")

    expect(response.status).toBe(401)
  })
})
```

A mechanism test (guard, error, openapi) builds its own app with `createApi(routes)` and calls it through `api.handle(new Request(...))`; `guards.test.ts` and `errors.test.ts` are the models. The Eden client is tested with `createApiClient(TEST_BASE_URL, { fetch: server.fetch, headers })` and `unwrap(...)`, which throws shared's `ApiError`.

`*.test.ts` files and `testing/**` have their own Biome rules (`biome.jsonc`, `overrides`): `useAwait` and `noVoid` disabled, types through `type` or `interface` at will.

## Before handing back

1. The route exists in `docs/contracts/platform-api.md`, with the same body and the same response.
2. The router contains neither Prisma nor business rule; the domain is in `src/lib/<domain>/` and reads `getPrisma()` or `withOrganization(...)`.
3. Every error code returned exists in `packages/shared/src/api/errors.ts`; every message has its fr and en key in `src/lib/i18n`; every `fix` says a remedy.
4. Every status returned is declared in `response`, and `errorResponse` covers the error statuses.
5. The router is mounted in `routes/index.ts`; an admin route is under `hiddenRoutes` and behind `requirePlatformAdmin`.
6. A SQLite integration test covers every expected behaviour, the no-session case, and the case of another user or another organization that does not see the resource.
7. `bun --cwd=packages/api run lint`, `check:types`, `test` green, then the same at the root.
