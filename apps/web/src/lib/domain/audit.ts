export const AUDIT_ACTIONS = [
  "server.enrolled",
  "server.exchanged",
  "server.assigned",
  "server.unassigned",
  "server.device_revoked",
  "server.deleted",
  "device.added",
  "device.revoked",
  "member.invited",
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

const LABELS: Record<AuditAction, string> = {
  "server.enrolled": "Serveur enrôlé",
  "server.exchanged": "Agent installé",
  "server.assigned": "Serveur attribué",
  "server.unassigned": "Attribution retirée",
  "server.device_revoked": "Appareil retiré d'un serveur",
  "server.deleted": "Serveur supprimé",
  "device.added": "Appareil ajouté",
  "device.revoked": "Appareil révoqué",
  "member.invited": "Invitation envoyée",
  "subscription.created": "Abonnement créé",
  "subscription.updated": "Abonnement modifié",
  "subscription.canceled": "Abonnement annulé",
}

const TARGET_LABELS: Record<string, string> = {
  server: "Serveur",
  device: "Appareil",
  invitation: "Invitation",
  subscription: "Abonnement",
  release: "Version",
}

export function actionLabel(action: string): string {
  return LABELS[action as AuditAction] ?? action
}

export function targetLabel(targetType: string): string {
  return TARGET_LABELS[targetType] ?? targetType
}

export const EVENTS_PER_PAGE = 25
