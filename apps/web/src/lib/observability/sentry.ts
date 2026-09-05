export interface TObservabilityEnv {
  SENTRY_DSN?: string
  PUPITRE_ENVIRONMENT?: string
}

export interface TFailureContext {
  method?: string
  pathname?: string
  cron?: string
}

interface TDsn {
  endpoint: string
  publicKey: string
}

export interface TSentryEvent {
  event_id: string
  timestamp: number
  platform: "javascript"
  level: "error"
  environment: string
  transaction?: string
  tags: Record<string, string>
  exception: {
    values: { type: string; value: string }[]
  }
  extra: Record<string, string>
}

const SAFE_SEGMENT_RE = /^[a-z][a-z0-9-]{0,19}$/
const MESSAGE_LIMIT = 1000
const STACK_LIMIT = 8000

export function redactPath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) =>
      segment.length === 0 || SAFE_SEGMENT_RE.test(segment) ? segment : ":id"
    )
    .join("/")
}

export function parseDsn(dsn: string | undefined): TDsn | null {
  if (!dsn) {
    return null
  }

  try {
    const url = new URL(dsn)
    const projectId = url.pathname.split("/").filter(Boolean).at(-1)

    if (!(url.username && projectId)) {
      return null
    }

    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    }
  } catch {
    return null
  }
}

function describe(error: unknown): { type: string; value: string } {
  if (error instanceof Error) {
    return {
      type: error.name,
      value: error.message.slice(0, MESSAGE_LIMIT),
    }
  }

  return { type: "UnknownError", value: String(error).slice(0, MESSAGE_LIMIT) }
}

export function buildEvent(
  error: unknown,
  env: TObservabilityEnv,
  context: TFailureContext,
  now: Date,
  eventId: string
): TSentryEvent {
  const tags: Record<string, string> = { runtime: "cloudflare-worker" }

  if (context.method) {
    tags.method = context.method
  }

  if (context.cron) {
    tags.cron = context.cron
  }

  const extra: Record<string, string> = {}

  if (error instanceof Error && error.stack) {
    extra.stack = error.stack.slice(0, STACK_LIMIT)
  }

  return {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "javascript",
    level: "error",
    environment: env.PUPITRE_ENVIRONMENT ?? "unknown",
    transaction: context.pathname ? redactPath(context.pathname) : undefined,
    tags,
    exception: { values: [describe(error)] },
    extra,
  }
}

export function buildEnvelope(event: TSentryEvent, now: Date): string {
  const header = { event_id: event.event_id, sent_at: now.toISOString() }

  return `${[JSON.stringify(header), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n")}\n`
}

export async function reportException(
  error: unknown,
  env: TObservabilityEnv,
  context: TFailureContext = {}
): Promise<void> {
  const dsn = parseDsn(env.SENTRY_DSN)

  if (!dsn) {
    return
  }

  const now = new Date()
  const event = buildEvent(error, env, context, now, crypto.randomUUID())

  try {
    await fetch(dsn.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=pupitre-web/1`,
      },
      body: buildEnvelope(event, now),
    })
  } catch (failure) {
    console.error("[observability] Sentry n'a pas reçu l'erreur", failure)
  }
}
