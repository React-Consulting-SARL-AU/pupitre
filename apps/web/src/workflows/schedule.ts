import { startWorkflow, workflowsScheduledAt } from "./registry"

export async function runScheduledWorkflows(
  cron: string,
  env: CloudflareEnv
): Promise<string[]> {
  const names = workflowsScheduledAt(cron)

  if (names.length === 0) {
    console.warn(`[workflows] no workflow is scheduled on "${cron}"`)
  }

  const instanceIds: string[] = []

  for (const name of names) {
    const instanceId = await startWorkflow(env, name)

    console.info(`[workflows] ${name} started by "${cron}": ${instanceId}`)
    instanceIds.push(instanceId)
  }

  return instanceIds
}
