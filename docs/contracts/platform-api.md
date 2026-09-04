# API de la plateforme

Elysia, montée sur `/api/v1` dans `packages/api/src/server.ts`. Trois consommateurs : la console (cookie de session), l'app desktop (bearer), l'agent (jeton de serveur). Le client typé est Eden Treaty via `@pupitre/api/client`. Better Auth est montée à part sur `/api/auth/*` par `packages/auth`.

## Authentification

| Consommateur | Mécanisme | Plugin Better Auth |
| --- | --- | --- |
| Console | cookie de session | `tanstackStartCookies` |
| App desktop | `Authorization: Bearer <session token>` obtenu par le device flow | `deviceAuthorization`, `bearer` |
| Agent | `Authorization: Bearer <server token>` | aucun : jeton propre, haché en base, vérifié par le guard `requireServer` |
| Support | session d'un utilisateur au rôle `platform_admin` | `admin` |
| Console, sans lien magique | clé d'accès WebAuthn | `passkey` |
| Console, second facteur | code TOTP ou code de récupération | `twoFactor` |

Guards Elysia dans `packages/api/src/lib/api/plugins/` : `authPlugin` (résout session, utilisateur, organisation active, rôle), `requireOrg`, `requireRole("admin")`, `requireServer`, `requirePlatformAdmin`.

Une clé d'accès enregistrée ouvre la session seule : le relying party est le domaine enregistrable de `BETTER_AUTH_URL` (`pupitre.studio` en production, `localhost` en développement) et les origines de confiance sont celles de la console. Le second facteur, quand il est activé, est exigé après le lien magique et après la connexion sociale, jamais après une clé d'accès, qui est déjà un second facteur : la vérification renvoie sur `/auth/two-factor`, où un code TOTP ou l'un des dix codes de récupération — à usage unique — ouvre la session. L'app desktop passe par le device flow et ne porte aucun de ces deux plugins.

## Routes

### Moi

| Méthode | Route | Corps | Réponse |
| --- | --- | --- | --- |
| GET | `/me` | — | `{ user, organizations[], active_organization, role, entitlement }`. `user.locale` vaut `fr` ou `en`. `entitlement` vaut `none` sans organisation active, sinon le droit d'usage de l'organisation : `valid`, `grace` ou `suspended` |
| PATCH | `/me` | `{ locale }` (`fr` ou `en`) | le même corps que `GET /me`. La langue enregistrée décide de celle des emails, y compris ceux qu'une tâche planifiée envoie sans en-tête `Accept-Language` à lire |
| GET | `/me/devices` | — | `{ data: Device[] }` |
| POST | `/me/devices` | `{ name, public_key }` | `{ data: Device }`. La clé est poussée sur tous les serveurs que l'utilisateur peut ouvrir |
| DELETE | `/me/devices/:id` | — | 204. Retirée des serveurs en moins d'une minute |
| GET | `/me/servers` | — | `{ data: ServerForUser[] }` : hôte, port, utilisateur, empreinte d'hôte, statut, `key_ready` |

### Statut public

| Méthode | Route | Corps | Réponse |
| --- | --- | --- | --- |
| GET | `/status` | — | `{ data: { api, database, latest_release, active_servers, last_observation_at, freshness, checked_at } }`. Aucun guard : la route répond sans session. `api` et `database` valent `ok` ou `down`, `latest_release` est la dernière version publiée sur le canal `stable` (`{ version, channel, published_at }`) ou `null`, `active_servers` est le nombre total de serveurs au statut `active`. `checked_at` est l'instant du calcul, `last_observation_at` la date du heartbeat le plus récent reçu de toute la flotte, ou `null` si la plateforme n'en a aucun, et `freshness` le verdict de la plateforme sur cette date, contre sa propre horloge : `fresh`, `stale` au-delà de `STATUS_STALE_AFTER_MS` (quinze minutes, `@pupitre/shared/status`), `unknown` sans observation. Une donnée `stale` ou `unknown` interdit d'afficher un état rassurant. Rien d'autre ne sort : ni identifiant, ni nom d'organisation, ni nom de machine, ni adresse ; `last_observation_at` est un maximum agrégé, il ne désigne aucun serveur |

### Serveurs

| Méthode | Route | Corps | Réponse |
| --- | --- | --- | --- |
| POST | `/servers/enroll` | `{ device_id, host, port?, ssh_user?, fingerprint?, probe }` | `{ server_id, enrollment_token, release: { version, url, sha256, signature, channel } }`. `release` est la dernière version `stable` de l'architecture sondée, ou la dernière `beta` si aucune `stable` n'existe — `channel` le dit. Le serveur naît `enrolling`, attribué à l'appelant ; le jeton d'enrôlement vaut une heure et n'est stocké que haché. Refusé si le quota de sièges est atteint (`seat_quota_reached`, 403). Le quota est la quantité de l'abonnement `active`, `trialing` ou `past_due` de l'organisation ; sans abonnement, deux serveurs de développement, et le `fix` le dit |
| GET | `/servers` | — | `{ data: Server[] }` de l'organisation active — un `member` ne voit que les serveurs qui lui sont attribués, `admin` et `owner` les voient tous. `stale` est calculé : aucun heartbeat depuis 24 h. Il ne change ni le statut ni le droit d'usage. `usage` porte le dernier échantillon de `metrics` (`at`, `disk`, `ram`, `load`) ou `null` |
| GET | `/servers/:id` | — | `{ data: Server }` avec `metrics` des 7 derniers jours et `events`. `not_found` (404) pour un `member` à qui ce serveur n'est pas attribué |
| POST | `/servers/:id/assign` | `{ user_id }` ou `{ invite_email }` | `{ data: Server }`. Rôle `admin`. `user_id` doit être membre de l'organisation, sinon `not_found` (404) avec un `fix`. `invite_email` déjà membre attribue directement ; sinon l'invitation part et le serveur porte `pending_assignment_email` jusqu'à l'acceptation, qui l'attribue et pousse ses clés |
| POST | `/servers/:id/unassign` | — | `{ data: Server }`. Clés retirées, attribution en attente effacée |
| POST | `/servers/:id/revoke-device` | `{ device_id }` | 204. Cet appareil ne reçoit plus ce serveur ; les autres appareils de la personne restent |
| DELETE | `/servers/:id` | — | 204. Rôle `admin`. Le serveur passe `revoked`, l'attribution et les clés tombent tout de suite, `DecommissionServer` est programmé à sept jours |

### Agent

| Méthode | Route | Corps | Réponse |
| --- | --- | --- | --- |
| POST | `/agent/exchange` | `{ enrollment_token, host_public_key, agent_version, arch }` | `{ server_token }`. Le jeton d'enrôlement est brûlé |
| GET | `/agent/state` | — | `{ entitlement: "valid" \| "grace" \| "suspended", valid_until, authorized_keys[], target_version, minimum_version, hostname, module_params }`. `target_version` est la dernière version publiée du canal du serveur (`Server.channel`, `stable` par défaut ; un serveur `beta` voit aussi les versions `stable`) pour son architecture, jamais plus ancienne que celle qu'il porte déjà. `minimum_version` est le plancher que la plateforme retient pour ce serveur : la dernière version d'agent qu'elle l'a vu exécuter, `null` tant qu'elle n'en a vu aucune |
| POST | `/agent/heartbeat` | `{ disk, ram, load, sessions[], stack_version, modules[], agent_version? }` | 204. L'échantillon rejoint `Server.metrics`, fenêtre glissante de 7 jours |
| GET | `/agent/release/:version` | — | 303 vers une URL R2 signée, valable 5 minutes, pour l'architecture du serveur. `release_not_found` (404) si la version n'existe pas pour cette architecture |
| GET | `/agent/release/:version/metadata` | — | `{ version, arch, sha256, signature, channel }` pour l'architecture du serveur : l'empreinte attendue et la signature Ed25519 de cette version, telles que la chaîne de publication les a déposées. `release_not_found` (404) si la version n'existe pas pour cette architecture |

L'agent lit la métadonnée avant de télécharger : il y prend l'empreinte et la signature au lieu de les recevoir de l'app, et le plancher de `/agent/state` lui dit s'il a le droit d'installer cette version. Un refus coûte alors un appel, pas un binaire.

`stack_version` porte la version de l'agent lui-même, la même valeur qu'`agent_version`. Le nom vient de la stack bash d'origine, où les deux différaient ; il n'y a plus qu'un binaire.

### Releases, côté appareil

| Méthode | Route | Auth | Réponse |
| --- | --- | --- | --- |
| GET | `/releases/agent/:version?arch=` | bearer d'appareil | 303 vers une URL R2 signée, valable 5 minutes : l'app télécharge le binaire de l'agent pour le pousser elle-même sur le serveur. `arch` vaut `amd64` par défaut |
| GET | `/releases/agent/latest?channel=stable&arch=` | bearer d'appareil | `{ version, arch, sha256, signature }` de la dernière version du canal. `channel` vaut `stable` et `arch` vaut `amd64` par défaut ; `release_not_found` (404) si le canal est vide |

Les deux redirections portent l'en-tête `x-pupitre-release-storage` : `r2` quand le bucket est configuré, `local` quand il ne l'est pas (développement). Dans ce dernier cas le corps de la redirection dit que l'URL est locale et ne télécharge rien.

### Releases de l'app desktop

| Méthode | Route | Auth | Réponse |
| --- | --- | --- | --- |
| GET | `/releases/app/latest?channel=stable` | session | `{ data: AppRelease }` : la version la plus haute du canal, ses notes et un `build` par système publié. `channel` vaut `stable` par défaut ; un canal `beta` voit aussi les versions `stable`. `app_release_not_found` (404) tant que rien n'est publié — la console dit alors qu'il n'y a rien à télécharger plutôt que d'afficher un lien mort |
| GET | `/releases/app/:version` | session | `{ data: AppRelease }` pour une version précise, quel que soit son canal ; `app_release_not_found` (404) sinon |

`AppRelease` vaut `{ version, channel, notes, published_at, builds: [{ os, arch, url, sha256, signature }] }`. Les notes appartiennent à la version : la ligne publiée en premier les porte pour toute la version. `url` est publique et durable (GitHub Releases privées ou R2), contrairement aux URL signées de l'agent : l'app desktop n'est pas un binaire poussé sur un serveur, elle se télécharge depuis un navigateur.

### Organisation

| Méthode | Route | Rôle | Réponse |
| --- | --- | --- | --- |
| GET | `/orgs/:id/members` | member | `{ data: { members[], invitations[] } }` : les membres avec leur email et leur rôle, les invitations `pending` (tables Better Auth) |
| POST | `/orgs/:id/invitations` | admin | `{ email, role }` → `{ data: Invitation }` (201). L'email d'invitation part par Better Auth ; `conflict` (409) si la personne est déjà membre |
| GET | `/orgs/:id/events` | admin | audit paginé : `?limit=&offset=&action=` → `{ data: Event[], total }`, du plus récent au plus ancien, chaque ligne portant `actor_user_id` et `actor_email` |
| GET | `/orgs/:id/subscription` | owner | miroir Stripe : produit, quantité, statut, fin de période |
| POST | `/orgs/:id/checkout` | owner | `{ quantity, interval }` → `{ url }` Stripe Checkout (Managed Payments) |
| POST | `/orgs/:id/portal` | owner | `{ url }` portail client Stripe |

### Plateforme

| Méthode | Route | Rôle | Réponse |
| --- | --- | --- | --- |
| GET | `/admin/servers` | platform_admin | tous les serveurs, filtrables |
| POST | `/admin/servers/:id/suspend` | platform_admin | `{ reason }` |
| POST | `/admin/releases` | platform_admin | publier une version de l'agent : `{ version, arch, sha256, signature, r2_key, channel? }`, `channel` valant `beta` par défaut. `version` est du semver, `sha256` 64 caractères hexadécimaux, `signature` une signature Ed25519 en base64 (88 caractères) : sinon `validation` (422). Réponse `{ data: Release }`, idempotente sur `(version, arch)` : 201 à la création, 200 si la ligne existe déjà à l'identique, `conflict` (409) si elle existe avec une autre empreinte |
| POST | `/admin/releases/:version/promote` | platform_admin | `{ channel: "stable" }` : toutes les architectures de la version passent dans le canal et la version devient cible dans `/agent/state`. Réponse `{ data: Release[] }` ; `release_not_found` (404) si la version n'existe pas |
| POST | `/admin/app-releases` | platform_admin | publier une version de l'app pour un système : `{ version, os, arch?, url, sha256, signature?, notes, channel? }`, `channel` valant `beta` par défaut. `os` vaut `macos`, `windows` ou `linux` ; `version` est du semver, `url` une URL absolue, `sha256` 64 caractères hexadécimaux, `notes` non vides : sinon `validation` (422). Réponse `{ data: AppReleaseBuild }`, idempotente sur `(version, os)` : 201 à la création, 200 si la ligne existe déjà à l'identique, `conflict` (409) si elle existe avec une autre empreinte. Appelé par la CI de l'app (APP-13, APP-16) |

### Webhooks

| Route | Événements |
| --- | --- |
| POST `/webhooks/stripe` | `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Aucun guard de session : la signature `t=…,v1=…` est vérifiée en HMAC-SHA256 sur le corps brut, avec une tolérance de cinq minutes. Idempotent par `event.id` (table `StripeEvent`) : un événement rejoué n'a aucun effet. Réponse `{ received, handled, duplicate }` ; signature absente, invalide ou hors tolérance : `stripe_signature_invalid` (400) |

`invoice.payment_failed` met les serveurs de l'organisation en `grace` pour sept jours, puis `suspended` quand la tolérance expire (`SuspendExpiredGrace`). `customer.subscription.deleted` les met en `grace` jusqu'à la fin de la période payée. Un abonnement qui redevient `active` ou `trialing` ramène les serveurs en `grace` vers `active`. `/agent/state` lit ce droit d'usage.

## Modèle de données

Tables Better Auth (générées) : `user` (avec `twoFactorEnabled` et `locale`, `fr` par défaut, posée à l'inscription depuis `Accept-Language`), `session`, `account`, `verification`, `organization`, `member`, `invitation`, `deviceCode`, `passkey`, `twoFactor`, plus celles des plugins activés.

| Table | Champs |
| --- | --- |
| `Device` | `id`, `userId`, `name`, `publicKey`, `fingerprint`, `lastUsedAt`, `createdAt` |
| `Server` | `id`, `organizationId`, `name`, `host`, `port` (22), `sshUser` (`dev`), `hostFingerprint`, `arch`, `agentVersion`, `targetVersion`, `serverTokenHash`, `enrollmentTokenHash`, `enrollmentExpiresAt`, `entitlementValidUntil`, `decommissionAt`, `status` (`enrolling`, `active`, `grace`, `suspended`, `revoked`), `channel` (`stable`, `beta`), `deviceId?` (l'appareil qui a enrôlé), `assignedUserId?`, `pendingAssignmentEmail?` (attribution en attente d'une invitation), `lastHeartbeatAt`, `metrics` (json, 7 jours), `createdAt` |
| `Alert` | `id`, `serverId`, `kind` (`server_unreachable`, `disk_high`, `agent_outdated`, `entitlement_grace`), `firstSeenAt`, `notifiedAt?`, `resolvedAt?`. Une ligne ouverte (`resolvedAt` nul) par genre et par serveur : tant qu'elle est ouverte, aucun second email ne part ; le retour à la normale la ferme, et la panne suivante en ouvre une autre |
| `Subscription` | `id`, `organizationId`, `stripeSubscriptionId`, `product`, `quantity`, `status`, `currentPeriodEnd` |
| `OrganizationBilling` | `organizationId`, `stripeCustomerId`, `defaultInterval` |
| `Release` | `version`, `arch`, `sha256`, `signature`, `r2Key`, `publishedAt`, `channel` (`stable`, `beta`) |
| `AppRelease` | `version`, `os` (`macos`, `windows`, `linux`), `arch?`, `url`, `sha256`, `signature?`, `notes`, `channel` (`stable`, `beta`), `publishedAt` — clé primaire `(version, os)`. Une ligne par système et par version de l'app desktop, distincte de `Release` qui décrit l'agent par architecture |
| `ServerRevokedDevice` | `serverId`, `deviceId`, `revokedByUserId?`, `revokedAt` — clé primaire `(serverId, deviceId)`. La clé de cet appareil est retirée de ce serveur, sans toucher aux autres |
| `Event` | `id`, `organizationId?`, `actorUserId?`, `action`, `targetType`, `targetId`, `payload`, `createdAt` |
| `StripeEvent` | `id` (Stripe), `type`, `processedAt` |

## Erreurs

Forme unique : `{ error: { code, message, fix? } }`. Codes stables dans `packages/shared/src/api/errors.ts` ; un code nouveau s'ajoute ici et là-bas dans la même passe. Validation par `t` d'Elysia ; les messages de validation sont traduits en français et en anglais.

| Code | Quand |
| --- | --- |
| `unauthenticated` | ni session ni jeton, ou jeton de session invalide (401) |
| `invalid_server_token` | jeton de serveur inconnu, ou serveur révoqué : `requireServer` (401) |
| `forbidden` | rôle trop bas, utilisateur qui n'est plus membre, `platform_admin` requis (403) |
| `no_active_organization` | session sans organisation active : `requireOrg` (403) |
| `not_found` | route inconnue, ou ressource qui n'appartient pas à l'appelant (404) |
| `device_exists` | empreinte d'appareil déjà enregistrée (409) |
| `conflict` | conflit d'état sur une ressource |
| `validation` | corps illisible, schéma `t` non respecté, clé publique illisible (400, 422) |
| `key_not_ed25519` | clé publique d'un autre type que ed25519 (422) |
| `rate_limited` | dépassement de débit, avec `retry-after` (429) |
| `enrollment_used`, `enrollment_expired` | jeton d'enrôlement déjà échangé ou expiré (409) |
| `seat_quota_reached` | quota de sièges de l'abonnement atteint (403), avec un `fix` vers la facturation |
| `entitlement_required`, `server_suspended` | droit d'usage absent, serveur suspendu |
| `release_not_found` | version de l'agent inconnue |
| `app_release_not_found` | aucune version de l'app publiée dans ce canal, ou version inconnue |
| `stripe_signature_invalid` | signature de webhook Stripe invalide |
| `internal` | exception, avec une référence journalisée (500) |

## Tâches longues

Cloudflare Workflows dans `apps/web/src/workflows/` : `ReconcileSeats` (quotidien : sièges payés contre serveurs actifs), `DecommissionServer` (sept jours après suppression ou impayé), `ExpireEnrollments` (jetons d'enrôlement non échangés en une heure), `EvaluateAlerts` (toutes les cinq minutes : `evaluateAlerts()` de `packages/api/src/lib/alerts/alerts.ts`), `SuspendExpiredGrace` (quotidien : `suspendExpiredGrace()` de `packages/api/src/lib/billing/grace.ts`).

Chacune a son déclencheur planifié dans `apps/web/src/workflows/`, déclaré en Cron Trigger : l'expiration des enrôlements toutes les heures, la décommission, la réconciliation des sièges et la suspension des tolérances écoulées chaque jour, l'évaluation des alertes toutes les cinq minutes. Une route interne protégée par un secret partagé permet de les déclencher à la demande.
