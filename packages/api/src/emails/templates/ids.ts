export const EMAIL_TEMPLATE_IDS = [
  "magic_link",
  "email_change",
  "email_verification",
  "invitation",
  "organization_suspended",
  "organization_restored",
  "organization_closed",
  "server_enrolled",
  "server_assigned",
  "device_added",
  "entitlement_grace",
  "server_suspended",
  "server_suspended_admin",
  "seats_drift",
  "server_decommission",
  "alert_server_unreachable",
  "alert_disk_high",
  "alert_agent_outdated",
  "alert_entitlement_grace",
] as const

export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number]
