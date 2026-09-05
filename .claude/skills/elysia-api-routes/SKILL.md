---
name: elysia-api-routes
description: Écrire ou modifier une route Elysia de `/api/v1` dans `packages/api/src/lib/api/routes` — routeur plat ou dossier, schémas `t` colocalisés, guards `authPlugin`, `requireAuth`, `requireOrg`, `requireRole`, `requireEntitlement`, `requireServer`, `requirePlatformAdmin`, `serializeData`, `withOrganization`, erreurs `{ error: { code, message, fix? } }`, enregistrement dans `routes/index.ts`, routes admin cachées par `hiddenRoutes`, test d'intégration sur le harnais PGlite. À utiliser dès qu'une tâche `PLT` ajoute, déplace ou touche un endpoint de l'API.
---

# Routes Elysia — `/api/v1`

L'API vit dans `packages/api` et reste le contrat unique pour la console (`apps/web`), l'app desktop et l'agent. Elle est consommée par Eden Treaty (`@pupitre/api/client`) ; ses types partent du code des routes, donc une route mal typée casse ses trois consommateurs.

## Fichiers gouvernés

| Fichier | Rôle |
| --- | --- |
| `packages/api/src/server.ts` | `createApi(routes)`, l'app `app` montée sur `/api/v1` : openapi, gestion d'erreurs, limitation de débit, `handleApiRequest`, `configureApi({ prisma, auth })` |
| `packages/api/src/lib/api/routes/index.ts` | monte `authPlugin` puis chaque routeur ; `hiddenRoutes(router)` pour le groupe admin |
| `packages/api/src/lib/api/routes/<ressource>.ts` | un routeur |
| `packages/api/src/lib/api/routes/<ressource>-schemas.ts` | les schémas `t` colocalisés de ce routeur |
| `packages/api/src/lib/api/plugins/auth.ts` | `authPlugin`, `resolveAuthContext`, `AuthContext` |
| `packages/api/src/lib/api/plugins/guards.ts` | `requireAuth`, `requireOrg`, `requireRole`, `requireEntitlement`, `requireServer`, `requirePlatformAdmin`, `hasPermission`, `ROLE_RANK` |
| `packages/api/src/lib/api/prisma.ts` | `getPrisma`, `configurePrisma`, `ApiPrisma`, `serializeData`, `withOrganization` |
| `packages/api/src/lib/api/errors.ts` | `apiError`, `createErrorRef` |
| `packages/api/src/lib/api/openapi-models.ts` | `errorResponse`, `withAuthErrors`, `dataResponse`, `paginatedResponse`, `dateTime` |
| `packages/api/src/lib/api/validation-errors.ts` | traduction des erreurs `t` (appelée par `server.ts`) |
| `packages/api/src/lib/api/rate-limit.ts` | `createRateLimiter`, `GLOBAL_RATE_LIMIT` |
| `packages/api/src/lib/i18n/` | `resolveLocale(headers)`, `translate(locale, key, params)`, dictionnaire fr/en |
| `packages/api/src/lib/<domaine>/` | la logique métier : `me/`, `servers/`, puis `devices/`, `entitlement/`, `billing/`, `releases/`, `audit/`, `emails/` |
| `packages/api/src/testing/` | harnais PGlite : `bootApiTestServer`, `resetDb`, `request` (`apiRequest`, `authRequest`), `session` (`createUser`, `createSession`), `factories` (`createOrganizationWithMembers`, `createServer`) |
| `packages/api/src/__tests__/api/` | tests d'intégration des routes |
| `packages/shared/src/api/errors.ts` | `API_ERROR_CODES`, les codes stables, `ApiErrorBodySchema` |
| `packages/shared/src/permissions/` | rôles `owner`, `admin`, `member` et slugs `<scope>:<action>` |
| `docs/contracts/platform-api.md` | le contrat : routes, corps, réponses, guards, modèle |

## État du dépôt

Depuis PLT-03, le socle existe : `GET /health`, `GET /me` (les guards, et depuis PLT-08 le droit d'usage de l'organisation active : `none` sans organisation, sinon `valid`, `grace` ou `suspended`, par `entitlementForOrganization`), les guards (dont `requireEntitlement`, ajouté par PLT-21 : sans abonnement en cours, une organisation n'enrôle ni n'attribue rien), `serializeData`, `withOrganization`, `apiError`, l'openapi sur `/api/v1/openapi` (document sur `/api/v1/openapi/json`), le harnais PGlite et le client Eden. Les routes métier arrivent avec PLT-04 et suivantes ; ce skill décrit ce qui est livré, et une tâche qui change un nom met ce skill à jour dans la même passe.

## Règles

- **Le contrat d'abord.** Une route absente de `docs/contracts/platform-api.md` n'existe pas. Un besoin nouveau s'écrit dans `docs/TRACKING.md` (blocages) et devient une tâche de contrat ; on n'ajoute pas une route « en passant ».
- **Le routeur ne fait que brancher** : HTTP → fonction de domaine dans `src/lib/<domaine>/` → `serializeData`. Aucun appel Prisma dans un routeur. Le domaine lit le client par `getPrisma()` (`src/lib/api/prisma.ts`), jamais en l'instanciant.
- **Les codes d'erreur viennent de `@pupitre/shared/api/errors`.** Un code nouveau se déclare là, par une tâche de contrat, jamais comme une chaîne libre dans un handler. `apiError` refuse un code inconnu à la compilation.
- **Les messages d'erreur sont traduits** : une clé dans `src/lib/i18n/index.ts` (fr et en dans la même passe), `translate(resolveLocale(request.headers), clé)` dans le handler. Pas de phrase en dur.
- **La plateforme ne connaît pas le contenu d'un serveur.** Aucune route ne reçoit un projet, un secret ou un fichier client. Une PR qui ajoute un tel champ est refusée (`apps/web/CLAUDE.md`).
- **Les webhooks Stripe sont la seule entrée de la facturation.** Une route ne crée jamais un abonnement ou un siège à la fin d'un checkout.
- **Types inférés**, jamais redéclarés : Prisma pour les entités, `t` pour les entrées et sorties, Eden côté client.
- **Imports relatifs** dans `packages/api` : pas d'alias `@/`. `@pupitre/api/lib/*` est interdit hors du package (`scripts/assert-package-boundaries.ts`). Le client Prisma s'importe depuis `@pupitre/db/cloudflare/client` (`ApiPrisma`), jamais depuis `@pupitre/db/client` hors des tests.
- Style Biome du monorepo : guillemets doubles, pas de point-virgule, lignes vides entre les blocs, pas de commentaire qui répète le code, pas de `export … from` (Biome `noBarrelFile`).

## Structure des routes

Un routeur plat pour la plupart des ressources, un dossier quand le domaine a plusieurs sous-routeurs :

```
routes/health.ts                  GET /health
routes/me.ts · me-schemas.ts      GET /me
routes/devices.ts                 le routeur
routes/device-schemas.ts          les schémas t colocalisés

routes/servers/
├── index.ts                      compose les sous-routeurs, porte prefix et tags
├── enroll.ts · assign.ts         sous-routeurs sans prefix propre
└── schemas.ts                    schémas partagés du domaine
```

Un routeur porte un `name`, ses `tags` et, s'il en a besoin, son `prefix` ; les sous-routeurs d'un dossier n'ont ni prefix ni tags. Un routeur d'une seule route (`me`) écrit le chemin en entier plutôt qu'un prefix, pour que l'openapi liste `/api/v1/me` et non `/api/v1/me/`.

## Guards

Composition, jamais réimplémentation. Le guard se monte **une fois**, juste après `new Elysia(...)`. Chaque guard résout lui-même la session par `resolveAuthContext(request)` (mémorisée par requête), donc il ne dépend ni de l'ordre de montage ni d'`authPlugin`. Elysia déduplique un plugin nommé monté plusieurs fois.

| Guard | Ce qu'il injecte | Ce qu'il refuse | Pour |
| --- | --- | --- | --- |
| `authPlugin` | `user`, `session`, `organizationId`, `role`, `isPlatformAdmin`, tous nullables sauf le dernier | rien : l'anonyme passe avec `user: null` | `routes/index.ts` le monte en premier ; une route à session optionnelle |
| `requireAuth` | idem, `user` et `session` non nuls | 401 `unauthenticated` | tout ce qui parle à un humain : `/me`, `/me/devices` |
| `requireOrg` | idem, `organizationId` et `role` non nuls (le rôle vient de la table `member`) | 401 `unauthenticated` ; 403 `forbidden` avec `fix` sans organisation active ; 403 `forbidden` si l'utilisateur n'est plus membre | `/servers`, `/orgs/:id/*` |
| `requireRole("admin")` | idem `requireOrg` | 403 `forbidden` si le rôle est sous celui demandé ; `owner` > `admin` > `member` (`ROLE_RANK`) | `/servers/:id/assign`, `/orgs/:id/invitations`, la facturation en `owner` |
| `requireEntitlement` | idem `requireOrg` | 403 `entitlement_required` sans abonnement sur l'organisation ; 403 `server_suspended` quand celui qu'elle a est suspendu ; `fix` vers `/dashboard/billing` dans les deux cas | tout ce qui suppose un abonnement en cours, fût-il en essai : `POST /servers/enroll`, les routes d'attribution |
| `requireServer` | `currentServer` : le `Server` dont `serverTokenHash` est le SHA-256 du bearer, quel que soit son statut sauf `revoked` | 401 `unauthenticated` sans bearer, jeton inconnu, ou serveur `revoked` (avec `fix`) | `/agent/state`, `/agent/heartbeat`, `/agent/release/:version` |
| `requirePlatformAdmin` | `user`, `session` non nuls, `isPlatformAdmin` vrai (`user.role === "platform_admin"`) | 401 `unauthenticated` ; 403 `forbidden` | `/admin/**` |

`currentServer` et non `server` : Elysia réserve `server` dans son contexte (l'instance Bun). Un serveur `suspended` passe `requireServer` : c'est `/agent/state` qui lui dit `entitlement: "suspended"`. Les jetons de serveur sont préfixés `pupitre_srv_` (`src/lib/servers/tokens.ts` : `generateServerToken`, `hashServerToken`, `isServerToken`) ; `authPlugin` ne cherche pas de session Better Auth derrière un tel bearer.

`POST /agent/exchange` et `POST /webhooks/stripe` n'ont aucun guard de session : le premier vérifie le jeton d'enrôlement, le second la signature Stripe, dans leur domaine respectif.

Les permissions fines de la console (`usePermission(slug)`) ne sont pas des guards : un handler qui doit distinguer plus finement que le rôle appelle `hasPermission(role, "servers:assign")` (réexporté par `guards.ts` depuis `@pupitre/shared/permissions`) et refuse en 403 `forbidden`.

## Erreurs

Forme unique, celle du contrat : `{ error: { code, message, fix? } }`. `code` est un `ApiErrorCode`, `message` s'adresse à l'humain dans sa langue (`Accept-Language`, français par défaut), `fix` dit le remède quand il existe et l'app l'affiche tel quel.

```ts
const device = await findDevice(user.id, params.id)

if (!device) {
  set.status = 404
  return apiError("not_found", translate(locale, "device_not_found"))
}
```

Une erreur de domaine connue se mappe sur un statut ; le reste remonte :

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

`apiError` (`packages/api/src/lib/api/errors.ts`) construit l'objet et contraint `code` au type `ApiErrorCode` ; `errorResponse` (`openapi-models.ts`) est le schéma `t` correspondant, à déclarer dans `response` pour chaque statut d'erreur ; `withAuthErrors({ 200: … })` ajoute 401 et 403.

`server.ts` traite seul, dans la langue de la requête : la validation `t` (422 `validation`, message avec le chemin du champ, `fix` avec la raison), un corps illisible (400 `validation`), une route inconnue (404 `not_found`), une exception (500 `internal` avec une référence journalisée, jamais la cause ni la pile), le dépassement de débit (429 `rate_limited`, `retry-after`, 300 requêtes par minute et par `cf-connecting-ip` en mémoire).

## `serializeData` et `withOrganization`

Toute valeur qui vient de Prisma passe par `serializeData` avant de sortir : `Date` → chaîne ISO, `BigInt` → chaîne, `Decimal` → chaîne, objets et tableaux parcourus, `null` gardé. Le type `Serialized<T>` suit la même règle, donc un schéma de réponse déclare les dates en `dateTime` (`t.String({ format: "date-time" })`). Une liste sort enveloppée dans `{ data }` (`dataResponse`, `paginatedResponse`), un élément seul aussi, parce que le contrat le dit.

Une fonction de domaine qui lit ou écrit les tables d'une organisation (`Member`, `Invitation`, `Server`, `Subscription`, `OrganizationBilling`, `Event`) passe par `withOrganization(getPrisma(), organizationId)` : chaque `where` reçoit `organizationId`, chaque `create` aussi, et une requête qui pointe une autre organisation lève `OrganizationScopeViolationError`. Les tables sans colonne `organizationId` (`User`, `Device`, `Release`…) ne sont pas touchées. Les filtres imbriqués dans `OR` ou `AND` ne sont pas inspectés : on n'y met pas d'`organizationId`.

## Validation `t`

`t` d'Elysia pilote la validation, l'OpenAPI et les types Eden. Les corps vivent dans le fichier `*-schemas.ts` colocalisé ; un schéma de réponse porte un `$id` pour être réutilisé dans l'OpenAPI.

```ts
{
  params: t.Object({ id: t.String() }),
  body: deviceInputBody,
  query: t.Object({ status: t.Optional(t.String()) }),
}
```

Les noms de champs du contrat sont en `snake_case` (`public_key`, `device_id`, `enrollment_token`, `active_organization`) : le schéma `t` les reprend tels quels, la fonction de domaine traduit vers le modèle Prisma.

## Enregistrement

`routes/index.ts` monte `authPlugin` en premier, puis chaque routeur, puis le groupe admin caché :

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

`server.ts` monte `routes` par `createApi(routes)` sous `/api/v1` avec l'openapi et la gestion d'erreurs ; `createApi` accepte un autre routeur, ce qui sert aux tests de mécanisme. L'app est construite avec `aot: false` : Cloudflare Workers interdit `new Function`, dont dépend la compilation anticipée d'Elysia. En mode dynamique, un corps JSON illisible remonte comme `SyntaxError` et non comme le code `PARSE` ; `onError` traite les deux. Les routes `/admin/**` restent joignables mais n'apparaissent jamais dans le document OpenAPI : `hiddenRoutes` pose `{ detail: { hide: true } }` une fois sur le groupe, et `requirePlatformAdmin` va sur chaque routeur admin.

## Exemple complet : `devices`

Le contrat (`platform-api.md`, section « Moi ») : `GET /me/devices` → `{ data: Device[] }`, `POST /me/devices` `{ name, public_key }` → `{ data: Device }`, `DELETE /me/devices/:id` → 204. La clé est ed25519 uniquement, l'empreinte est calculée côté serveur, la clé est poussée sur les serveurs que l'utilisateur peut ouvrir (PLT-04). Tout cela vit dans le domaine, pas dans la route.

`packages/api/src/lib/api/routes/device-schemas.ts` :

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

`packages/api/src/lib/devices/devices.ts` expose le domaine, sans HTTP :

```ts
export class PublicKeyNotEd25519Error extends Error {}

export function listDevices(userId: string): Promise<Device[]>
export function addDevice(userId: string, input: { name: string; public_key: string }): Promise<Device>
export function removeDevice(userId: string, deviceId: string): Promise<boolean>
```

`packages/api/src/lib/api/routes/devices.ts` :

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
      detail: { summary: "Les appareils de l'utilisateur" },
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
      detail: { summary: "Ajouter un appareil" },
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
      detail: { summary: "Retirer un appareil" },
      response: {
        204: t.Void(),
        401: errorResponse,
        404: errorResponse,
      },
    }
  )
```

Puis `.use(devicesRoutes)` dans `routes/index.ts`, comme ci-dessus, et les clés `device_not_found`, `key_not_ed25519`, `key_not_ed25519_fix` dans `src/lib/i18n/index.ts`.

## Test d'intégration

Le harnais (`@pupitre/api/testing`) démarre la même app Elysia sur PGlite en moins d'une seconde (`boot.test.ts` le mesure et exige moins de trois). Modèle : `bootApiTestServer` une fois par fichier, `resetDb` avant chaque test, un utilisateur par `createUser`, une session par `createSession` (organisation personnelle active par défaut, `activeOrganizationId: null` pour une session nue), des requêtes par `apiRequest(path, { method, body, session, bearer, headers, locale })`. Une organisation partagée avec ses membres et leurs sessions vient de `createOrganizationWithMembers({ roles })`, un serveur enrôlé avec son jeton en clair de `createServer({ organizationId, status })`. Les tests écrivent les critères d'acceptation de la tâche, avant le code.

`packages/api/src/__tests__/api/devices.test.ts` :

```ts
import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "../../testing"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

const ED25519_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExempleDeClePubliqueEd25519 laptop"

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

  it("enregistre une clé ed25519 et calcule son empreinte", async () => {
    const response = await apiRequest<{ data: { fingerprint: string } }>(
      "/me/devices",
      { body: { name: "MacBook", public_key: ED25519_KEY }, session }
    )

    expect(response.status).toBe(201)
    expect(response.json.data.fingerprint).toMatch(/^SHA256:/)
  })

  it("refuse une clé RSA avec un remède", async () => {
    const response = await apiRequest<{ error: { code: string; fix: string } }>(
      "/me/devices",
      {
        body: { name: "Vieux PC", public_key: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABExemple pc" },
        session,
      }
    )

    expect(response.status).toBe(422)
    expect(response.json.error.code).toBe("key_not_ed25519")
    expect(response.json.error.fix).toContain("ed25519")
  })

  it("refuse sans session", async () => {
    const response = await apiRequest("/me/devices")

    expect(response.status).toBe(401)
  })
})
```

Un test de mécanisme (guard, erreur, openapi) construit sa propre app avec `createApi(routes)` et l'appelle par `api.handle(new Request(...))` ; `guards.test.ts` et `errors.test.ts` en sont les modèles. Le client Eden se teste avec `createApiClient(TEST_BASE_URL, { fetch: server.fetch, headers })` et `unwrap(...)`, qui lève `ApiError` de shared.

Les fichiers `*.test.ts` et `testing/**` ont leurs propres règles Biome (`biome.jsonc`, `overrides`) : `useAwait` et `noVoid` désactivés, types par `type` ou `interface` au choix.

## Avant de passer la tâche en « en revue »

1. La route existe dans `docs/contracts/platform-api.md`, avec le même corps et la même réponse.
2. Le routeur ne contient ni Prisma ni règle métier ; le domaine est dans `src/lib/<domaine>/` et lit `getPrisma()` ou `withOrganization(...)`.
3. Chaque code d'erreur renvoyé existe dans `packages/shared/src/api/errors.ts` ; chaque message a sa clé fr et en dans `src/lib/i18n` ; chaque `fix` dit un remède.
4. Chaque statut renvoyé est déclaré dans `response`, et `errorResponse` couvre les statuts d'erreur.
5. Le routeur est monté dans `routes/index.ts` ; une route admin est sous `hiddenRoutes` et derrière `requirePlatformAdmin`.
6. Un test d'intégration sur PGlite couvre chaque critère d'acceptation, le cas sans session, et le cas d'un autre utilisateur ou d'une autre organisation qui ne voit pas la ressource.
7. `bun --cwd=packages/api run lint`, `check:types`, `test` verts, puis les mêmes à la racine.
