import type { WorkflowStep } from "cloudflare:workers"
import { expireGrantedSubscriptionsBatch } from "@pupitre/api/billing/admin"
import { EXPIRY_BATCH_SIZE } from "@pupitre/api/billing/expiry"
import {
  announceSuspension,
  SUSPENSION_BATCH_SIZE,
  suspendExpiredGraceBatch,
  suspensionNotices,
} from "@pupitre/api/billing/grace"
import {
  alignLaunchBatch,
  cancelEndedLaunchBatch,
  keepLaunchSeatsBatch,
  LAUNCH_BATCH_SIZE,
  type LaunchReconciliation,
} from "@pupitre/api/billing/launch"
import { purgeStaleMailUploads } from "@pupitre/api/mail/uploads"
import { drainInSteps, sliceInSteps, walkInSteps } from "./steps"

export const ALIGN_LAUNCH_STEP = "align-launch"

export const KEEP_LAUNCH_SEATS_STEP = "keep-launch-seats"

export const CANCEL_ENDED_LAUNCH_STEP = "cancel-ended-launch"

export const EXPIRE_GRANTED_STEP = "expire-granted"

export const SUSPEND_EXPIRED_GRACE_STEP = "suspend-expired-grace"

export const ANNOUNCE_SUSPENSION_STEP = "announce-suspension"

export const PURGE_MAIL_UPLOADS_STEP = "purge-mail-uploads"

export interface SuspendExpiredGraceReport {
  launch: LaunchReconciliation
  granted: string[]
  suspended: string[]
  purgedUploads: string[]
}

/** Every launch seat is kept before anything is cancelled: the cancellation takes whatever launch row is still running. */
async function reconcileLaunchInSteps(
  step: WorkflowStep
): Promise<LaunchReconciliation> {
  const aligned = await drainInSteps(
    step,
    ALIGN_LAUNCH_STEP,
    LAUNCH_BATCH_SIZE,
    () => alignLaunchBatch()
  )
  const seats = await walkInSteps(step, KEEP_LAUNCH_SEATS_STEP, (after) =>
    keepLaunchSeatsBatch(after)
  )
  const canceled = await drainInSteps(
    step,
    CANCEL_ENDED_LAUNCH_STEP,
    EXPIRY_BATCH_SIZE,
    () => cancelEndedLaunchBatch()
  )

  return { aligned, kept: seats.flatMap((batch) => batch.kept), canceled }
}

/**
 * The launch and the grants close first, so a server they just graced is
 * suspended in the same pass. Each organization hears of its suspension in a
 * step of its own, once the servers are down; the mail uploads nobody sent go
 * last.
 */
export async function runSuspendExpiredGrace(
  step: WorkflowStep
): Promise<SuspendExpiredGraceReport> {
  const launch = await reconcileLaunchInSteps(step)
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
    launch,
    granted,
    suspended: suspended.map((server) => server.id),
    purgedUploads,
  }
}
