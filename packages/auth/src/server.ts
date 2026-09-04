import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@pupitre/db/cloudflare/client"
import { PLATFORM_ADMIN_ROLE } from "@pupitre/shared/permissions"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import {
  admin,
  bearer,
  deviceAuthorization,
  magicLink,
  openAPI,
  organization,
} from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { ac, platformAc, platformRoles, roles } from "./access-control"
import {
  createLoggingSendEmail,
  invitationEmail,
  magicLinkEmail,
  type SendEmail,
} from "./emails"
import {
  type AuthEnv,
  consoleUrl,
  isLocalhostUrl,
  readAuthEnv,
  trustedOrigins,
} from "./env"
import { ensurePersonalOrganization } from "./personal-organization"
import type { AuthPrisma } from "./prisma"

export type { EmailMessage, SendEmail } from "./emails"
export type { AuthEnv } from "./env"
export type { AuthPrisma } from "./prisma"

const DAY_SECONDS = 60 * 60 * 24
const SESSION_EXPIRES_IN = 60 * DAY_SECONDS
const SESSION_UPDATE_AGE = DAY_SECONDS
const INVITATION_EXPIRES_IN = 7 * DAY_SECONDS
const MAGIC_LINK_EXPIRES_IN = 15 * 60
const DEVICE_CODE_EXPIRES_IN = "30m"
const DEVICE_POLL_INTERVAL = "5s"

export const DEVICE_VERIFICATION_PATH = "/auth/device"
export const INVITATION_PATH = "/auth/invitation"
export const DEFAULT_USER_ROLE = "user"
export const CLIENT_IP_HEADER = "cf-connecting-ip"

export interface CreateAuthOptions {
  prisma: AuthPrisma
  env: AuthEnv
  sendEmail?: SendEmail
}

function githubProvider(env: AuthEnv) {
  if (!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)) {
    return {}
  }

  return {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  }
}

function activeOrganizationIdOf(session: object): string | null {
  const value = (session as { activeOrganizationId?: unknown })
    .activeOrganizationId

  return typeof value === "string" && value ? value : null
}

export function createAuth({
  prisma,
  env,
  sendEmail = createLoggingSendEmail(),
}: CreateAuthOptions) {
  const secureCookies = !isLocalhostUrl(env.BETTER_AUTH_URL)
  const invitationBaseUrl = `${consoleUrl(env)}${INVITATION_PATH}`

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(env),
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    socialProviders: githubProvider(env),
    session: {
      expiresIn: SESSION_EXPIRES_IN,
      updateAge: SESSION_UPDATE_AGE,
    },
    rateLimit: { enabled: true },
    advanced: {
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      useSecureCookies: secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await ensurePersonalOrganization(prisma, user)
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            if (activeOrganizationIdOf(session)) {
              return
            }

            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { id: true, email: true },
            })

            if (!user) {
              return
            }

            const organizationId = await ensurePersonalOrganization(
              prisma,
              user
            )

            return {
              data: { ...session, activeOrganizationId: organizationId },
            }
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_EXPIRES_IN,
        sendMagicLink: ({ email, url }) =>
          sendEmail(magicLinkEmail(email, url)),
      }),
      deviceAuthorization({
        expiresIn: DEVICE_CODE_EXPIRES_IN,
        interval: DEVICE_POLL_INTERVAL,
        verificationUri: DEVICE_VERIFICATION_PATH,
      }),
      bearer(),
      organization({
        ac,
        roles,
        creatorRole: "owner",
        invitationExpiresIn: INVITATION_EXPIRES_IN,
        cancelPendingInvitationsOnReInvite: true,
        sendInvitationEmail: (data) =>
          sendEmail(
            invitationEmail({
              to: data.email,
              url: `${invitationBaseUrl}/${data.id}`,
              organizationName: data.organization.name,
              inviterEmail: data.inviter.user.email,
            })
          ),
      }),
      admin({
        ac: platformAc,
        roles: platformRoles,
        adminRoles: [PLATFORM_ADMIN_ROLE],
        defaultRole: DEFAULT_USER_ROLE,
      }),
      openAPI(),
      tanstackStartCookies(),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

export type Session = Auth["$Infer"]["Session"]

let instance: Auth | null = null

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error("DATABASE_URL is not set")
  }

  return url
}

export function getAuth(): Auth {
  if (instance) {
    return instance
  }

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: requireDatabaseUrl() }),
  })

  instance = createAuth({ prisma, env: readAuthEnv(process.env) })

  return instance
}

export const auth = {
  handler: (request: Request): Promise<Response> => getAuth().handler(request),
}

export function getSession(headers: Headers): Promise<Session | null> {
  return getAuth().api.getSession({ headers })
}
