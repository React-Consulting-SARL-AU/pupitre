import type { Locale } from "@pupitre/shared/i18n"
import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import { render, toPlainText } from "@react-email/components"
import type { ReactElement } from "react"
import { consolePath } from "./config"
import { formatDate, formatDateTime } from "./format"
import { type EmailMessageKey, type EmailParams, translateEmail } from "./i18n"
import { AlertAgentOutdatedEmail } from "./templates/alert-agent-outdated"
import { AlertDiskHighEmail } from "./templates/alert-disk-high"
import { AlertEntitlementGraceEmail } from "./templates/alert-entitlement-grace"
import { AlertServerUnreachableEmail } from "./templates/alert-server-unreachable"
import { DeviceAddedEmail } from "./templates/device-added"
import { EmailChangeEmail } from "./templates/email-change"
import { EntitlementGraceEmail } from "./templates/entitlement-grace"
import { InvitationEmail } from "./templates/invitation"
import { MagicLinkEmail } from "./templates/magic-link"
import { SeatsDriftEmail } from "./templates/seats-drift"
import { ServerAssignedEmail } from "./templates/server-assigned"
import { ServerDecommissionEmail } from "./templates/server-decommission"
import { ServerEnrolledEmail } from "./templates/server-enrolled"
import { ServerSuspendedEmail } from "./templates/server-suspended"
import { ServerSuspendedAdminEmail } from "./templates/server-suspended-admin"

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

async function compose(
  locale: Locale,
  subjectKey: EmailMessageKey,
  params: EmailParams,
  element: ReactElement
): Promise<RenderedEmail> {
  const html = await render(element)

  return {
    subject: translateEmail(locale, subjectKey, params),
    html,
    text: toPlainText(html).trim(),
  }
}

export interface MagicLinkInput {
  locale: Locale
  url: string
}

export function renderMagicLinkEmail({
  locale,
  url,
}: MagicLinkInput): Promise<RenderedEmail> {
  return compose(
    locale,
    "magic_link.subject",
    {},
    <MagicLinkEmail locale={locale} url={url} />
  )
}

export interface EmailChangeInput {
  locale: Locale
  url: string
  newEmail: string
}

export function renderEmailChangeEmail({
  locale,
  url,
  newEmail,
}: EmailChangeInput): Promise<RenderedEmail> {
  return compose(
    locale,
    "email_change.subject",
    {},
    <EmailChangeEmail locale={locale} newEmail={newEmail} url={url} />
  )
}

export interface InvitationInput {
  locale: Locale
  url: string
  organizationName: string
  inviterEmail: string
}

export function renderInvitationEmail(
  input: InvitationInput
): Promise<RenderedEmail> {
  return compose(
    input.locale,
    "invitation.subject",
    { organization: input.organizationName, inviter: input.inviterEmail },
    <InvitationEmail {...input} />
  )
}

export interface ServerEnrolledInput {
  locale: Locale
  serverName: string
  address: string
  agentVersion: string
  arch: string
  hostFingerprint: string | null
}

export function renderServerEnrolledEmail(
  input: ServerEnrolledInput
): Promise<RenderedEmail> {
  return compose(
    input.locale,
    "server_enrolled.subject",
    { server: input.serverName },
    <ServerEnrolledEmail {...input} url={consolePath("/dashboard")} />
  )
}

export interface ServerAssignedInput {
  locale: Locale
  serverName: string
  address: string
  organizationName: string
}

export function renderServerAssignedEmail(
  input: ServerAssignedInput
): Promise<RenderedEmail> {
  return compose(
    input.locale,
    "server_assigned.subject",
    { server: input.serverName, organization: input.organizationName },
    <ServerAssignedEmail {...input} url={consolePath("/dashboard")} />
  )
}

export interface DeviceAddedInput {
  locale: Locale
  deviceName: string
  fingerprint: string
  addedAt: Date
}

export function renderDeviceAddedEmail(
  input: DeviceAddedInput
): Promise<RenderedEmail> {
  return compose(
    input.locale,
    "device_added.subject",
    {
      device: input.deviceName,
      date: formatDateTime(input.locale, input.addedAt),
    },
    <DeviceAddedEmail {...input} url={consolePath("/dashboard/settings")} />
  )
}

export interface EntitlementGraceInput {
  locale: Locale
  organizationName: string
  deadline: Date
  serverCount: number
}

export function renderEntitlementGraceEmail(
  input: EntitlementGraceInput
): Promise<RenderedEmail> {
  return compose(
    input.locale,
    "entitlement_grace.subject",
    {
      organization: input.organizationName,
      deadline: formatDate(input.locale, input.deadline),
      count: input.serverCount,
    },
    <EntitlementGraceEmail {...input} url={consolePath("/dashboard/billing")} />
  )
}

export interface ServerSuspendedInput {
  locale: Locale
  organizationName: string
  serverCount: number
}

export function renderServerSuspendedEmail(
  input: ServerSuspendedInput
): Promise<RenderedEmail> {
  return compose(
    input.locale,
    "server_suspended.subject",
    { organization: input.organizationName, count: input.serverCount },
    <ServerSuspendedEmail {...input} url={consolePath("/dashboard/billing")} />
  )
}

export interface ServerSuspendedAdminInput {
  locale: Locale
  organizationName: string
  serverName: string
  address: string
  reason: string
}

export function renderServerSuspendedAdminEmail(
  input: ServerSuspendedAdminInput
): Promise<RenderedEmail> {
  return compose(
    input.locale,
    "server_suspended_admin.subject",
    { organization: input.organizationName, server: input.serverName },
    <ServerSuspendedAdminEmail
      {...input}
      url={`mailto:${LEGAL_CONTACTS.support}`}
    />
  )
}

export interface SeatsDriftInput {
  locale: Locale
  organizationName: string
  paid: number
  seated: number
}

export function renderSeatsDriftEmail(
  input: SeatsDriftInput
): Promise<RenderedEmail> {
  return compose(
    input.locale,
    "seats_drift.subject",
    {
      organization: input.organizationName,
      paid: input.paid,
      seated: input.seated,
    },
    <SeatsDriftEmail {...input} url={consolePath("/dashboard/billing")} />
  )
}

export interface ServerDecommissionInput {
  locale: Locale
  serverName: string
  organizationName: string
  deadline: Date
}

export function renderServerDecommissionEmail(
  input: ServerDecommissionInput
): Promise<RenderedEmail> {
  return compose(
    input.locale,
    "server_decommission.subject",
    {
      server: input.serverName,
      organization: input.organizationName,
      deadline: formatDate(input.locale, input.deadline),
    },
    <ServerDecommissionEmail {...input} url={consolePath("/dashboard")} />
  )
}

export interface AlertServerUnreachableInput {
  locale: Locale
  serverName: string
  address: string
  lastSeenAt: Date | null
}

export function renderAlertServerUnreachableEmail({
  locale,
  serverName,
  address,
  lastSeenAt,
}: AlertServerUnreachableInput): Promise<RenderedEmail> {
  return compose(
    locale,
    "alert_server_unreachable.subject",
    { server: serverName },
    <AlertServerUnreachableEmail
      address={address}
      lastSeen={lastSeenAt ? formatDateTime(locale, lastSeenAt) : "—"}
      locale={locale}
      serverName={serverName}
      url={consolePath("/dashboard/servers")}
    />
  )
}

export interface AlertDiskHighInput {
  locale: Locale
  serverName: string
  address: string
  disk: number
}

export function renderAlertDiskHighEmail({
  locale,
  serverName,
  address,
  disk,
}: AlertDiskHighInput): Promise<RenderedEmail> {
  return compose(
    locale,
    "alert_disk_high.subject",
    { server: serverName, disk: Math.round(disk) },
    <AlertDiskHighEmail
      address={address}
      disk={disk}
      locale={locale}
      serverName={serverName}
      url={consolePath("/dashboard/servers")}
    />
  )
}

export interface AlertAgentOutdatedInput {
  locale: Locale
  serverName: string
  agentVersion: string
  latestVersion: string
}

export function renderAlertAgentOutdatedEmail({
  locale,
  serverName,
  agentVersion,
  latestVersion,
}: AlertAgentOutdatedInput): Promise<RenderedEmail> {
  return compose(
    locale,
    "alert_agent_outdated.subject",
    { server: serverName, current: agentVersion, version: latestVersion },
    <AlertAgentOutdatedEmail
      agentVersion={agentVersion}
      latestVersion={latestVersion}
      locale={locale}
      serverName={serverName}
      url={consolePath("/dashboard/servers")}
    />
  )
}

export interface AlertEntitlementGraceInput {
  locale: Locale
  serverName: string
  organizationName: string
  deadline: Date
}

export function renderAlertEntitlementGraceEmail({
  locale,
  serverName,
  organizationName,
  deadline,
}: AlertEntitlementGraceInput): Promise<RenderedEmail> {
  return compose(
    locale,
    "alert_entitlement_grace.subject",
    { server: serverName },
    <AlertEntitlementGraceEmail
      deadline={formatDate(locale, deadline)}
      locale={locale}
      organizationName={organizationName}
      serverName={serverName}
      url={consolePath("/dashboard/billing")}
    />
  )
}
