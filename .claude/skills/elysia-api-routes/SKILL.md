---
name: elysia-api-routes
description: "Écrire ou modifier une route Elysia de `/api/v1` dans `packages/api/src/lib/api/routes` — routeur plat ou dossier, schémas `t` colocalisés, guards `authPlugin`, `requireOrg`, `requireRole`, `requireServer`, `requirePlatformAdmin`, `serializeData`, erreurs `{ error: { code, message, fix? } }`, enregistrement dans `routes/index.ts`, routes admin cachées, test d'intégration sur le harnais PGlite. À utiliser dès qu'une tâche `PLT` ajoute, déplace ou touche un endpoint de l'API."
---

# Routes Elysia — `/api/v1`

L'API vit dans `packages/api` et reste le contrat unique pour la console (`apps/web`), l'app desktop et l'agent. Elle est consommée par Eden Treaty (`@pupitre/api/client`) ; ses types partent du code des routes, donc une route mal typée casse ses trois consommateurs.

## Fichiers gouvernés

| Fichier | Rôle |
| --- | --- |
| `packages/api/src/server.ts` | l'app Elysia montée sur `/api/v1` : openapi, gestion d'erreurs, `handleApiRequest` |
| `packages/api/src/lib/api/routes/index.ts` | monte `authPlugin` puis chaque routeur ; groupe `admin` caché |
| `packages/api/src/lib/api/routes/<ressource>.ts` | un routeur |
| `packages/api/src/lib/api/routes/<ressource>-schemas.ts` | les schémas `t` colocalisés de ce routeur |
| `packages/api/src/lib/api/plugins/auth.ts` | `authPlugin` |
| `packages/api/src/lib/api/plugins/guards.ts` | `requireOrg`, `requireRole`, `requireServer`, `requirePlatformAdmin` |
| `packages/api/src/lib/api/serialize-data.ts` | `serializeData` |
| `packages/api/src/lib/api/errors.ts` | `apiError`, `errorResponse` |
| `packages/api/src/lib/<domaine>/` | la logique métier : `devices/`, `servers/`, `entitlement/`, `billing/`, `releases/`, `audit/`, `emails/` |
| `packages/api/src/testing/` | harnais PGlite : `bootApiTestServer`, `resetDb`, `factories`, `session`, `request` |
| `packages/api/src/__tests__/` | tests d'intégration |
| `packages/shared/src/api/errors.ts` | `API_ERROR_CODES`, les codes stables |
| `packages/shared/src/permissions/` | rôles `owner`, `admin`, `member` et slugs `<scope>:<action>` |
| `docs/contracts/platform-api.md` | le contrat : routes, corps, réponses, guards, modèle |

## État du dépôt

Au 2026-09-04, `packages/api/src/server.ts` n'expose que `GET /health` et `packages/api/src/testing/index.ts` refuse de démarrer. Les guards, `serializeData`, `apiError` et le harnais PGlite sont livrés par **PLT-03** ; `API_ERROR_CODES` est vide tant qu'**INF-04** n'a pas livré les contrats. Ce skill décrit la cible. Si PLT-03 a retenu un autre nom ou une autre signature, le code de PLT-03 gagne et ce skill est mis à jour dans la même tâche.

## Règles

- **Le contrat d'abord.** Une route absente de `docs/contracts/platform-api.md` n'existe pas. Un besoin nouveau s'écrit dans `docs/TRACKING.md` (blocages) et devient une tâche de contrat ; on n'ajoute pas une route « en passant ».
- **Le routeur ne fait que brancher** : HTTP → fonction de domaine dans `src/lib/<domaine>/` → `serializeData`. Aucun appel Prisma dans un routeur.
- **Les codes d'erreur viennent de `@pupitre/shared/api/errors`.** Un code nouveau se déclare là, par une tâche de contrat, jamais comme une chaîne libre dans un handler.
- **La plateforme ne connaît pas le contenu d'un serveur.** Aucune route ne reçoit un projet, un secret ou un fichier client. Une PR qui ajoute un tel champ est refusée (`apps/web/CLAUDE.md`).
- **Les webhooks Stripe sont la seule entrée de la facturation.** Une route ne crée jamais un abonnement ou un siège à la fin d'un checkout.
- **Types inférés**, jamais redéclarés : Prisma pour les entités, `t` pour les entrées et sorties, Eden côté client.
- **Imports relatifs** dans `packages/api` : pas d'alias `@/`. `@pupitre/api/lib/*` est interdit hors du package (`scripts/assert-package-boundaries.ts`).
- Style Biome du monorepo : guillemets doubles, pas de point-virgule, lignes vides entre les blocs, pas de commentaire qui répète le code.

## Structure des routes

Un routeur plat pour la plupart des ressources, un dossier quand le domaine a plusieurs sous-routeurs :

```
routes/devices.ts                 le routeur
routes/device-schemas.ts          les schémas t colocalisés

routes/servers/
├── index.ts                      compose les sous-routeurs, porte prefix et tags
├── enroll.ts · assign.ts         sous-routeurs sans prefix propre
└── schemas.ts                    schémas partagés du domaine
```

Un routeur porte son `prefix` et ses `tags` ; les sous-routeurs d'un dossier n'ont ni l'un ni l'autre.

## Guards

Composition, jamais réimplémentation. Le guard se monte **une fois**, juste après `new Elysia(...)`. Elysia déduplique un plugin nommé monté plusieurs fois, donc un routeur peut monter `authPlugin` pour l'inférence de ses types même si `routes/index.ts` l'a déjà monté.

| Guard | Ce qu'il injecte | Ce qu'il refuse | Pour |
| --- | --- | --- | --- |
| `authPlugin` | `user`, `activeOrganization` (nullable), `role` (nullable) depuis le cookie de session ou le bearer du device flow | 401 `unauthenticated` | tout ce qui parle à un humain |
| `requireOrg` | `activeOrganization` non nul, `role` non nul | 400 `no_active_organization` | `/servers`, `/orgs/:id/*` |
| `requireRole("admin")` | idem `requireOrg` | 403 `forbidden` si le rôle est sous celui demandé ; `owner` > `admin` > `member` | `/servers/:id/assign`, `/orgs/:id/invitations`, la facturation en `owner` |
| `requireServer` | `server` : le `Server` dont le jeton haché correspond au bearer, `status` dans `active` ou `grace` | 401 `invalid_server_token`, 403 `server_suspended` | `/agent/state`, `/agent/heartbeat`, `/agent/release/:version` |
| `requirePlatformAdmin` | `user` au rôle `platform_admin` | 403 `forbidden` | `/admin/**` |

Les codes de la colonne « refuse » sont ceux attendus dans `packages/shared/src/api/errors.ts` ; si INF-04 ou PLT-03 en a retenu d'autres, ce sont les leurs. `POST /agent/exchange` et `POST /webhooks/stripe` n'ont aucun guard de session : le premier vérifie le jeton d'enrôlement, le second la signature Stripe, dans leur domaine respectif.

Les permissions fines de la console (`usePermission(slug)`) ne sont pas des guards : un handler qui doit distinguer plus finement que le rôle appelle `hasPermission(role, "servers:assign")` de `@pupitre/shared/permissions` et refuse en 403 `forbidden`.

## Erreurs

Forme unique, celle du contrat : `{ error: { code, message, fix? } }`. `code` est un `ApiErrorCode`, `message` s'adresse à l'humain, `fix` dit le remède quand il existe et l'app l'affiche tel quel.

```ts
const device = await findDevice(user.id, params.id)

if (!device) {
  set.status = 404
  return apiError("device_not_found", "Cet appareil n'existe pas.")
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
      "public_key_not_ed25519",
      "Seules les clés ed25519 sont acceptées.",
      "Générez une clé avec : ssh-keygen -t ed25519"
    )
  }

  throw error
}
```

`apiError` (`packages/api/src/lib/api/errors.ts`) construit l'objet et contraint `code` au type `ApiErrorCode` ; `errorResponse` est le schéma `t` correspondant, à déclarer dans `response` pour chaque statut d'erreur. Les erreurs de validation `t` sont traduites en français et en anglais par `server.ts`, pas dans les routeurs. Les messages des handlers suivent le mécanisme d'i18n que PLT-03 livre ; en attendant, français.

## `serializeData`

Toute valeur qui vient de Prisma passe par `serializeData` avant de sortir : `Decimal` → `number`, `Date` conservée, objets et tableaux parcourus, `null` gardé. Une liste sort enveloppée dans `{ data }`, un élément seul aussi, parce que le contrat le dit (`{ data: Device[] }`, `{ data: Device }`).

## Validation `t`

`t` d'Elysia pilote la validation, l'OpenAPI et les types Eden. Les corps vivent dans le fichier `*-schemas.ts` colocalisé ; un schéma de réponse porte un `$id` pour être réutilisé dans l'OpenAPI.

```ts
{
  params: t.Object({ id: t.String() }),
  body: deviceInputBody,
  query: t.Object({ status: t.Optional(t.String()) }),
}
```

Les noms de champs du contrat sont en `snake_case` (`public_key`, `device_id`, `enrollment_token`) : le schéma `t` les reprend tels quels, la fonction de domaine traduit vers le modèle Prisma.

## Enregistrement

`routes/index.ts` monte `authPlugin` en premier, puis chaque routeur, puis le groupe admin caché :

```ts
import { Elysia } from "elysia"
import { authPlugin } from "../plugins/auth"
import { adminReleasesRoutes } from "./admin/releases"
import { adminServersRoutes } from "./admin/servers"
import { devicesRoutes } from "./devices"
import { meRoutes } from "./me"

const adminRoutes = new Elysia({ name: "admin-routes" })
  .guard({ detail: { hide: true } })
  .use(adminServersRoutes)
  .use(adminReleasesRoutes)

export const routes = new Elysia({ name: "routes" })
  .use(authPlugin)
  .use(meRoutes)
  .use(devicesRoutes)
  .use(adminRoutes)
```

`server.ts` monte `routes` sous `/api/v1` avec l'openapi et la gestion d'erreurs. Les routes `/admin/**` restent joignables mais n'apparaissent jamais dans le document OpenAPI : `{ detail: { hide: true } }`, posé une fois sur le groupe, et `requirePlatformAdmin` sur chaque routeur admin.

## Exemple complet : `devices`

Le contrat (`platform-api.md`, section « Moi ») : `GET /me/devices` → `{ data: Device[] }`, `POST /me/devices` `{ name, public_key }` → `{ data: Device }`, `DELETE /me/devices/:id` → 204. La clé est ed25519 uniquement, l'empreinte est calculée côté serveur, la clé est poussée sur les serveurs que l'utilisateur peut ouvrir (PLT-04). Tout cela vit dans le domaine, pas dans la route.

`packages/api/src/lib/api/routes/device-schemas.ts` :

```ts
import { t } from "elysia"

export const deviceSchema = t.Object(
  {
    id: t.String(),
    name: t.String(),
    fingerprint: t.String(),
    lastUsedAt: t.Nullable(t.Date()),
    createdAt: t.Date(),
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
import { apiError, errorResponse } from "../errors"
import { authPlugin } from "../plugins/auth"
import { serializeData } from "../serialize-data"
import { deviceInputBody, deviceSchema } from "./device-schemas"

export const devicesRoutes = new Elysia({
  prefix: "/me/devices",
  tags: ["Devices"],
})
  .use(authPlugin)
  .get(
    "/",
    async ({ user }) => {
      const devices = await listDevices(user.id)

      return { data: serializeData(devices) }
    },
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
    async ({ user, body, set }) => {
      try {
        const device = await addDevice(user.id, body)

        set.status = 201
        return { data: serializeData(device) }
      } catch (error) {
        if (error instanceof PublicKeyNotEd25519Error) {
          set.status = 422
          return apiError(
            "public_key_not_ed25519",
            "Seules les clés ed25519 sont acceptées.",
            "Générez une clé avec : ssh-keygen -t ed25519"
          )
        }

        throw error
      }
    },
    {
      body: deviceInputBody,
      detail: { summary: "Ajouter un appareil" },
      response: {
        201: t.Object({ data: deviceSchema }),
        401: errorResponse,
        422: errorResponse,
      },
    }
  )
  .delete(
    "/:id",
    async ({ user, params, set }) => {
      const removed = await removeDevice(user.id, params.id)

      if (!removed) {
        set.status = 404
        return apiError("device_not_found", "Cet appareil n'existe pas.")
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

Puis `.use(devicesRoutes)` dans `routes/index.ts`, comme ci-dessus.

## Test d'intégration

Le harnais (`@pupitre/api/testing`, PLT-03) démarre la même app Elysia sur PGlite en moins de 3 secondes. Modèle : `bootApiTestServer` une fois par fichier, `resetDb` avant chaque test, une session de test posée par `setTestSession`, des requêtes par `apiRequest`. Les tests écrivent les critères d'acceptation de la tâche, avant le code.

`packages/api/src/__tests__/devices.test.ts` :

```ts
import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "../testing"
import { createUser } from "../testing/factories"
import { apiRequest } from "../testing/request"
import { setTestSession } from "../testing/session"

const ED25519_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExempleDeClePubliqueEd25519 laptop"

describe("POST /me/devices", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    const user = await createUser({ email: "jordan@test.local" })

    setTestSession({
      userId: user.id,
      userEmail: user.email,
      organizationId: null,
      role: null,
    })
  })

  it("enregistre une clé ed25519 et calcule son empreinte", async () => {
    const response = await apiRequest("POST", "/me/devices", {
      name: "MacBook",
      public_key: ED25519_KEY,
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.data.fingerprint).toMatch(/^SHA256:/)
  })

  it("refuse une clé RSA avec un remède", async () => {
    const response = await apiRequest("POST", "/me/devices", {
      name: "Vieux PC",
      public_key: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABExemple pc",
    })
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error.code).toBe("public_key_not_ed25519")
    expect(body.error.fix).toContain("ed25519")
  })

  it("refuse sans session", async () => {
    setTestSession(null)

    const response = await apiRequest("GET", "/me/devices")

    expect(response.status).toBe(401)
  })
})
```

Les fichiers `*.test.ts` et `testing/**` ont leurs propres règles Biome (`biome.jsonc`, `overrides`) : `useAwait` et `noVoid` désactivés, types par `type` ou `interface` au choix.

## Avant de passer la tâche en « en revue »

1. La route existe dans `docs/contracts/platform-api.md`, avec le même corps et la même réponse.
2. Le routeur ne contient ni Prisma ni règle métier ; le domaine est dans `src/lib/<domaine>/`.
3. Chaque code d'erreur renvoyé existe dans `packages/shared/src/api/errors.ts` ; chaque `fix` dit un remède.
4. Chaque statut renvoyé est déclaré dans `response`, et `errorResponse` couvre les statuts d'erreur.
5. Le routeur est monté dans `routes/index.ts` ; une route admin est sous le groupe caché.
6. Un test d'intégration sur PGlite couvre chaque critère d'acceptation, le cas sans session, et le cas d'un autre utilisateur qui ne voit pas la ressource.
7. `bun --cwd=packages/api run lint`, `check:types`, `test` verts.
