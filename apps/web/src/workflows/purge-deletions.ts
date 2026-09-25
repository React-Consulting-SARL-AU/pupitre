import type { WorkflowStep } from "cloudflare:workers"
import {
  PURGE_BATCH_SIZE,
  purgeDeletedOrganizations,
  purgeDeletedUsers,
  type UserPurgeBatch,
} from "@pupitre/api/platform/purge"
import {
  SWEEP_PASS_LIMIT,
  sweepExpiredDeviceCodes,
  sweepExpiredSessions,
  sweepExpiredVerifications,
  sweepServerMetrics,
} from "@pupitre/api/platform/retention"
import { batchStep } from "./steps"

export const PURGE_ORGANIZATIONS_STEP = "purge-organizations"

export const PURGE_USERS_STEP = "purge-users"

export const SWEEPS = {
  metrics: { step: "sweep-metrics", run: sweepServerMetrics },
  sessions: { step: "sweep-sessions", run: sweepExpiredSessions },
  verifications: {
    step: "sweep-verifications",
    run: sweepExpiredVerifications,
  },
  device_codes: { step: "sweep-device-codes", run: sweepExpiredDeviceCodes },
} as const

export type SweepName = keyof typeof SWEEPS

export interface PurgeDeletionsReport {
  organizations: string[]
  users: string[]
  swept: Record<SweepName, number>
}

async function purgeOrganizations(step: WorkflowStep): Promise<string[]> {
  const purged: string[] = []

  for (let index = 0; ; index += 1) {
    const batch = await step.do(
      batchStep(PURGE_ORGANIZATIONS_STEP, index),
      () => purgeDeletedOrganizations()
    )

    purged.push(...batch)

    if (batch.length < PURGE_BATCH_SIZE) {
      return purged
    }
  }
}

async function purgeUsers(step: WorkflowStep): Promise<string[]> {
  const purged: string[] = []
  let after: string | null = null

  for (let index = 0; ; index += 1) {
    const from = after
    const batch: UserPurgeBatch = await step.do(
      batchStep(PURGE_USERS_STEP, index),
      () => purgeDeletedUsers(from)
    )

    purged.push(...batch.purged)
    after = batch.next

    if (after === null) {
      return purged
    }
  }
}

async function sweep(step: WorkflowStep, name: SweepName): Promise<number> {
  let swept = 0

  for (let index = 0; ; index += 1) {
    const removed = await step.do(batchStep(SWEEPS[name].step, index), () =>
      SWEEPS[name].run()
    )

    swept += removed

    if (removed < SWEEP_PASS_LIMIT) {
      return swept
    }
  }
}

// Organizations first, so an account erased in the same pass no longer owns anything.
export async function runPurgeDeletions(
  step: WorkflowStep
): Promise<PurgeDeletionsReport> {
  const organizations = await purgeOrganizations(step)
  const users = await purgeUsers(step)
  const swept = {} as Record<SweepName, number>

  for (const name of Object.keys(SWEEPS) as SweepName[]) {
    swept[name] = await sweep(step, name)
  }

  return { organizations, users, swept }
}
