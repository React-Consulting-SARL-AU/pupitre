export const WORKFLOW_BINDINGS = {
  "expire-enrollments": "EXPIRE_ENROLLMENTS",
  "decommission-server": "DECOMMISSION_SERVER",
  "reconcile-seats": "RECONCILE_SEATS",
  "evaluate-alerts": "EVALUATE_ALERTS",
  "suspend-expired-grace": "SUSPEND_EXPIRED_GRACE",
  "purge-deletions": "PURGE_DELETIONS",
} as const satisfies Record<string, keyof CloudflareEnv>

export type WorkflowName = keyof typeof WORKFLOW_BINDINGS

/**
 * One cron starts several workflows: the database wakes once for the hour's
 * work and once for the day's, and sleeps the rest of the time. An
 * unreachable server is one without a heartbeat for thirty minutes, and an
 * alert an hour later is the same alert.
 */
export const WORKFLOW_CRONS = {
  "0 * * * *": ["expire-enrollments", "evaluate-alerts"],
  "20 3 * * *": [
    "decommission-server",
    "reconcile-seats",
    "suspend-expired-grace",
    "purge-deletions",
  ],
} as const satisfies Record<string, readonly WorkflowName[]>

export function workflowNamed(value: string): WorkflowName | null {
  return value in WORKFLOW_BINDINGS ? (value as WorkflowName) : null
}

export function workflowsScheduledAt(cron: string): readonly WorkflowName[] {
  return WORKFLOW_CRONS[cron as keyof typeof WORKFLOW_CRONS] ?? []
}

/** The instance a cron fire starts: a second delivery of the same fire names the same instance, which Cloudflare refuses. */
export function scheduledInstanceId(
  name: WorkflowName,
  scheduledTime: number
): string {
  return `${name}-${scheduledTime}`
}

export async function startWorkflow(
  env: CloudflareEnv,
  name: WorkflowName,
  id?: string
): Promise<string> {
  const instance = await env[WORKFLOW_BINDINGS[name]].create(
    id === undefined ? undefined : { id }
  )

  return instance.id
}
