import type { WorkflowStep } from "cloudflare:workers"
import {
  purgeDeletedOrganizations,
  purgeDeletedUsers,
} from "@pupitre/api/platform/purge"

export const PURGE_ORGANIZATIONS_STEP = "purge-organizations"

export const PURGE_USERS_STEP = "purge-users"

export interface PurgeDeletionsReport {
  organizations: string[]
  users: string[]
}

/** Organizations first: an account the same pass erases is then the last owner of nothing. */
export async function runPurgeDeletions(
  step: WorkflowStep
): Promise<PurgeDeletionsReport> {
  const organizations = await step.do(PURGE_ORGANIZATIONS_STEP, () =>
    purgeDeletedOrganizations()
  )
  const users = await step.do(PURGE_USERS_STEP, () => purgeDeletedUsers())

  return { organizations, users }
}
