import {
  ADMIN_SERVER_ACTIONS,
  type AdminServerAction,
} from "@pupitre/shared/platform-api"

export interface ServerActionTarget {
  status: string
  suspended_reason: string | null
}

export function allowedServerActions(
  { status, suspended_reason }: ServerActionTarget,
  acts: boolean
): AdminServerAction[] {
  if (!acts) {
    return []
  }

  const allowed: Record<AdminServerAction, boolean> = {
    set_channel: status !== "revoked",
    clear_alerts: true,
    suspend: status === "active",
    restore: status === "suspended" && suspended_reason === "admin",
    delete: true,
  }

  return ADMIN_SERVER_ACTIONS.filter((action) => allowed[action])
}

export function withServerActions<Server extends ServerActionTarget>(
  server: Server,
  acts: boolean
): Server & { allowed_actions: AdminServerAction[] } {
  return { ...server, allowed_actions: allowedServerActions(server, acts) }
}
