# API de la plateforme

Elysia, montée sur `/api/v1` dans `packages/api/src/server.ts`. Trois consommateurs : la console (cookie de session), l'app desktop (bearer), l'agent (jeton de serveur). Le client typé est Eden Treaty via `@pupitre/api/client`. Better Auth est montée à part sur `/api/auth/*` par `packages/auth`.

## Authentification

| Consommateur | Mécanisme | Plugin Better Auth |
| --- | --- | --- |
| Console | cookie de session | `tanstackStartCookies` |
| App desktop | `Authorization: Bearer <session token>` obtenu par le device flow | `deviceAuthorization`, `bearer` |
| Agent | `Authorization: Bearer <server token>` | aucun : jeton propre, haché en base, vérifié par le guard `requireServer` |
| Support | session d'un utilisateur au rôle `platform_admin` | `admin` |

Guards Elysia dans `packages/api/src/lib/api/plugins/` : `authPlugin` (résout session, utilisateur, organisation active, rôle), `requireOrg`, `requireRole("admin")`, `requireServer`, `requirePlatformAdmin`.

## Routes

### Moi

| Méthode | Route | Corps | Réponse |
| --- | --- | --- | --- |
| GET | `/me` | — | `{ user, organizations[], active_organization, role, entitlement }` |
| GET | `/me/devices` | — | `{ data: Device[] }` |
| POST | `/me/devices` | `{ name, public_key }` | `{ data: Device }`. La clé est poussée sur tous les serveurs que l'utilisateur peut ouvrir |
| DELETE | `/me/devices/:id` | — | 204. Retirée des serveurs en moins d'une minute |
| GET | `/me/servers` | — | `{ data: ServerForUser[] }` : hôte, port, utilisateur, empreinte d'hôte, statut, `key_ready` |

### Serveurs

| Méthode | Route | Corps | Réponse |
| --- | --- | --- | --- |
| POST | `/servers/enroll` | `{ device_id, host, port, fingerprint?, probe }` | `{ server_id, enrollment_token, release: { version, url, sha256, signature } }`. Refusé si le quota de sièges est atteint |
| GET | `/servers` | — | `{ data: Server[] }` de l'organisation active |
| GET | `/servers/:id` | — | `Server` avec métriques des 7 derniers jours et événements |
| POST | `/servers/:id/assign` | `{ user_id }` ou `{ invite_email }` | `Server`. Rôle `admin` |
| POST | `/servers/:id/unassign` | — | `Server`. Clés retirées |
| POST | `/servers/:id/revoke-device` | `{ device_id }` | 204 |
| DELETE | `/servers/:id` | — | 204. Droit d'usage retiré, siège libéré à la fin de période |

### Agent

| Méthode | Route | Corps | Réponse |
| --- | --- | --- | --- |
| POST | `/agent/exchange` | `{ enrollment_token, host_public_key, agent_version, arch }` | `{ server_token }`. Le jeton d'enrôlement est brûlé |
| GET | `/agent/state` | — | `{ entitlement: "valid" \| "grace" \| "suspended", valid_until, authorized_keys[], target_version, hostname, module_params }` |
| POST | `/agent/heartbeat` | `{ disk, ram, load, sessions[], stack_version, modules[] }` | 204 |
| GET | `/agent/release/:version` | — | redirection signée vers R2 pour l'architecture du serveur |

### Releases, côté appareil

| Méthode | Route | Auth | Réponse |
| --- | --- | --- | --- |
| GET | `/releases/agent/:version?arch=` | bearer d'appareil | redirection signée vers R2 : l'app télécharge le binaire de l'agent pour le pousser elle-même sur le serveur |
| GET | `/releases/agent/latest?channel=stable` | bearer d'appareil | `{ version, sha256, signature }` de la dernière version du canal |

### Organisation

| Méthode | Route | Rôle | Réponse |
| --- | --- | --- | --- |
| GET | `/orgs/:id/members` | member | membres et invitations en attente (données Better Auth) |
| POST | `/orgs/:id/invitations` | admin | `{ email, role }` |
| GET | `/orgs/:id/events` | admin | audit paginé |
| GET | `/orgs/:id/subscription` | owner | miroir Stripe : produit, quantité, statut, fin de période |
| POST | `/orgs/:id/checkout` | owner | `{ quantity, interval }` → `{ url }` Stripe Checkout (Managed Payments) |
| POST | `/orgs/:id/portal` | owner | `{ url }` portail client Stripe |

### Plateforme

| Méthode | Route | Rôle | Réponse |
| --- | --- | --- | --- |
| GET | `/admin/servers` | platform_admin | tous les serveurs, filtrables |
| POST | `/admin/servers/:id/suspend` | platform_admin | `{ reason }` |
| GET | `/admin/releases` · POST | platform_admin | publier une version de l'agent : `{ version, arch, sha256, signature, r2_key, channel: "beta" }` |
| POST | `/admin/releases/:version/promote` | platform_admin | `{ channel: "stable" }` : la version devient cible en `stable` dans `/agent/state` |

### Webhooks

| Route | Événements |
| --- | --- |
| POST `/webhooks/stripe` | `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Signature vérifiée, idempotent par `event.id`, rejouable |

## Modèle de données

Tables Better Auth (générées) : `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `deviceCode`, plus celles des plugins activés.

| Table | Champs |
| --- | --- |
| `Device` | `id`, `userId`, `name`, `publicKey`, `fingerprint`, `lastUsedAt`, `createdAt` |
| `Server` | `id`, `organizationId`, `name`, `hostFingerprint`, `arch`, `agentVersion`, `serverTokenHash`, `status` (`enrolling`, `active`, `grace`, `suspended`, `revoked`), `assignedUserId?`, `lastHeartbeatAt`, `metrics` (json, 7 jours), `createdAt` |
| `Subscription` | `id`, `organizationId`, `stripeSubscriptionId`, `product`, `quantity`, `status`, `currentPeriodEnd` |
| `OrganizationBilling` | `organizationId`, `stripeCustomerId`, `defaultInterval` |
| `Release` | `version`, `arch`, `sha256`, `signature`, `r2Key`, `publishedAt`, `channel` (`stable`, `beta`) |
| `Event` | `id`, `organizationId?`, `actorUserId?`, `action`, `targetType`, `targetId`, `payload`, `createdAt` |
| `StripeEvent` | `id` (Stripe), `type`, `processedAt` |

## Erreurs

Forme unique : `{ error: { code, message, fix? } }`. Codes stables dans `packages/shared/src/api/errors.ts`. Validation par `t` d'Elysia ; les messages de validation sont traduits en français et en anglais.

## Tâches longues

Cloudflare Workflows dans `apps/web/src/workflows/` : `ReconcileSeats` (quotidien : sièges payés contre serveurs actifs), `DecommissionServer` (sept jours après suppression ou impayé), `ExpireEnrollments` (jetons d'enrôlement non échangés en une heure).
