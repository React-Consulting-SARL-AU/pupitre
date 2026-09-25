import { passkey } from "@better-auth/passkey"
import { scopedPrismaClient } from "@pupitre/db/scope"
import { DEFAULT_LOCALE, LOCALES, localeOf } from "@pupitre/shared/i18n"
import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import { PLATFORM_ADMIN_ROLE } from "@pupitre/shared/permissions"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { APIError } from "better-auth/api"
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
import { adminLockdown } from "./admin-lockdown"
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
import { freshDeviceApproval } from "./fresh-device-approval"
import { accountHooks, organizationHooks } from "./hooks"
import {
  ACCOUNT_DEACTIVATED_CODE,
  isAccountClosed,
  LIFECYCLE_FIELDS,
  ORGANIZATION_LIFECYCLE_FIELDS,
} from "./lifecycle"
import { ensurePersonalOrganization } from "./personal-organization"
import type { AuthPrisma } from "./prisma"
import { configuredRateLimitStorage } from "./rate-limit-storage"
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

export const SOCIAL_PROVIDER_IDS = ["github", "google"] as const

export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number]

export const RELYING_PARTY_NAME = "Pupitre"
export const BACKUP_CODE_COUNT = 10

export const ACCOUNT_DEACTIVATED_MESSAGE = `This account is closed. Write to ${LEGAL_CONTACTS.support} to have it reopened.`

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

// Better Auth passes either a Request or an endpoint context holding headers behind `request`.
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

function credentialsOf(clientId?: string, clientSecret?: string) {
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

function socialProviders(env: AuthEnv) {
  const github = credentialsOf(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET)
  const google = credentialsOf(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)

  return {
    ...(github ? { github } : {}),
    ...(google ? { google } : {}),
  }
}

export function mountedSocialProviders(instance: Auth): SocialProviderId[] {
  const mounted = instance.options.socialProviders ?? {}

  return SOCIAL_PROVIDER_IDS.filter((provider) => provider in mounted)
}

/** D1 has no interactive transactions; hiding `$transaction` makes the adapter run its steps sequentially. */
export function withoutInteractiveTransactions<T extends object>(prisma: T): T {
  return new Proxy(prisma, {
    get: (target, key) =>
      key === "$transaction" ? undefined : Reflect.get(target, key),
  })
}

const ACCOUNT_DELETION_UNAVAILABLE_CODE = "ACCOUNT_DELETION_UNAVAILABLE"

async function refuseOrPurgeAccount(
  userId: string,
  request: unknown
): Promise<void> {
  const hooks = accountHooks()

  if (!hooks) {
    throw new APIError("SERVICE_UNAVAILABLE", {
      code: ACCOUNT_DELETION_UNAVAILABLE_CODE,
      message: "Account deletion is unavailable right now.",
    })
  }

  const refusal = await hooks.onAccountDeleting({
    userId,
    acceptLanguage: acceptLanguageOf(request),
  })

  if (refusal) {
    throw new APIError("CONFLICT", refusal)
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
  const rateLimitStorage = configuredRateLimitStorage()

  const instance = betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(env),
    database: prismaAdapter(withoutInteractiveTransactions(prisma), {
      provider: "sqlite",
    }),
    socialProviders: socialProviders(env),
    session: {
      expiresIn: SESSION_EXPIRES_IN,
      updateAge: SESSION_UPDATE_AGE,
    },
    rateLimit: {
      enabled: true,
      ...(rateLimitStorage ? { customStorage: rateLimitStorage } : {}),
    },
    emailVerification: {
      sendVerificationEmail: async (
        { user, url }: { user: { email: string }; url: string },
        request: unknown
      ) => {
        await sendEmail(
          await authEmailRenderer().emailVerification({
            to: user.email,
            url,
            acceptLanguage: acceptLanguageOf(request),
          })
        )
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user, request) => {
          await refuseOrPurgeAccount(user.id, request)
        },
      },
      // The link goes to the current address so a stolen session cannot move the account away.
      changeEmail: {
        enabled: true,
        sendChangeEmailVerification: async (
          {
            user,
            newEmail,
            url,
          }: { user: { email: string }; newEmail: string; url: string },
          request: unknown
        ) => {
          await sendEmail(
            await authEmailRenderer().emailChange({
              to: user.email,
              newEmail,
              url,
              acceptLanguage: acceptLanguageOf(request),
            })
          )
        },
      },
      additionalFields: {
        locale: {
          type: [...LOCALES],
          required: false,
          defaultValue: DEFAULT_LOCALE,
          input: false,
        },
        ...LIFECYCLE_FIELDS,
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
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: {
                id: true,
                email: true,
                deactivatedAt: true,
                deletionAt: true,
              },
            })

            if (!user) {
              return
            }

            if (isAccountClosed(user)) {
              throw new APIError("FORBIDDEN", {
                code: ACCOUNT_DEACTIVATED_CODE,
                message: ACCOUNT_DEACTIVATED_MESSAGE,
              })
            }

            if (activeOrganizationIdOf(session)) {
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
      // Must precede `bearer`, which would otherwise issue a token before the second factor is checked.
      twoFactorChallenge(consoleUrl(env)),
      deviceAuthorization({
        expiresIn: DEVICE_CODE_EXPIRES_IN,
        interval: DEVICE_POLL_INTERVAL,
        verificationUri: DEVICE_VERIFICATION_PATH,
      }),
      bearer(),
      freshDeviceApproval(),
      organization({
        ac,
        roles,
        schema: {
          organization: { additionalFields: ORGANIZATION_LIFECYCLE_FIELDS },
        },
        creatorRole: "owner",
        invitationExpiresIn: INVITATION_EXPIRES_IN,
        cancelPendingInvitationsOnReInvite: true,
        organizationHooks: {
          afterRemoveMember: async ({ member, user, organization }) => {
            await organizationHooks().onMemberRemoved?.({
              organizationId: organization.id,
              userId: user.id,
              memberId: member.id,
            })
          },
        },
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
      adminLockdown(),
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
        // Accounts have no password, so the second factor is managed from a live session.
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

export function getAuth(): Auth {
  instance ??= createAuth({
    prisma: scopedPrismaClient(),
    env: readAuthEnv(process.env),
  })

  return instance
}

export const auth = {
  handler: (request: Request): Promise<Response> => getAuth().handler(request),
}

export function getSession(headers: Headers): Promise<Session | null> {
  return getAuth().api.getSession({ headers })
}
