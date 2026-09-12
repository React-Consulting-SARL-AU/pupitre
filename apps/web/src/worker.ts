import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers"
import { handleApiRequest } from "@pupitre/api/server"
import { createD1PrismaClient } from "@pupitre/db/d1"
import { withPrismaClient } from "@pupitre/db/scope"
import serverEntry from "@tanstack/react-start/server-entry"
import { API_PREFIX } from "./lib/config/urls"
import { runDecommissionServer } from "./workflows/decommission-server"
import { runEvaluateAlerts } from "./workflows/evaluate-alerts"
import { runExpireEnrollments } from "./workflows/expire-enrollments"
import {
  handleInternalWorkflowTrigger,
  INTERNAL_WORKFLOW_PREFIX,
} from "./workflows/internal-trigger"
import { runReconcileSeats } from "./workflows/reconcile-seats"
import { runScheduledWorkflows } from "./workflows/schedule"
import { runSuspendExpiredGrace } from "./workflows/suspend-expired-grace"

type CronEvent = Readonly<WorkflowEvent<unknown>>

/** Everything below reads the database of the request: a client on the D1 binding, for the span of one run. */
function withDatabase<T>(env: CloudflareEnv, run: () => T | Promise<T>) {
  return withPrismaClient(createD1PrismaClient(env.DB), run)
}

// Cloudflare resolves a workflow binding against a class exported by the
// worker entry: these shells cannot move into `workflows/`.
export class ExpireEnrollments extends WorkflowEntrypoint<CloudflareEnv> {
  override run(_event: CronEvent, step: WorkflowStep) {
    return withDatabase(this.env, () => runExpireEnrollments(step))
  }
}

export class DecommissionServer extends WorkflowEntrypoint<CloudflareEnv> {
  override run(_event: CronEvent, step: WorkflowStep) {
    return withDatabase(this.env, () => runDecommissionServer(step))
  }
}

export class ReconcileSeats extends WorkflowEntrypoint<CloudflareEnv> {
  override run(_event: CronEvent, step: WorkflowStep) {
    return withDatabase(this.env, () => runReconcileSeats(step))
  }
}

export class EvaluateAlerts extends WorkflowEntrypoint<CloudflareEnv> {
  override run(_event: CronEvent, step: WorkflowStep) {
    return withDatabase(this.env, () => runEvaluateAlerts(step))
  }
}

export class SuspendExpiredGrace extends WorkflowEntrypoint<CloudflareEnv> {
  override run(_event: CronEvent, step: WorkflowStep) {
    return withDatabase(this.env, () => runSuspendExpiredGrace(step))
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
  fetch(request: Request, env: CloudflareEnv) {
    const { pathname } = new URL(request.url)

    return withDatabase(env, () => route(request, env, pathname))
  },

  async scheduled(controller: ScheduledController, env: CloudflareEnv) {
    await runScheduledWorkflows(controller.cron, env)
  },
} satisfies ExportedHandler<CloudflareEnv>
