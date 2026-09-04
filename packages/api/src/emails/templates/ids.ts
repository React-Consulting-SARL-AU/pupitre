export const EMAIL_TEMPLATE_IDS = [
  "magic_link",
  "invitation",
  "server_enrolled",
  "server_assigned",
  "device_added",
  "entitlement_grace",
  "server_suspended",
  "server_decommission",
] as const

export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number]
