import type { Device } from "@pupitre/db/cloudflare/client"
import { type Locale, localeOf } from "@pupitre/shared/i18n"
import type { ServerRow } from "../lib/servers/server-row"
import { deliver } from "./deliver"
import {
  billingRecipients,
  organizationName,
  type Recipient,
  serverRecipients,
  userRecipient,
} from "./recipients"
import {
  type RenderedEmail,
  renderAlertAgentOutdatedEmail,
  renderAlertBackupFailedEmail,
  renderAlertBackupStaleEmail,
  renderAlertDiskHighEmail,
  renderAlertLicenseGraceEmail,
  renderAlertServerUnreachableEmail,
  renderDeviceAddedEmail,
  renderLicenseGraceEmail,
  renderOrganizationClosedEmail,
  renderOrganizationRestoredEmail,
  renderOrganizationSuspendedEmail,
  renderSeatsDriftEmail,
  renderServerAssignedEmail,
  renderServerDecommissionEmail,
  renderServerEnrolledEmail,
  renderServerSuspendedAdminEmail,
  renderServerSuspendedEmail,
} from "./render"

export interface Addressed {
  acceptLanguage?: string | null
}

type RenderFor = (locale: Locale) => Promise<RenderedEmail>

function addressOf(server: ServerRow): string {
  return server.host
    ? `${server.sshUser}@${server.host}:${server.port}`
    : server.name
}

// A scheduled task has no request header, so each recipient's registered locale decides.
async function deliverTo(
  recipients: Recipient[],
  input: Addressed,
  render: RenderFor
): Promise<boolean> {
  const fallback = localeOf(input.acceptLanguage)
  const byLocale = new Map<Locale, RenderedEmail>()
  let delivered = false

  for (const recipient of recipients) {
    const locale = recipient.locale ?? fallback
    let rendered = byLocale.get(locale)

    if (!rendered) {
      rendered = await render(locale)
      byLocale.set(locale, rendered)
    }

    const sent = await deliver({ to: recipient.email, ...rendered })

    delivered = delivered || sent
  }

  return delivered
}

export interface ServerEnrolledInput extends Addressed {
  server: ServerRow
}

export async function sendServerEnrolledEmail({
  server,
  ...input
}: ServerEnrolledInput): Promise<void> {
  const recipient = await userRecipient(server.assignedUserId)

  if (!recipient) {
    return
  }

  await deliverTo([recipient], input, (locale) =>
    renderServerEnrolledEmail({
      locale,
      serverName: server.name,
      address: addressOf(server),
      agentVersion: server.agentVersion ?? "—",
      arch: server.arch,
      hostFingerprint: server.hostFingerprint,
    })
  )
}

export interface ServerAssignedInput extends Addressed {
  userId: string
  server: ServerRow
}

export async function sendServerAssignedEmail({
  userId,
  server,
  ...input
}: ServerAssignedInput): Promise<void> {
  const [recipient, organization] = await Promise.all([
    userRecipient(userId),
    organizationName(server.organizationId),
  ])

  if (!recipient) {
    return
  }

  await deliverTo([recipient], input, (locale) =>
    renderServerAssignedEmail({
      locale,
      serverName: server.name,
      address: addressOf(server),
      organizationName: organization,
    })
  )
}

export interface DeviceAddedInput extends Addressed {
  userId: string
  device: Device
}

export async function sendDeviceAddedEmail({
  userId,
  device,
  ...input
}: DeviceAddedInput): Promise<void> {
  const recipient = await userRecipient(userId)

  if (!recipient) {
    return
  }

  await deliverTo([recipient], input, (locale) =>
    renderDeviceAddedEmail({
      locale,
      deviceName: device.name,
      fingerprint: device.fingerprint,
      addedAt: device.createdAt,
    })
  )
}

export interface LicenseGraceInput extends Addressed {
  organizationId: string
  deadline: Date
  serverCount: number
}

export async function sendLicenseGraceEmail({
  organizationId,
  deadline,
  serverCount,
  ...input
}: LicenseGraceInput): Promise<void> {
  if (serverCount === 0) {
    return
  }

  const [recipients, organization] = await Promise.all([
    billingRecipients(organizationId),
    organizationName(organizationId),
  ])

  await deliverTo(recipients, input, (locale) =>
    renderLicenseGraceEmail({
      locale,
      organizationName: organization,
      deadline,
      serverCount,
    })
  )
}

export interface ServerSuspendedInput extends Addressed {
  organizationId: string
  serverCount: number
}

export async function sendServerSuspendedEmail({
  organizationId,
  serverCount,
  ...input
}: ServerSuspendedInput): Promise<void> {
  if (serverCount === 0) {
    return
  }

  const [recipients, organization] = await Promise.all([
    billingRecipients(organizationId),
    organizationName(organizationId),
  ])

  await deliverTo(recipients, input, (locale) =>
    renderServerSuspendedEmail({
      locale,
      organizationName: organization,
      serverCount,
    })
  )
}

export interface ServerSuspendedByAdminInput extends Addressed {
  server: ServerRow
  reason: string
}

export async function sendServerSuspendedByAdminEmail({
  server,
  reason,
  ...input
}: ServerSuspendedByAdminInput): Promise<void> {
  const [recipients, organization] = await Promise.all([
    billingRecipients(server.organizationId),
    organizationName(server.organizationId),
  ])

  await deliverTo(recipients, input, (locale) =>
    renderServerSuspendedAdminEmail({
      locale,
      organizationName: organization,
      serverName: server.name,
      address: addressOf(server),
      reason,
    })
  )
}

export interface OrganizationSuspendedInput extends Addressed {
  organizationId: string
  reason: string
  serverCount: number
}

export async function sendOrganizationSuspendedEmail({
  organizationId,
  reason,
  serverCount,
  ...input
}: OrganizationSuspendedInput): Promise<void> {
  const [recipients, organization] = await Promise.all([
    billingRecipients(organizationId),
    organizationName(organizationId),
  ])

  await deliverTo(recipients, input, (locale) =>
    renderOrganizationSuspendedEmail({
      locale,
      organizationName: organization,
      reason,
      serverCount,
    })
  )
}

export interface OrganizationRestoredInput extends Addressed {
  organizationId: string
  serverCount: number
}

export async function sendOrganizationRestoredEmail({
  organizationId,
  serverCount,
  ...input
}: OrganizationRestoredInput): Promise<void> {
  const [recipients, organization] = await Promise.all([
    billingRecipients(organizationId),
    organizationName(organizationId),
  ])

  await deliverTo(recipients, input, (locale) =>
    renderOrganizationRestoredEmail({
      locale,
      organizationName: organization,
      serverCount,
    })
  )
}

export interface OrganizationClosedInput extends Addressed {
  organizationId: string
  reason: string
}

export async function sendOrganizationClosedEmail({
  organizationId,
  reason,
  ...input
}: OrganizationClosedInput): Promise<void> {
  const [recipients, organization] = await Promise.all([
    billingRecipients(organizationId),
    organizationName(organizationId),
  ])

  await deliverTo(recipients, input, (locale) =>
    renderOrganizationClosedEmail({
      locale,
      organizationName: organization,
      reason,
    })
  )
}

export interface SeatsDriftInput extends Addressed {
  organizationId: string
  paid: number
  seated: number
}

export async function sendSeatsDriftEmail({
  organizationId,
  paid,
  seated,
  ...input
}: SeatsDriftInput): Promise<void> {
  const [recipients, organization] = await Promise.all([
    billingRecipients(organizationId),
    organizationName(organizationId),
  ])

  await deliverTo(recipients, input, (locale) =>
    renderSeatsDriftEmail({
      locale,
      organizationName: organization,
      paid,
      seated,
    })
  )
}

export interface ServerDecommissionInput extends Addressed {
  server: ServerRow
  deadline: Date
}

export async function sendServerDecommissionEmail({
  server,
  deadline,
  ...input
}: ServerDecommissionInput): Promise<void> {
  const [recipient, organization] = await Promise.all([
    userRecipient(server.assignedUserId),
    organizationName(server.organizationId),
  ])

  if (!recipient) {
    return
  }

  await deliverTo([recipient], input, (locale) =>
    renderServerDecommissionEmail({
      locale,
      serverName: server.name,
      organizationName: organization,
      deadline,
    })
  )
}

export interface ServerUnreachableInput extends Addressed {
  server: ServerRow
  lastSeenAt: Date | null
}

export async function sendServerUnreachableEmail({
  server,
  lastSeenAt,
  ...input
}: ServerUnreachableInput): Promise<boolean> {
  return await deliverTo(await serverRecipients(server), input, (locale) =>
    renderAlertServerUnreachableEmail({
      locale,
      serverName: server.name,
      address: addressOf(server),
      lastSeenAt,
    })
  )
}

export interface DiskHighInput extends Addressed {
  server: ServerRow
  disk: number
}

export async function sendDiskHighEmail({
  server,
  disk,
  ...input
}: DiskHighInput): Promise<boolean> {
  return await deliverTo(await serverRecipients(server), input, (locale) =>
    renderAlertDiskHighEmail({
      locale,
      serverName: server.name,
      address: addressOf(server),
      disk,
    })
  )
}

export interface AgentOutdatedInput extends Addressed {
  server: ServerRow
  latestVersion: string
}

export async function sendAgentOutdatedEmail({
  server,
  latestVersion,
  ...input
}: AgentOutdatedInput): Promise<boolean> {
  return await deliverTo(await serverRecipients(server), input, (locale) =>
    renderAlertAgentOutdatedEmail({
      locale,
      serverName: server.name,
      agentVersion: server.agentVersion ?? "—",
      latestVersion,
    })
  )
}

export interface BackupFailedInput extends Addressed {
  server: ServerRow
  lastError: string | null
  missing: number
  lastRunAt: Date | null
}

export async function sendBackupFailedEmail({
  server,
  lastError,
  missing,
  lastRunAt,
  ...input
}: BackupFailedInput): Promise<boolean> {
  return await deliverTo(await serverRecipients(server), input, (locale) =>
    renderAlertBackupFailedEmail({
      locale,
      serverName: server.name,
      lastError,
      missing,
      lastRunAt,
    })
  )
}

export interface BackupStaleInput extends Addressed {
  server: ServerRow
  lastOkAt: Date | null
  intervalHours: number
}

export async function sendBackupStaleEmail({
  server,
  lastOkAt,
  intervalHours,
  ...input
}: BackupStaleInput): Promise<boolean> {
  return await deliverTo(await serverRecipients(server), input, (locale) =>
    renderAlertBackupStaleEmail({
      locale,
      serverName: server.name,
      lastOkAt,
      intervalHours,
    })
  )
}

export interface ServerGraceInput extends Addressed {
  server: ServerRow
  deadline: Date
}

export async function sendServerGraceEmail({
  server,
  deadline,
  ...input
}: ServerGraceInput): Promise<boolean> {
  const [recipients, organization] = await Promise.all([
    serverRecipients(server),
    organizationName(server.organizationId),
  ])

  return await deliverTo(recipients, input, (locale) =>
    renderAlertLicenseGraceEmail({
      locale,
      serverName: server.name,
      organizationName: organization,
      deadline,
    })
  )
}
