import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers"
import { handleApiRequest } from "@pupitre/api/server"
import serverEntry from "@tanstack/react-start/server-entry"
import { API_PREFIX } from "./lib/config/urls"
import { reportException } from "./lib/observability/sentry"
import { runDecommissionServer } from "./workflows/decommission-server"
import { runEvaluateAlerts } from "./workflows/evaluate-alerts"
import { runExpireEnrollments } from "./workflows/expire-enrollments"
import {
  handleInternalWorkflowTrigger,
  INTERNAL_WORKFLOW_PREFIX,
} from "./workflows/internal-trigger"
import { runReconcileSeats } from "./workflows/reconcile-seats"
import { runScheduledWorkflow } from "./workflows/schedule"
import { runSuspendExpiredGrace } from "./workflows/suspend-expired-grace"

type CronEvent = Readonly<WorkflowEvent<unknown>>

// Cloudflare resolves a workflow binding against a class exported by the
// worker entry: these shells cannot move into `workflows/`.
export class ExpireEnrollments extends WorkflowEntrypoint<CloudflareEnv> {
  override run(_event: CronEvent, step: WorkflowStep) {
    return runExpireEnrollments(step)
  }
}

export class DecommissionServer extends WorkflowEntrypoint<CloudflareEnv> {
  override run(_event: CronEvent, step: WorkflowStep) {
    return runDecommissionServer(step)
  }
}

export class ReconcileSeats extends WorkflowEntrypoint<CloudflareEnv> {
  override run(_event: CronEvent, step: WorkflowStep) {
    return runReconcileSeats(step)
  }
}

export class EvaluateAlerts extends WorkflowEntrypoint<CloudflareEnv> {
  override run(_event: CronEvent, step: WorkflowStep) {
    return runEvaluateAlerts(step)
  }
}

export class SuspendExpiredGrace extends WorkflowEntrypoint<CloudflareEnv> {
  override run(_event: CronEvent, step: WorkflowStep) {
    return runSuspendExpiredGrace(step)
  }
}

function route(request: Request, env: CloudflareEnv, pathname: string) {
  if (pathname.startsWith(API_PREFIX)) {
    return handleApiRequest(request)
  }

  if (pathname.startsWith(INTERNAL_WORKFLOW_PREFIX)) {
    return handleInternalWorkflowTrigger(request, env)
  }

  return serverEntry.fetch(request)
}

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    const { pathname } = new URL(request.url)

    try {
      return await route(request, env, pathname)
    } catch (error) {
      ctx.waitUntil(
        reportException(error, env, { method: request.method, pathname })
      )

      throw error
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ) {
    try {
      await runScheduledWorkflow(controller.cron, env)
    } catch (error) {
      ctx.waitUntil(reportException(error, env, { cron: controller.cron }))

      throw error
    }
  },
} satisfies ExportedHandler<CloudflareEnv>
