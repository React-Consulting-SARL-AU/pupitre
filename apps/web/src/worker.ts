import {
  DurableObject,
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
import { createCspNonce, withSecurityHeaders } from "./lib/security-headers"
import {
  configureRateLimits,
  handleRateLimitRequest,
  sweepExpired,
} from "./rate-limit/rate-limit"
import {
  answerInboxSocketMessage,
  configureInboxPublisher,
  handleInboxEventsRequest,
  handleInboxRealtimeRequest,
  INBOX_EVENTS_PATH,
} from "./realtime/inbox-realtime"
import { runDecommissionServer } from "./workflows/decommission-server"
import { runEvaluateAlerts } from "./workflows/evaluate-alerts"
import { runExpireEnrollments } from "./workflows/expire-enrollments"
import {
  handleInternalWorkflowTrigger,
  INTERNAL_WORKFLOW_PREFIX,
  isInternalTriggerAuthorized,
} from "./workflows/internal-trigger"
import { runPurgeDeletions } from "./workflows/purge-deletions"
import { runReconcileSeats } from "./workflows/reconcile-seats"
import { runScheduledWorkflows } from "./workflows/schedule"
import { runSuspendExpiredGrace } from "./workflows/suspend-expired-grace"

type CronEvent = Readonly<WorkflowEvent<unknown>>

const INTERNAL_EMAIL_PATH = "/internal/email"

/** Everything below reads the database of the request: a client on the D1 binding, for the span of one run. */
function withDatabase<T>(env: CloudflareEnv, run: () => T | Promise<T>) {
  return withPrismaClient(createD1PrismaClient(env.DB), run)
}

// A workflow binding resolves against a class exported by the worker entry: these shells cannot move.
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

export class PurgeDeletions extends WorkflowEntrypoint<CloudflareEnv> {
  override run(_event: CronEvent, step: WorkflowStep) {
    return withDatabase(this.env, () => runPurgeDeletions(step))
  }
}

// A durable object binding resolves against a class exported by the worker entry too.
export class InboxRealtime extends DurableObject<CloudflareEnv> {
  override fetch(request: Request) {
    return handleInboxRealtimeRequest(this.ctx, this.env, request)
  }

  override webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    answerInboxSocketMessage(socket, message)
  }

  override webSocketClose(socket: WebSocket, code: number, reason: string) {
    socket.close(code, reason)
  }
}

// Same as the room above: the counter's shell stays beside the entry.
export class RateLimit extends DurableObject<CloudflareEnv> {
  override fetch(request: Request) {
    return handleRateLimitRequest(this.ctx, request)
  }

  override alarm() {
    return sweepExpired(this.ctx)
  }
}

/** Email Routing's path behind the internal secret, so curl can inject a mail where no domain points. */
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

interface Routed {
  response: Response
  /** Set on a document the console renders, rather than an answer of the API's. */
  nonce: string | null
}

function route(
  request: Request,
  env: CloudflareEnv,
  pathname: string
): Promise<Routed> {
  // The socket is answered before Elysia, which cannot hand back a 101.
  if (pathname === INBOX_EVENTS_PATH) {
    return handleInboxEventsRequest(request, env).then(answered)
  }

  if (pathname.startsWith(API_PREFIX)) {
    return handleApiRequest(request).then(answered)
  }

  if (pathname === INTERNAL_EMAIL_PATH) {
    return handleInternalEmail(request, env).then(answered)
  }

  if (pathname.startsWith(INTERNAL_WORKFLOW_PREFIX)) {
    return handleInternalWorkflowTrigger(request, env).then(answered)
  }

  const nonce = createCspNonce()

  return Promise.resolve(
    serverEntry.fetch(request, { context: { nonce } })
  ).then((response: Response) => ({ response, nonce }))
}

function answered(response: Response): Routed {
  return { response, nonce: null }
}

export default {
  async fetch(request: Request, env: CloudflareEnv) {
    const { pathname } = new URL(request.url)

    configureInboxPublisher(env)
    configureRateLimits(env)

    const { response, nonce } = await withDatabase(env, () =>
      route(request, env, pathname)
    )

    return withSecurityHeaders(response, env, { nonce })
  },

  // A throw is a temporary failure: Cloudflare keeps the message and delivers it again.
  email(message: ForwardableEmailMessage, env: CloudflareEnv) {
    configureInboxPublisher(env)

    return withDatabase(env, () => handleInboundEmailMessage(message))
  },

  async scheduled(controller: ScheduledController, env: CloudflareEnv) {
    await runScheduledWorkflows(controller.cron, controller.scheduledTime, env)
  },
} satisfies ExportedHandler<CloudflareEnv>
