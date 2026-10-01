import type { WorkflowStep } from "cloudflare:workers"
import { expireGrantedSubscriptionsBatch } from "@pupitre/api/billing/admin"
import { EXPIRY_BATCH_SIZE } from "@pupitre/api/billing/expiry"
import {
  announceSuspension,
  SUSPENSION_BATCH_SIZE,
  suspendExpiredGraceBatch,
  suspensionNotices,
} from "@pupitre/api/billing/grace"
import { purgeStaleMailUploads } from "@pupitre/api/mail/uploads"
import { drainInSteps, sliceInSteps } from "./steps"

export const EXPIRE_GRANTED_STEP = "expire-granted"

export const SUSPEND_EXPIRED_GRACE_STEP = "suspend-expired-grace"

export const ANNOUNCE_SUSPENSION_STEP = "announce-suspension"

export const PURGE_MAIL_UPLOADS_STEP = "purge-mail-uploads"

export interface SuspendExpiredGraceReport {
  granted: string[]
  suspended: string[]
  purgedUploads: string[]
}

export async function runSuspendExpiredGrace(
  step: WorkflowStep
): Promise<SuspendExpiredGraceReport> {
  const granted = await drainInSteps(
    step,
    EXPIRE_GRANTED_STEP,
    EXPIRY_BATCH_SIZE,
    () => expireGrantedSubscriptionsBatch()
  )
  const suspended = await drainInSteps(
    step,
    SUSPEND_EXPIRED_GRACE_STEP,
    SUSPENSION_BATCH_SIZE,
    () => suspendExpiredGraceBatch()
  )

  await sliceInSteps(
    step,
    ANNOUNCE_SUSPENSION_STEP,
    suspensionNotices(suspended),
    1,
    (notices) => Promise.all(notices.map(announceSuspension)).then(() => true)
  )

  const purgedUploads = await step.do(PURGE_MAIL_UPLOADS_STEP, () =>
    purgeStaleMailUploads()
  )

  return {
    granted,
    suspended: suspended.map((server) => server.id),
    purgedUploads,
  }
}
