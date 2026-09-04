import {
  type Auth,
  getAuth as getDefaultAuth,
  type Session,
} from "@pupitre/auth/server"
import {
  isOrgRole,
  type OrgRole,
  PLATFORM_ADMIN_ROLE,
} from "@pupitre/shared/permissions"
import { Elysia } from "elysia"
import { isServerToken } from "../../servers/tokens"
import { getPrisma } from "../prisma"

export type SessionUser = Session["user"]

export type SessionRecord = Session["session"]

export interface AuthContext {
  user: SessionUser | null
  session: SessionRecord | null
  organizationId: string | null
  role: OrgRole | null
  isPlatformAdmin: boolean
}

const ANONYMOUS: AuthContext = {
  user: null,
  session: null,
  organizationId: null,
  role: null,
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
    return !isServerToken(bearer)
  }

  return headers.has("cookie")
}

async function memberRole(
  userId: string,
  organizationId: string
): Promise<OrgRole | null> {
  const member = await getPrisma().member.findFirst({
    where: { userId, organizationId },
    select: { role: true },
  })

  return member && isOrgRole(member.role) ? member.role : null
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
  const role = organizationId
    ? await memberRole(resolved.user.id, organizationId)
    : null

  return {
    user: resolved.user,
    session: resolved.session,
    organizationId,
    role,
    isPlatformAdmin: resolved.user.role === PLATFORM_ADMIN_ROLE,
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
