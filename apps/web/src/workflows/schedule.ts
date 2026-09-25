import {
  scheduledInstanceId,
  startWorkflow,
  workflowsScheduledAt,
} from "./registry"

/** Every workflow of the fire starts, whichever of them fails to. */
export async function runScheduledWorkflows(
  cron: string,
  scheduledTime: number,
  env: CloudflareEnv
): Promise<string[]> {
  const names = workflowsScheduledAt(cron)

  if (names.length === 0) {
    console.warn(`[workflows] no workflow is scheduled on "${cron}"`)
  }

  const started = await Promise.allSettled(
    names.map((name) =>
      startWorkflow(env, name, scheduledInstanceId(name, scheduledTime))
    )
  )
  const instanceIds: string[] = []

  for (const [index, outcome] of started.entries()) {
    const name = names[index]

    if (outcome.status === "fulfilled") {
      console.info(`[workflows] ${name} started by "${cron}": ${outcome.value}`)
      instanceIds.push(outcome.value)
    } else {
      console.error(
        `[workflows] ${name} did not start on "${cron}"`,
        outcome.reason
      )
    }
  }

  return instanceIds
}
