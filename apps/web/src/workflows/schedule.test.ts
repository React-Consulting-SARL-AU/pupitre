import { describe, expect, it } from "bun:test"
import { WORKFLOW_BINDINGS, WORKFLOW_CRONS } from "./registry"
import { runScheduledWorkflow } from "./schedule"

function envRecording(started: string[]): CloudflareEnv {
  const workflow = (name: string) => ({
    create: () => {
      started.push(name)

      return Promise.resolve({ id: `instance-${name}` })
    },
  })

  return {
    EXPIRE_ENROLLMENTS: workflow("expire-enrollments"),
    DECOMMISSION_SERVER: workflow("decommission-server"),
    RECONCILE_SEATS: workflow("reconcile-seats"),
    EVALUATE_ALERTS: workflow("evaluate-alerts"),
    SUSPEND_EXPIRED_GRACE: workflow("suspend-expired-grace"),
  } as unknown as CloudflareEnv
}

describe("les cron triggers", () => {
  it("couvrent chaque workflow une fois", () => {
    const scheduled: string[] = [...Object.values(WORKFLOW_CRONS)]

    expect(scheduled.sort()).toEqual(Object.keys(WORKFLOW_BINDINGS).sort())
  })

  it("démarre l'horaire toutes les heures", async () => {
    const started: string[] = []

    await runScheduledWorkflow("0 * * * *", envRecording(started))

    expect(started).toEqual(["expire-enrollments"])
  })

  it("démarre les quotidiens une fois par jour", async () => {
    const started: string[] = []
    const env = envRecording(started)

    await runScheduledWorkflow("20 3 * * *", env)
    await runScheduledWorkflow("40 3 * * *", env)
    await runScheduledWorkflow("7 4 * * *", env)

    expect(started).toEqual([
      "decommission-server",
      "reconcile-seats",
      "suspend-expired-grace",
    ])
  })

  it("démarre l'évaluation des alertes toutes les cinq minutes", async () => {
    const started: string[] = []

    await runScheduledWorkflow("*/5 * * * *", envRecording(started))

    expect(started).toEqual(["evaluate-alerts"])
  })

  it("ne démarre rien sur un cron inconnu", async () => {
    const started: string[] = []

    expect(
      await runScheduledWorkflow("* * * * *", envRecording(started))
    ).toBeNull()
    expect(started).toEqual([])
  })
})
