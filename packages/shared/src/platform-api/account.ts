import { z } from "zod"
import { LOCALES } from "../i18n/locale"
import { ORG_ROLES } from "../permissions"
import { MeLicenseGrantSchema, MeServersSchema } from "../plans"
import { ORGANIZATION_STATES } from "../platform"
import { ReleaseChannelSchema } from "../releases"
import {
  AccountLicenseSchema,
  InstantSchema,
  ServerStatusSchema,
} from "./index"

const OrgRoleSchema = z.enum(ORG_ROLES)

const OrganizationSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  state: z.enum(ORGANIZATION_STATES),
})

const MembershipSchema = OrganizationSummarySchema.extend({
  role: z.string(),
})

const ActiveOrganizationSchema = OrganizationSummarySchema.extend({
  reason: z.string().nullable(),
})

export const DataConsentSchema = z.object({
  version: z.string().min(1),
  accepted_at: InstantSchema,
})

export type DataConsent = z.infer<typeof DataConsentSchema>

// What `POST /me/consent` records: the version the screen showed, refused unless it is the current one.
export const DataConsentRequestSchema = z.object({
  version: z.string().min(1),
})

export const MeSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    image: z.string().nullable(),
    locale: z.enum(LOCALES),
    created_at: InstantSchema,
  }),
  organizations: z.array(MembershipSchema),
  active_organization: ActiveOrganizationSchema.nullable(),
  role: OrgRoleSchema.nullable(),
  platform_role: OrgRoleSchema.nullable(),
  // A new app may read an older platform during a release: an absent right reads as none.
  platform_can_act: z.boolean().default(false),
  license: AccountLicenseSchema,
  // Null without an active organization.
  servers: MeServersSchema.nullable(),
  license_grant: MeLicenseGrantSchema.nullable(),
  // The text the account last agreed to, with its date; null until then. Absent from an older platform.
  data_consent: DataConsentSchema.nullable().default(null),
  // For apps older than the licence, which read these instead of `license` and `license_grant`.
  entitlement: AccountLicenseSchema,
  subscription: z.null(),
})

export type Me = z.infer<typeof MeSchema>

export const ServerForUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string().nullable(),
  port: z.int(),
  user: z.string(),
  host_fingerprint: z.string().nullable(),
  status: ServerStatusSchema,
  key_ready: z.boolean(),
  organization: z.object({ id: z.string(), name: z.string() }),
})

export type ServerForUser = z.infer<typeof ServerForUserSchema>

export const DeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  public_key: z.string(),
  fingerprint: z.string(),
  last_used_at: InstantSchema.nullable(),
  created_at: InstantSchema,
})

export type Device = z.infer<typeof DeviceSchema>

export const ServerEnrollmentSchema = z.object({
  server_id: z.string(),
  enrollment_token: z.string(),
  release: z.object({
    version: z.string(),
    url: z.string(),
    sha256: z.string(),
    signature: z.string(),
    channel: ReleaseChannelSchema,
  }),
})

export type ServerEnrollment = z.infer<typeof ServerEnrollmentSchema>

// Enough to name and verify a version of the agent, not to read it.
export const LatestAgentReleaseSchema = z.object({
  version: z.string(),
  arch: z.string(),
  sha256: z.string(),
  signature: z.string(),
})

export type LatestAgentRelease = z.infer<typeof LatestAgentReleaseSchema>

export const KeyApprovalReceiptSchema = z.object({
  server_id: z.string(),
  device_id: z.string(),
  signer: z.string(),
  issued_at: z.string(),
})

export type KeyApprovalReceipt = z.infer<typeof KeyApprovalReceiptSchema>

export function listOf<Item extends z.ZodType>(item: Item) {
  return z.object({ data: z.array(item) })
}

export function recordOf<Item extends z.ZodType>(item: Item) {
  return z.object({ data: item })
}
