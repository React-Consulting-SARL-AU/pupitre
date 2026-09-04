import type { ApiErrorCode } from "@pupitre/shared/api/errors"
import {
  hasPermission as hasRolePermission,
  type OrgRole,
} from "@pupitre/shared/permissions"
import { Elysia, status } from "elysia"
import {
  type MessageKey,
  type MessageParams,
  resolveLocale,
  translate,
} from "../../i18n"
import { findServerByToken } from "../../servers/servers"
import { apiError } from "../errors"
import { bearerTokenOf, resolveAuthContext } from "./auth"

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

export const requireAuth = new Elysia({ name: "requireAuth" }).resolve(
  { as: "scoped" },
  async ({ request }) => {
    const auth = await resolveAuthContext(request)

    if (!(auth.user && auth.session)) {
      return unauthenticated(request)
    }

    return { ...auth, user: auth.user, session: auth.session }
  }
)

async function resolveMembership(request: Request) {
  const auth = await resolveAuthContext(request)

  if (!(auth.user && auth.session)) {
    return unauthenticated(request)
  }

  if (!auth.organizationId) {
    return refuse(request, {
      status: 403,
      code: "forbidden",
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

export const requirePlatformAdmin = new Elysia({
  name: "requirePlatformAdmin",
}).resolve({ as: "scoped" }, async ({ request }) => {
  const auth = await resolveAuthContext(request)

  if (!(auth.user && auth.session)) {
    return unauthenticated(request)
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
        code: "unauthenticated",
        message: "server_token_unknown",
      })
    }

    if (server.status === "revoked") {
      return refuse(request, {
        status: 401,
        code: "unauthenticated",
        message: "server_token_revoked",
        fix: "server_token_revoked_fix",
      })
    }

    return { currentServer: server }
  }
)
