import type { WorkflowStep } from "cloudflare:workers"
import {
  ENROLLMENT_EXPIRY_BATCH_SIZE,
  expireEnrollmentsBatch,
} from "@pupitre/api/servers/expire"
import { drainInSteps } from "./steps"

export const EXPIRE_ENROLLMENTS_STEP = "expire-enrollments"

export function runExpireEnrollments(step: WorkflowStep): Promise<string[]> {
  return drainInSteps(
    step,
    EXPIRE_ENROLLMENTS_STEP,
    ENROLLMENT_EXPIRY_BATCH_SIZE,
    () => expireEnrollmentsBatch()
  )
}
