import type { Device, Server } from "@pupitre/db/cloudflare/client"
import { type Locale, localeOf } from "../lib/i18n"
import { deliver } from "./deliver"
import {
  billingRecipients,
  organizationName,
  type Recipient,
  userRecipient,
} from "./recipients"
import {
  type RenderedEmail,
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
): Promise<void> {
  for (const recipient of recipients) {
    await deliver({ to: recipient.email, ...rendered })
  }
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
