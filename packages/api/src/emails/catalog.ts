import type { Locale } from "@pupitre/shared/i18n"
import { consoleUrl } from "./config"
import {
  type RenderedEmail,
  renderAlertAgentOutdatedEmail,
  renderAlertDiskHighEmail,
  renderAlertEntitlementGraceEmail,
  renderAlertServerUnreachableEmail,
  renderDeviceAddedEmail,
  renderEmailChangeEmail,
  renderEmailVerificationEmail,
  renderEntitlementGraceEmail,
  renderInvitationEmail,
  renderMagicLinkEmail,
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
import { EMAIL_TEMPLATE_IDS, type EmailTemplateId } from "./templates/ids"

export const SAMPLE = {
  consoleUrl: consoleUrl(),
  magicLinkUrl: `${consoleUrl()}/api/auth/magic-link/verify?token=8f3c1d94a0b74e2f&callbackURL=%2Fdashboard`,
  invitationUrl: `${consoleUrl()}/auth/invitation/inv_7a1c2e`,
  emailChangeUrl: `${consoleUrl()}/api/auth/verify-email?token=1b7d0e5c9a24f8&callbackURL=%2Fdashboard%2Fsettings`,
  emailVerificationUrl: `${consoleUrl()}/api/auth/verify-email?token=5c2b8e10d7f43a&callbackURL=%2Fdashboard`,
  newEmail: "camille@ferrand.studio",
  organizationName: "Atelier Ferrand",
  inviterEmail: "camille@atelier-ferrand.fr",
  serverName: "vps-paris-01",
  address: "dev@203.0.113.24:22",
  agentVersion: "1.4.0",
  arch: "amd64",
  hostFingerprint: "SHA256:9zXk2Qm4pR7vN1sT6yB0cL3hJ8aF5dE2wU9iO4gK7xM",
  deviceName: "MacBook Pro",
  deviceFingerprint: "SHA256:3aQ7pL0mV2xR9tK5wY8bN1cJ6hD4fS0uE7gZ2iO5nT8",
  addedAt: new Date("2026-09-04T09:12:00Z"),
  deadline: new Date("2026-09-11T00:00:00Z"),
  serverCount: 3,
  lastSeenAt: new Date("2026-09-04T08:41:00Z"),
  disk: 94,
  latestVersion: "1.6.0",
  suspensionReason:
    "Signalement 4412 : balayage réseau sortant depuis la machine.",
  paidSeats: 2,
} as const

export interface EmailPreview {
  id: EmailTemplateId
  render: (locale: Locale) => Promise<RenderedEmail>
}

const RENDERERS: Record<
  EmailTemplateId,
  (locale: Locale) => Promise<RenderedEmail>
> = {
  magic_link: (locale) =>
    renderMagicLinkEmail({ locale, url: SAMPLE.magicLinkUrl }),
  email_change: (locale) =>
    renderEmailChangeEmail({
      locale,
      url: SAMPLE.emailChangeUrl,
      newEmail: SAMPLE.newEmail,
    }),
  email_verification: (locale) =>
    renderEmailVerificationEmail({
      locale,
      url: SAMPLE.emailVerificationUrl,
    }),
  organization_suspended: (locale) =>
    renderOrganizationSuspendedEmail({
      locale,
      organizationName: SAMPLE.organizationName,
      reason: SAMPLE.suspensionReason,
      serverCount: SAMPLE.serverCount,
    }),
  organization_restored: (locale) =>
    renderOrganizationRestoredEmail({
      locale,
      organizationName: SAMPLE.organizationName,
      serverCount: SAMPLE.serverCount,
    }),
  organization_closed: (locale) =>
    renderOrganizationClosedEmail({
      locale,
      organizationName: SAMPLE.organizationName,
      reason: SAMPLE.suspensionReason,
    }),
  invitation: (locale) =>
    renderInvitationEmail({
      locale,
      url: SAMPLE.invitationUrl,
      organizationName: SAMPLE.organizationName,
      inviterEmail: SAMPLE.inviterEmail,
    }),
  server_enrolled: (locale) =>
    renderServerEnrolledEmail({
      locale,
      serverName: SAMPLE.serverName,
      address: SAMPLE.address,
      agentVersion: SAMPLE.agentVersion,
      arch: SAMPLE.arch,
      hostFingerprint: SAMPLE.hostFingerprint,
    }),
  server_assigned: (locale) =>
    renderServerAssignedEmail({
      locale,
      serverName: SAMPLE.serverName,
      address: SAMPLE.address,
      organizationName: SAMPLE.organizationName,
    }),
  device_added: (locale) =>
    renderDeviceAddedEmail({
      locale,
      deviceName: SAMPLE.deviceName,
      fingerprint: SAMPLE.deviceFingerprint,
      addedAt: SAMPLE.addedAt,
    }),
  entitlement_grace: (locale) =>
    renderEntitlementGraceEmail({
      locale,
      organizationName: SAMPLE.organizationName,
      deadline: SAMPLE.deadline,
      serverCount: SAMPLE.serverCount,
    }),
  server_suspended: (locale) =>
    renderServerSuspendedEmail({
      locale,
      organizationName: SAMPLE.organizationName,
      serverCount: SAMPLE.serverCount,
    }),
  server_suspended_admin: (locale) =>
    renderServerSuspendedAdminEmail({
      locale,
      organizationName: SAMPLE.organizationName,
      serverName: SAMPLE.serverName,
      address: SAMPLE.address,
      reason: SAMPLE.suspensionReason,
    }),
  seats_drift: (locale) =>
    renderSeatsDriftEmail({
      locale,
      organizationName: SAMPLE.organizationName,
      paid: SAMPLE.paidSeats,
      seated: SAMPLE.serverCount,
    }),
  server_decommission: (locale) =>
    renderServerDecommissionEmail({
      locale,
      serverName: SAMPLE.serverName,
      organizationName: SAMPLE.organizationName,
      deadline: SAMPLE.deadline,
    }),
  alert_server_unreachable: (locale) =>
    renderAlertServerUnreachableEmail({
      locale,
      serverName: SAMPLE.serverName,
      address: SAMPLE.address,
      lastSeenAt: SAMPLE.lastSeenAt,
    }),
  alert_disk_high: (locale) =>
    renderAlertDiskHighEmail({
      locale,
      serverName: SAMPLE.serverName,
      address: SAMPLE.address,
      disk: SAMPLE.disk,
    }),
  alert_agent_outdated: (locale) =>
    renderAlertAgentOutdatedEmail({
      locale,
      serverName: SAMPLE.serverName,
      agentVersion: SAMPLE.agentVersion,
      latestVersion: SAMPLE.latestVersion,
    }),
  alert_entitlement_grace: (locale) =>
    renderAlertEntitlementGraceEmail({
      locale,
      serverName: SAMPLE.serverName,
      organizationName: SAMPLE.organizationName,
      deadline: SAMPLE.deadline,
    }),
}

export const EMAIL_PREVIEWS: EmailPreview[] = EMAIL_TEMPLATE_IDS.map((id) => ({
  id,
  render: RENDERERS[id],
}))

export function previewOf(id: EmailTemplateId): EmailPreview {
  return { id, render: RENDERERS[id] }
}
