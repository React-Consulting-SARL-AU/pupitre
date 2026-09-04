import type { WorkflowStep } from "cloudflare:workers"
import { expireEnrollments } from "@pupitre/api/servers/expire"

export const EXPIRE_ENROLLMENTS_STEP = "expire-enrollments"

export function runExpireEnrollments(step: WorkflowStep): Promise<string[]> {
  return step.do(EXPIRE_ENROLLMENTS_STEP, () => expireEnrollments())
}
