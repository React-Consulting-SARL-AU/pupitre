import {
  type Auth,
  getAuth as getDefaultAuth,
  type Session,
} from "@pupitre/auth/server"
import { isOrgRole, type OrgRole } from "@pupitre/shared/permissions"
import {
  type OrganizationState,
  PLATFORM_ORGANIZATION_ID,
} from "@pupitre/shared/platform"
import { Elysia } from "elysia"
import { isBanned, organizationStateOf } from "../../platform/lifecycle"
import { isPublishToken } from "../../releases/publish-token"
import { isServerToken } from "../../servers/tokens"
import { getPrisma } from "../prisma"

export type SessionUser = Session["user"]

export type SessionRecord = Session["session"]

export type SessionRefusal = "account_deactivated"

export interface AuthContext {
  user: SessionUser | null
  session: SessionRecord | null
  organizationId: string | null
  role: OrgRole | null
  /** The caller's role in the platform's own organization: membership there is what opens the platform pages. */
  platformRole: OrgRole | null
  isPlatformAdmin: boolean
  /** A session the platform no longer honours, whatever it asks for: the account behind it is closed. */
  accountRefusal: SessionRefusal | null
  organizationState: OrganizationState | null
}

const ANONYMOUS: AuthContext = {
  user: null,
  session: null,
  organizationId: null,
  role: null,
  platformRole: null,
  isPlatformAdmin: false,
  accountRefusal: null,
  organizationState: null,
}

const BEARER_RE = /^Bearer\s+(.+)$/i

let configured: Auth | null = null

const contexts = new WeakMap<Request, Promise<AuthContext>>()

export function configureAuth(auth: Auth): void {
  configured = auth
}

export function getApiAuth(): Auth {
  configured ??= getDefaultAuth()

  return configured
}

export function bearerTokenOf(headers: Headers): string | null {
  const match = headers.get("authorization")?.match(BEARER_RE)

  return match?.[1]?.trim() || null
}

function carriesSessionCredentials(headers: Headers): boolean {
  const bearer = bearerTokenOf(headers)

  if (bearer) {
    return !(isServerToken(bearer) || isPublishToken(bearer))
  }

  return headers.has("cookie")
}

export async function memberRole(
  userId: string,
  organizationId: string
): Promise<OrgRole | null> {
  const held = await memberships(userId, [organizationId])

  return held.get(organizationId)?.role ?? null
}

interface Membership {
  role: OrgRole | null
  state: OrganizationState | null
}

/** One read for every organization a request cares about: the active one and the platform's. */
async function memberships(
  userId: string,
  organizationIds: string[]
): Promise<Map<string, Membership>> {
  const rows = await getPrisma().member.findMany({
    where: { userId, organizationId: { in: organizationIds } },
    select: {
      organizationId: true,
      role: true,
      organization: {
        select: { suspendedAt: true, closedAt: true, deletionAt: true },
      },
    },
  })
  const held = new Map<string, Membership>()

  for (const row of rows) {
    held.set(row.organizationId, {
      role: isOrgRole(row.role) ? row.role : null,
      state: organizationStateOf(row.organization),
    })
  }

  return held
}

/** A closed account keeps no credential: the platform refuses the session it already holds, not only the next sign-in. */
function refusalFor(user: {
  banned?: boolean | null
  banExpires?: Date | null
  deactivatedAt?: Date | null
  deletionAt?: Date | null
}): SessionRefusal | null {
  const standing = {
    banned: user.banned ?? null,
    banExpires: user.banExpires ?? null,
  }

  if (user.deactivatedAt || user.deletionAt || isBanned(standing)) {
    return "account_deactivated"
  }

  return null
}

async function loadAuthContext(request: Request): Promise<AuthContext> {
  if (!carriesSessionCredentials(request.headers)) {
    return ANONYMOUS
  }

  const resolved = await getApiAuth().api.getSession({
    headers: request.headers,
  })

  if (!resolved) {
    return ANONYMOUS
  }

  const organizationId = resolved.session.activeOrganizationId ?? null
  const held = await memberships(resolved.user.id, [
    ...(organizationId ? [organizationId] : []),
    PLATFORM_ORGANIZATION_ID,
  ])
  const platformRole = held.get(PLATFORM_ORGANIZATION_ID)?.role ?? null
  const active = organizationId ? held.get(organizationId) : undefined

  return {
    user: resolved.user,
    session: resolved.session,
    organizationId,
    role: active?.role ?? null,
    platformRole,
    isPlatformAdmin: platformRole !== null,
    accountRefusal: refusalFor(resolved.user),
    organizationState: active?.state ?? null,
  }
}

export function resolveAuthContext(request: Request): Promise<AuthContext> {
  let pending = contexts.get(request)

  if (!pending) {
    pending = loadAuthContext(request)
    contexts.set(request, pending)
  }

  return pending
}

export const authPlugin = new Elysia({ name: "auth" }).resolve(
  { as: "scoped" },
  async ({ request }) => ({ ...(await resolveAuthContext(request)) })
)
