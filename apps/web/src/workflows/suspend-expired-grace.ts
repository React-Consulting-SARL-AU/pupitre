import type { WorkflowStep } from "cloudflare:workers"
import { suspendExpiredGrace } from "@pupitre/api/billing/grace"
import {
  type LaunchReconciliation,
  reconcileLaunch,
} from "@pupitre/api/billing/launch"
import { purgeStaleMailUploads } from "@pupitre/api/mail/uploads"

export const RECONCILE_LAUNCH_STEP = "reconcile-launch"

export const SUSPEND_EXPIRED_GRACE_STEP = "suspend-expired-grace"

export const PURGE_MAIL_UPLOADS_STEP = "purge-mail-uploads"

export interface SuspendExpiredGraceReport {
  launch: LaunchReconciliation
  suspended: string[]
  purgedUploads: string[]
}

/** The launch closes first, so a server it just graced is suspended in the same pass; the mail uploads nobody sent go last. */
export async function runSuspendExpiredGrace(
  step: WorkflowStep
): Promise<SuspendExpiredGraceReport> {
  const launch = await step.do(RECONCILE_LAUNCH_STEP, () => reconcileLaunch())
  const suspended = await step.do(SUSPEND_EXPIRED_GRACE_STEP, () =>
    suspendExpiredGrace()
  )
  const purgedUploads = await step.do(PURGE_MAIL_UPLOADS_STEP, () =>
    purgeStaleMailUploads()
  )

  return { launch, suspended, purgedUploads }
}
