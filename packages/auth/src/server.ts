import { passkey } from "@better-auth/passkey"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@pupitre/db/cloudflare/client"
import { DEFAULT_LOCALE, LOCALES, localeOf } from "@pupitre/shared/i18n"
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
  twoFactor,
} from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { ac, platformAc, platformRoles, roles } from "./access-control"
import {
  authEmailRenderer,
  configuredSendEmail,
  createLoggingSendEmail,
  type SendEmail,
} from "./emails"
import {
  type AuthEnv,
  consoleUrl,
  isLocalhostUrl,
  passkeyRpId,
  readAuthEnv,
  trustedOrigins,
} from "./env"
import { ensurePersonalOrganization } from "./personal-organization"
import type { AuthPrisma } from "./prisma"
import { twoFactorChallenge } from "./two-factor-policy"

export type {
  AuthEmailRenderer,
  AuthEmailsConfig,
  EmailLogger,
  EmailMessage,
  InvitationEmailInput,
  MagicLinkEmailInput,
  SendEmail,
} from "./emails"
export type { AuthEnv } from "./env"
export type { AuthPrisma } from "./prisma"

const DAY_SECONDS = 60 * 60 * 24
const SESSION_EXPIRES_IN = 60 * DAY_SECONDS
const SESSION_UPDATE_AGE = DAY_SECONDS
const INVITATION_EXPIRES_IN = 7 * DAY_SECONDS
const MAGIC_LINK_EXPIRES_IN = 15 * 60
const DEVICE_CODE_EXPIRES_IN = "30m"
const DEVICE_POLL_INTERVAL = "5s"

export const RELYING_PARTY_NAME = "Pupitre"
export const BACKUP_CODE_COUNT = 10

export const DEVICE_VERIFICATION_PATH = "/auth/device"
export const INVITATION_PATH = "/auth/invitation"
export const DEFAULT_USER_ROLE = "user"
export const CLIENT_IP_HEADER = "cf-connecting-ip"

export interface CreateAuthOptions {
  prisma: AuthPrisma
  env: AuthEnv
  sendEmail?: SendEmail
}

const senders = new WeakMap<object, SendEmail>()

export function sendEmailFor(instance: Auth): SendEmail {
  return (
    senders.get(instance) ?? configuredSendEmail() ?? createLoggingSendEmail()
  )
}

function headersOf(value: unknown): Headers | null {
  return value instanceof Headers ? value : null
}

/**
 * Better Auth hands a `Request` to one plugin and its own endpoint context to
 * the other; both carry the caller's headers, one directly and one behind
 * `request`.
 */
function acceptLanguageOf(source: unknown): string | null {
  if (!(source && typeof source === "object")) {
    return null
  }

  const holder = source as {
    headers?: unknown
    request?: { headers?: unknown }
  }
  const headers =
    headersOf(holder.headers) ?? headersOf(holder.request?.headers)

  return headers?.get("accept-language") ?? null
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
  sendEmail = configuredSendEmail() ?? createLoggingSendEmail(),
}: CreateAuthOptions) {
  const secureCookies = !isLocalhostUrl(env.BETTER_AUTH_URL)
  const invitationBaseUrl = `${consoleUrl(env)}${INVITATION_PATH}`

  const instance = betterAuth({
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
    user: {
      deleteUser: { enabled: true },
      additionalFields: {
        locale: {
          type: [...LOCALES],
          required: false,
          defaultValue: DEFAULT_LOCALE,
          input: false,
        },
      },
    },
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
          before: (user, context) =>
            Promise.resolve({
              data: {
                ...user,
                locale: localeOf(acceptLanguageOf(context)),
              },
            }),
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
        sendMagicLink: async ({ email, url }, request) => {
          await sendEmail(
            await authEmailRenderer().magicLink({
              to: email,
              url,
              acceptLanguage: acceptLanguageOf(request),
            })
          )
        },
      }),
      // Avant `bearer`, qui sinon délivrerait un jeton pour la session que le code n'a pas encore gardée.
      twoFactorChallenge(consoleUrl(env)),
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
        sendInvitationEmail: async (data, request) => {
          await sendEmail(
            await authEmailRenderer().invitation({
              to: data.email,
              url: `${invitationBaseUrl}/${data.id}`,
              organizationName: data.organization.name,
              inviterEmail: data.inviter.user.email,
              acceptLanguage: acceptLanguageOf(request),
            })
          )
        },
      }),
      admin({
        ac: platformAc,
        roles: platformRoles,
        adminRoles: [PLATFORM_ADMIN_ROLE],
        defaultRole: DEFAULT_USER_ROLE,
      }),
      passkey({
        rpID: passkeyRpId(env),
        rpName: RELYING_PARTY_NAME,
        origin: trustedOrigins(env),
      }),
      twoFactor({
        issuer: RELYING_PARTY_NAME,
        // Nobody here has a password, so the second factor is managed from a
        // live session instead of being re-proven by one.
        allowPasswordless: true,
        backupCodeOptions: { amount: BACKUP_CODE_COUNT },
      }),
      openAPI(),
      tanstackStartCookies(),
    ],
  })

  senders.set(instance, sendEmail)

  return instance
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
