import {
  type Auth,
  getAuth as getDefaultAuth,
  type Session,
} from "@pupitre/auth/server"
import { isOrgRole, type OrgRole } from "@pupitre/shared/permissions"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { Elysia } from "elysia"
import { isPublishToken } from "../../releases/publish-token"
import { isServerToken } from "../../servers/tokens"
import { getPrisma } from "../prisma"

export type SessionUser = Session["user"]

export type SessionRecord = Session["session"]

export interface AuthContext {
  user: SessionUser | null
  session: SessionRecord | null
  organizationId: string | null
  role: OrgRole | null
  /** The caller's role in the platform's own organization: membership there is what opens the platform pages. */
  platformRole: OrgRole | null
  isPlatformAdmin: boolean
}

const ANONYMOUS: AuthContext = {
  user: null,
  session: null,
  organizationId: null,
  role: null,
  platformRole: null,
  isPlatformAdmin: false,
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
  const roles = await memberRoles(userId, [organizationId])

  return roles.get(organizationId) ?? null
}

/** One read for every organization a request cares about: the active one and the platform's. */
async function memberRoles(
  userId: string,
  organizationIds: string[]
): Promise<Map<string, OrgRole>> {
  const members = await getPrisma().member.findMany({
    where: { userId, organizationId: { in: organizationIds } },
    select: { organizationId: true, role: true },
  })
  const roles = new Map<string, OrgRole>()

  for (const member of members) {
    if (isOrgRole(member.role)) {
      roles.set(member.organizationId, member.role)
    }
  }

  return roles
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
  const roles = await memberRoles(resolved.user.id, [
    ...(organizationId ? [organizationId] : []),
    PLATFORM_ORGANIZATION_ID,
  ])
  const platformRole = roles.get(PLATFORM_ORGANIZATION_ID) ?? null

  return {
    user: resolved.user,
    session: resolved.session,
    organizationId,
    role: organizationId ? (roles.get(organizationId) ?? null) : null,
    platformRole,
    isPlatformAdmin: platformRole !== null,
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
