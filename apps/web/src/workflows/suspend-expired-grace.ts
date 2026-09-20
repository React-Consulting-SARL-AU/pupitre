import type { WorkflowStep } from "cloudflare:workers"
import { expireGrantedSubscriptions } from "@pupitre/api/billing/admin"
import { suspendExpiredGrace } from "@pupitre/api/billing/grace"
import {
  type LaunchReconciliation,
  reconcileLaunch,
} from "@pupitre/api/billing/launch"
import { purgeStaleMailUploads } from "@pupitre/api/mail/uploads"

export const RECONCILE_LAUNCH_STEP = "reconcile-launch"

export const EXPIRE_GRANTED_STEP = "expire-granted"

export const SUSPEND_EXPIRED_GRACE_STEP = "suspend-expired-grace"

export const PURGE_MAIL_UPLOADS_STEP = "purge-mail-uploads"

export interface SuspendExpiredGraceReport {
  launch: LaunchReconciliation
  granted: string[]
  suspended: string[]
  purgedUploads: string[]
}

/** The launch and the grants close first, so a server they just graced is suspended in the same pass; the mail uploads nobody sent go last. */
export async function runSuspendExpiredGrace(
  step: WorkflowStep
): Promise<SuspendExpiredGraceReport> {
  const launch = await step.do(RECONCILE_LAUNCH_STEP, () => reconcileLaunch())
  const granted = await step.do(EXPIRE_GRANTED_STEP, () =>
    expireGrantedSubscriptions()
  )
  const suspended = await step.do(SUSPEND_EXPIRED_GRACE_STEP, () =>
    suspendExpiredGrace()
  )
  const purgedUploads = await step.do(PURGE_MAIL_UPLOADS_STEP, () =>
    purgeStaleMailUploads()
  )

  return { launch, granted, suspended, purgedUploads }
}
