import { describe, expect, it } from "bun:test"
import { WORKFLOW_BINDINGS, WORKFLOW_CRONS } from "./registry"
import { runScheduledWorkflows } from "./schedule"

const FIRED_AT = 1_790_000_000_000

interface Started {
  name: string
  id: string | undefined
}

function envRecording(
  started: Started[],
  failing: readonly string[] = []
): CloudflareEnv {
  const workflow = (name: string) => ({
    create: (options?: { id?: string }) => {
      if (failing.includes(name)) {
        return Promise.reject(new Error(`${name} is down`))
      }

      started.push({ name, id: options?.id })

      return Promise.resolve({ id: options?.id ?? `instance-${name}` })
    },
  })

  return {
    EXPIRE_ENROLLMENTS: workflow("expire-enrollments"),
    DECOMMISSION_SERVER: workflow("decommission-server"),
    RECONCILE_SEATS: workflow("reconcile-seats"),
    EVALUATE_ALERTS: workflow("evaluate-alerts"),
    SUSPEND_EXPIRED_GRACE: workflow("suspend-expired-grace"),
    PURGE_DELETIONS: workflow("purge-deletions"),
  } as unknown as CloudflareEnv
}

describe("the cron triggers", () => {
  it("cover each workflow once, in two wake-ups", () => {
    const scheduled: string[] = Object.values(WORKFLOW_CRONS).flat()

    expect(scheduled.sort()).toEqual(Object.keys(WORKFLOW_BINDINGS).sort())
    expect(Object.keys(WORKFLOW_CRONS)).toHaveLength(2)
  })

  it("starts the hourly ones together, under a name drawn from the wake-up hour", async () => {
    const started: Started[] = []

    expect(
      await runScheduledWorkflows("0 * * * *", FIRED_AT, envRecording(started))
    ).toEqual([`expire-enrollments-${FIRED_AT}`, `evaluate-alerts-${FIRED_AT}`])
    expect(started).toEqual([
      { name: "expire-enrollments", id: `expire-enrollments-${FIRED_AT}` },
      { name: "evaluate-alerts", id: `evaluate-alerts-${FIRED_AT}` },
    ])
  })

  it("starts the daily ones together, once a day", async () => {
    const started: Started[] = []

    await runScheduledWorkflows("20 3 * * *", FIRED_AT, envRecording(started))

    expect(started.map((entry) => entry.name)).toEqual([
      "decommission-server",
      "reconcile-seats",
      "suspend-expired-grace",
      "purge-deletions",
    ])
  })

  it("starts the others when one of them refuses to start", async () => {
    const started: Started[] = []

    const ids = await runScheduledWorkflows(
      "20 3 * * *",
      FIRED_AT,
      envRecording(started, ["decommission-server"])
    )

    expect(ids).toEqual([
      `reconcile-seats-${FIRED_AT}`,
      `suspend-expired-grace-${FIRED_AT}`,
      `purge-deletions-${FIRED_AT}`,
    ])
  })

  it("starts nothing on an unknown cron", async () => {
    const started: Started[] = []

    expect(
      await runScheduledWorkflows("* * * * *", FIRED_AT, envRecording(started))
    ).toEqual([])
    expect(started).toEqual([])
  })
})
