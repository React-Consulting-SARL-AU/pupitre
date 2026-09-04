export const WORKFLOW_BINDINGS = {
  "expire-enrollments": "EXPIRE_ENROLLMENTS",
  "decommission-server": "DECOMMISSION_SERVER",
  "reconcile-seats": "RECONCILE_SEATS",
  "evaluate-alerts": "EVALUATE_ALERTS",
  "suspend-expired-grace": "SUSPEND_EXPIRED_GRACE",
} as const satisfies Record<string, keyof CloudflareEnv>

export type WorkflowName = keyof typeof WORKFLOW_BINDINGS

export const WORKFLOW_CRONS = {
  "0 * * * *": "expire-enrollments",
  "20 3 * * *": "decommission-server",
  "40 3 * * *": "reconcile-seats",
  "*/5 * * * *": "evaluate-alerts",
  "7 4 * * *": "suspend-expired-grace",
} as const satisfies Record<string, WorkflowName>

export function workflowNamed(value: string): WorkflowName | null {
  return value in WORKFLOW_BINDINGS ? (value as WorkflowName) : null
}

export function workflowScheduledAt(cron: string): WorkflowName | null {
  return WORKFLOW_CRONS[cron as keyof typeof WORKFLOW_CRONS] ?? null
}

export async function startWorkflow(
  env: CloudflareEnv,
  name: WorkflowName
): Promise<string> {
  const instance = await env[WORKFLOW_BINDINGS[name]].create()

  return instance.id
}
