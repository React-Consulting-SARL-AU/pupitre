export const WORKFLOW_BINDINGS = {
  "expire-enrollments": "EXPIRE_ENROLLMENTS",
  "decommission-server": "DECOMMISSION_SERVER",
  "reconcile-seats": "RECONCILE_SEATS",
  "evaluate-alerts": "EVALUATE_ALERTS",
  "suspend-expired-grace": "SUSPEND_EXPIRED_GRACE",
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
  ],
} as const satisfies Record<string, readonly WorkflowName[]>

export function workflowNamed(value: string): WorkflowName | null {
  return value in WORKFLOW_BINDINGS ? (value as WorkflowName) : null
}

export function workflowsScheduledAt(cron: string): readonly WorkflowName[] {
  return WORKFLOW_CRONS[cron as keyof typeof WORKFLOW_CRONS] ?? []
}

export async function startWorkflow(
  env: CloudflareEnv,
  name: WorkflowName
): Promise<string> {
  const instance = await env[WORKFLOW_BINDINGS[name]].create()

  return instance.id
}
