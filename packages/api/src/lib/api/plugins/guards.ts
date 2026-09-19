import type { ApiErrorCode } from "@pupitre/shared/api/errors"
import { resolveLocale } from "@pupitre/shared/i18n"
import {
  hasPermission as hasRolePermission,
  type OrgRole,
} from "@pupitre/shared/permissions"
import { Elysia, status } from "elysia"
import { formatDate } from "../../../emails/format"
import { PIPELINE_ACTOR } from "../../audit/audit"
import { entitlementRefusalFor } from "../../billing/entitlement"
import { type MessageKey, type MessageParams, translate } from "../../i18n"
import {
  isPublishToken,
  verifyPublishToken,
} from "../../releases/publish-token"
import { findServerByToken } from "../../servers/servers"
import { apiError } from "../errors"
import { type AuthContext, bearerTokenOf, resolveAuthContext } from "./auth"

export const hasPermission = hasRolePermission

export const ROLE_RANK: Record<OrgRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
}

interface Refusal {
  status: 401 | 403
  code: ApiErrorCode
  message: MessageKey
  fix?: MessageKey
  params?: MessageParams
}

function refuse(request: Request, refusal: Refusal) {
  const locale = resolveLocale(request.headers)
  const fix = refusal.fix ? translate(locale, refusal.fix) : undefined

  return status(
    refusal.status,
    apiError(
      refusal.code,
      translate(locale, refusal.message, refusal.params),
      fix
    )
  )
}

function unauthenticated(request: Request) {
  return refuse(request, {
    status: 401,
    code: "unauthenticated",
    message: "unauthenticated",
    fix: "unauthenticated_fix",
  })
}

/**
 * A session the platform no longer honours answers what it refuses, not that
 * nobody is signed in: the app shows the `fix` as it stands.
 */
function refuseSession(request: Request, auth: AuthContext) {
  const refusal = auth.accountRefusal

  if (refusal) {
    return refuse(request, {
      status: 403,
      code: "forbidden",
      message: refusal.kind,
      fix: `${refusal.kind}_fix`,
      params:
        refusal.kind === "account_suspended"
          ? { date: formatDate(resolveLocale(request.headers), refusal.until) }
          : {},
    })
  }

  return auth.user && auth.session ? null : unauthenticated(request)
}

export const requireAuth = new Elysia({ name: "requireAuth" }).resolve(
  { as: "scoped" },
  async ({ request }) => {
    const auth = await resolveAuthContext(request)
    const refused = refuseSession(request, auth)

    if (refused || !(auth.user && auth.session)) {
      return refused ?? unauthenticated(request)
    }

    return { ...auth, user: auth.user, session: auth.session }
  }
)

async function resolveMembership(request: Request) {
  const auth = await resolveAuthContext(request)
  const refused = refuseSession(request, auth)

  if (refused || !(auth.user && auth.session)) {
    return refused ?? unauthenticated(request)
  }

  if (!auth.organizationId) {
    return refuse(request, {
      status: 403,
      code: "no_active_organization",
      message: "no_active_organization",
      fix: "no_active_organization_fix",
    })
  }

  if (!auth.role) {
    return refuse(request, {
      status: 403,
      code: "forbidden",
      message: "not_a_member",
    })
  }

  if (
    auth.organizationState === "closed" ||
    auth.organizationState === "deleting"
  ) {
    return refuse(request, {
      status: 403,
      code: "forbidden",
      message: "organization_closed",
      fix: "organization_closed_fix",
    })
  }

  return {
    ...auth,
    user: auth.user,
    session: auth.session,
    organizationId: auth.organizationId,
    role: auth.role,
  }
}

export const requireOrg = new Elysia({ name: "requireOrg" }).resolve(
  { as: "scoped" },
  ({ request }) => resolveMembership(request)
)

export function requireRole(minimum: OrgRole) {
  return new Elysia({ name: `requireRole:${minimum}` }).resolve(
    { as: "scoped" },
    async ({ request }) => {
      const membership = await resolveMembership(request)

      if (!("role" in membership)) {
        return membership
      }

      if (ROLE_RANK[membership.role] < ROLE_RANK[minimum]) {
        return refuse(request, {
          status: 403,
          code: "forbidden",
          message: "role_required",
          params: { role: minimum },
        })
      }

      return membership
    }
  )
}

export const requireEntitlement = new Elysia({
  name: "requireEntitlement",
}).resolve({ as: "scoped" }, async ({ request }) => {
  const membership = await resolveMembership(request)

  if (!("organizationId" in membership)) {
    return membership
  }

  const refusal = await entitlementRefusalFor(membership.organizationId)

  if (refusal) {
    return refuse(request, {
      status: 403,
      code: refusal,
      message: refusal,
      fix: `${refusal}_fix`,
    })
  }

  return membership
})

export const requirePlatformAdmin = new Elysia({
  name: "requirePlatformAdmin",
}).resolve({ as: "scoped" }, async ({ request }) => {
  const auth = await resolveAuthContext(request)
  const refused = refuseSession(request, auth)

  if (refused || !(auth.user && auth.session)) {
    return refused ?? unauthenticated(request)
  }

  if (!auth.isPlatformAdmin) {
    return refuse(request, {
      status: 403,
      code: "forbidden",
      message: "platform_admin_required",
    })
  }

  return { ...auth, user: auth.user, session: auth.session }
})

/**
 * A member of the platform organization reads the platform pages; acting on
 * them — suspending, creating a link, answering a mail — takes `admin` or
 * `owner` there, the roles the owner hands out on the platform's members page.
 */
export function requirePlatformRole(minimum: OrgRole) {
  return new Elysia({ name: `requirePlatformRole:${minimum}` }).resolve(
    { as: "scoped" },
    async ({ request }) => {
      const auth = await resolveAuthContext(request)
      const refused = refuseSession(request, auth)

      if (refused || !(auth.user && auth.session)) {
        return refused ?? unauthenticated(request)
      }

      if (!auth.platformRole) {
        return refuse(request, {
          status: 403,
          code: "forbidden",
          message: "platform_admin_required",
        })
      }

      if (ROLE_RANK[auth.platformRole] < ROLE_RANK[minimum]) {
        return refuse(request, {
          status: 403,
          code: "forbidden",
          message: "platform_role_required",
          params: { role: minimum },
        })
      }

      return {
        ...auth,
        user: auth.user,
        session: auth.session,
        platformRole: auth.platformRole,
      }
    }
  )
}

/**
 * Who may publish a version: the release pipeline, or a member of the team.
 *
 * The pipeline presents a token of its own, declared on the Worker and in
 * GitHub Actions, which opens these routes and nothing else. The console keeps
 * its session, so a version can still be promoted by hand the day the pipeline
 * cannot. Both end up as an actor the journal can name.
 */
export const requirePublisher = new Elysia({
  name: "requirePublisher",
}).resolve({ as: "scoped" }, async ({ request }) => {
  const token = bearerTokenOf(request.headers)

  if (token && isPublishToken(token)) {
    if (await verifyPublishToken(token)) {
      return { actor: PIPELINE_ACTOR }
    }

    return refuse(request, {
      status: 401,
      code: "unauthenticated",
      message: "publish_token_invalid",
      fix: "publish_token_invalid_fix",
    })
  }

  const auth = await resolveAuthContext(request)
  const refused = refuseSession(request, auth)

  if (refused || !(auth.user && auth.session)) {
    return refused ?? unauthenticated(request)
  }

  if (!auth.platformRole) {
    return refuse(request, {
      status: 403,
      code: "forbidden",
      message: "platform_admin_required",
    })
  }

  if (ROLE_RANK[auth.platformRole] < ROLE_RANK.admin) {
    return refuse(request, {
      status: 403,
      code: "forbidden",
      message: "platform_role_required",
      params: { role: "admin" },
    })
  }

  return { actor: { userId: auth.user.id, source: "console" } }
})

export const requireServer = new Elysia({ name: "requireServer" }).resolve(
  { as: "scoped" },
  async ({ request }) => {
    const token = bearerTokenOf(request.headers)

    if (!token) {
      return refuse(request, {
        status: 401,
        code: "unauthenticated",
        message: "server_token_required",
      })
    }

    const server = await findServerByToken(token)

    if (!server) {
      return refuse(request, {
        status: 401,
        code: "invalid_server_token",
        message: "server_token_unknown",
      })
    }

    if (server.status === "revoked") {
      return refuse(request, {
        status: 401,
        code: "invalid_server_token",
        message: "server_token_revoked",
        fix: "server_token_revoked_fix",
      })
    }

    return { currentServer: server }
  }
)
