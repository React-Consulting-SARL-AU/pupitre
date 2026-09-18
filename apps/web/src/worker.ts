import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers"
import {
  ENVELOPE_FROM_HEADER,
  ENVELOPE_TO_HEADER,
  handleInboundEmailMessage,
  ingestInboundEmail,
  MAIL_TOO_LARGE_REASON,
} from "@pupitre/api/mail/ingest"
import { handleApiRequest } from "@pupitre/api/server"
import { createD1PrismaClient } from "@pupitre/db/d1"
import { withPrismaClient } from "@pupitre/db/scope"
import { MAIL_MAX_BYTES } from "@pupitre/shared/legal"
import serverEntry from "@tanstack/react-start/server-entry"
import { API_PREFIX } from "./lib/config/urls"
import { runDecommissionServer } from "./workflows/decommission-server"
import { runEvaluateAlerts } from "./workflows/evaluate-alerts"
import { runExpireEnrollments } from "./workflows/expire-enrollments"
import {
  handleInternalWorkflowTrigger,
  INTERNAL_WORKFLOW_PREFIX,
  isInternalTriggerAuthorized,
} from "./workflows/internal-trigger"
import { runReconcileSeats } from "./workflows/reconcile-seats"
import { runScheduledWorkflows } from "./workflows/schedule"
import { runSuspendExpiredGrace } from "./workflows/suspend-expired-grace"

type CronEvent = Readonly<WorkflowEvent<unknown>>

const INTERNAL_EMAIL_PATH = "/internal/email"

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

/**
 * The same mail path as Email Routing, reachable with the internal secret so a
 * message can be injected by curl on a machine no domain points at.
 */
async function handleInternalEmail(
  request: Request,
  env: CloudflareEnv
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json(
      { error: { code: "not_found", message: "No such internal route." } },
      { status: 404 }
    )
  }

  if (!isInternalTriggerAuthorized(request, env)) {
    return Response.json(
      {
        error: {
          code: "unauthenticated",
          message: "The internal trigger secret is missing or wrong.",
        },
      },
      { status: 401 }
    )
  }

  const envelopeFrom = request.headers.get(ENVELOPE_FROM_HEADER)
  const envelopeTo = request.headers.get(ENVELOPE_TO_HEADER)

  if (!(envelopeFrom && envelopeTo)) {
    return Response.json(
      {
        error: {
          code: "validation",
          message: `The ${ENVELOPE_FROM_HEADER} and ${ENVELOPE_TO_HEADER} headers are required.`,
        },
      },
      { status: 422 }
    )
  }

  const raw = await request.arrayBuffer()

  if (raw.byteLength > MAIL_MAX_BYTES) {
    return Response.json(
      { error: { code: "validation", message: MAIL_TOO_LARGE_REASON } },
      { status: 413 }
    )
  }

  const result = await ingestInboundEmail({ envelopeFrom, envelopeTo, raw })

  return Response.json({ data: result }, { status: 202 })
}

function route(request: Request, env: CloudflareEnv, pathname: string) {
  if (pathname.startsWith(API_PREFIX)) {
    return handleApiRequest(request)
  }

  if (pathname === INTERNAL_EMAIL_PATH) {
    return handleInternalEmail(request, env)
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

  // A throw here is a temporary failure: Cloudflare keeps the message and
  // delivers it again, rather than the platform accepting a mail it lost.
  email(message: ForwardableEmailMessage, env: CloudflareEnv) {
    return withDatabase(env, () => handleInboundEmailMessage(message))
  },

  async scheduled(controller: ScheduledController, env: CloudflareEnv) {
    await runScheduledWorkflows(controller.cron, env)
  },
} satisfies ExportedHandler<CloudflareEnv>
