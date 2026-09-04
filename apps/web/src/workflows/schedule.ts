import { startWorkflow, workflowScheduledAt } from "./registry"

export async function runScheduledWorkflow(
  cron: string,
  env: CloudflareEnv
): Promise<string | null> {
  const name = workflowScheduledAt(cron)

  if (!name) {
    console.warn(`[workflows] aucun workflow n'est planifié sur « ${cron} »`)

    return null
  }

  const instanceId = await startWorkflow(env, name)

  console.info(`[workflows] ${name} démarré par « ${cron} » : ${instanceId}`)

  return instanceId
}
