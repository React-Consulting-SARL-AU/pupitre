import { describe, expect, it } from "bun:test"
import { WORKFLOW_BINDINGS, WORKFLOW_CRONS } from "./registry"
import { runScheduledWorkflows } from "./schedule"

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
  it("couvrent chaque workflow une fois, en deux réveils", () => {
    const scheduled: string[] = Object.values(WORKFLOW_CRONS).flat()

    expect(scheduled.sort()).toEqual(Object.keys(WORKFLOW_BINDINGS).sort())
    expect(Object.keys(WORKFLOW_CRONS)).toHaveLength(2)
  })

  it("démarre les horaires ensemble, toutes les heures", async () => {
    const started: string[] = []

    expect(
      await runScheduledWorkflows("0 * * * *", envRecording(started))
    ).toEqual(["instance-expire-enrollments", "instance-evaluate-alerts"])
    expect(started).toEqual(["expire-enrollments", "evaluate-alerts"])
  })

  it("démarre les quotidiens ensemble, une fois par jour", async () => {
    const started: string[] = []

    await runScheduledWorkflows("20 3 * * *", envRecording(started))

    expect(started).toEqual([
      "decommission-server",
      "reconcile-seats",
      "suspend-expired-grace",
    ])
  })

  it("ne démarre rien sur un cron inconnu", async () => {
    const started: string[] = []

    expect(
      await runScheduledWorkflows("* * * * *", envRecording(started))
    ).toEqual([])
    expect(started).toEqual([])
  })
})
