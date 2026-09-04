import type { Device, Server } from "@pupitre/db/cloudflare/client"
import { type Locale, localeOf } from "../lib/i18n"
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
  renderAlertDiskHighEmail,
  renderAlertEntitlementGraceEmail,
  renderAlertServerUnreachableEmail,
  renderDeviceAddedEmail,
  renderEntitlementGraceEmail,
  renderServerAssignedEmail,
  renderServerDecommissionEmail,
  renderServerEnrolledEmail,
  renderServerSuspendedEmail,
} from "./render"

export interface Addressed {
  acceptLanguage?: string | null
}

function addressOf(server: Server): string {
  return server.host
    ? `${server.sshUser}@${server.host}:${server.port}`
    : server.name
}

async function deliverTo(
  recipients: Recipient[],
  rendered: RenderedEmail
): Promise<boolean> {
  let delivered = false

  for (const recipient of recipients) {
    const sent = await deliver({ to: recipient.email, ...rendered })

    delivered = delivered || sent
  }

  return delivered
}

function localeFrom(input: Addressed): Locale {
  return localeOf(input.acceptLanguage)
}

export interface ServerEnrolledInput extends Addressed {
  server: Server
}

export async function sendServerEnrolledEmail({
  server,
  ...input
}: ServerEnrolledInput): Promise<void> {
  const recipient = await userRecipient(server.assignedUserId)

  if (!recipient) {
    return
  }

  await deliverTo(
    [recipient],
    await renderServerEnrolledEmail({
      locale: localeFrom(input),
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
  server: Server
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

  await deliverTo(
    [recipient],
    await renderServerAssignedEmail({
      locale: localeFrom(input),
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

  await deliverTo(
    [recipient],
    await renderDeviceAddedEmail({
      locale: localeFrom(input),
      deviceName: device.name,
      fingerprint: device.fingerprint,
      addedAt: device.createdAt,
    })
  )
}

export interface EntitlementGraceInput extends Addressed {
  organizationId: string
  deadline: Date
  serverCount: number
}

export async function sendEntitlementGraceEmail({
  organizationId,
  deadline,
  serverCount,
  ...input
}: EntitlementGraceInput): Promise<void> {
  if (serverCount === 0) {
    return
  }

  const [recipients, organization] = await Promise.all([
    billingRecipients(organizationId),
    organizationName(organizationId),
  ])

  await deliverTo(
    recipients,
    await renderEntitlementGraceEmail({
      locale: localeFrom(input),
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

  await deliverTo(
    recipients,
    await renderServerSuspendedEmail({
      locale: localeFrom(input),
      organizationName: organization,
      serverCount,
    })
  )
}

export interface ServerDecommissionInput extends Addressed {
  server: Server
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

  await deliverTo(
    [recipient],
    await renderServerDecommissionEmail({
      locale: localeFrom(input),
      serverName: server.name,
      organizationName: organization,
      deadline,
    })
  )
}

export interface ServerUnreachableInput extends Addressed {
  server: Server
  lastSeenAt: Date | null
}

export async function sendServerUnreachableEmail({
  server,
  lastSeenAt,
  ...input
}: ServerUnreachableInput): Promise<boolean> {
  return await deliverTo(
    await serverRecipients(server),
    await renderAlertServerUnreachableEmail({
      locale: localeFrom(input),
      serverName: server.name,
      address: addressOf(server),
      lastSeenAt,
    })
  )
}

export interface DiskHighInput extends Addressed {
  server: Server
  disk: number
}

export async function sendDiskHighEmail({
  server,
  disk,
  ...input
}: DiskHighInput): Promise<boolean> {
  return await deliverTo(
    await serverRecipients(server),
    await renderAlertDiskHighEmail({
      locale: localeFrom(input),
      serverName: server.name,
      address: addressOf(server),
      disk,
    })
  )
}

export interface AgentOutdatedInput extends Addressed {
  server: Server
  latestVersion: string
}

export async function sendAgentOutdatedEmail({
  server,
  latestVersion,
  ...input
}: AgentOutdatedInput): Promise<boolean> {
  return await deliverTo(
    await serverRecipients(server),
    await renderAlertAgentOutdatedEmail({
      locale: localeFrom(input),
      serverName: server.name,
      agentVersion: server.agentVersion ?? "—",
      latestVersion,
    })
  )
}

export interface ServerGraceInput extends Addressed {
  server: Server
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

  return await deliverTo(
    recipients,
    await renderAlertEntitlementGraceEmail({
      locale: localeFrom(input),
      serverName: server.name,
      organizationName: organization,
      deadline,
    })
  )
}
