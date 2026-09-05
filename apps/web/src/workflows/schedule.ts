import { startWorkflow, workflowScheduledAt } from "./registry"

export async function runScheduledWorkflow(
  cron: string,
  env: CloudflareEnv
): Promise<string | null> {
  const name = workflowScheduledAt(cron)

  if (!name) {
    console.warn(`[workflows] no workflow is scheduled on "${cron}"`)

    return null
  }

  const instanceId = await startWorkflow(env, name)

  console.info(`[workflows] ${name} started by "${cron}": ${instanceId}`)

  return instanceId
}
