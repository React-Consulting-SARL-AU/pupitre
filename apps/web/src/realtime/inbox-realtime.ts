import { type AuthContext, resolveAuthContext } from "@pupitre/api/auth-context"
import {
  configureInboxRealtime,
  type InboxEvent,
} from "@pupitre/api/mail/realtime"
import {
  equalsInConstantTime,
  INTERNAL_SECRET_HEADER,
} from "@/workflows/internal-trigger"

/** Where the console opens its socket, and where the API pushes what it just wrote. */
export const INBOX_EVENTS_PATH = "/api/v1/admin/inbox/events"

export const INBOX_PUBLISH_PATH = "/publish"

/** One instance for the whole platform: the inbox is a single room. */
export const INBOX_REALTIME_NAME = "platform"

const WEBSOCKET_UPGRADE = "websocket"

const KEEPALIVE_PING = "ping"

const KEEPALIVE_PONG = "pong"

const INTERNAL_ORIGIN = "https://inbox-realtime.internal"

export function isInboxSocketUpgrade(request: Request): boolean {
  return (
    request.headers.get("upgrade")?.toLowerCase() === WEBSOCKET_UPGRADE ||
    request.headers.get("Upgrade")?.toLowerCase() === WEBSOCKET_UPGRADE
  )
}

function refuse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
}

/**
 * The socket answers with hibernation: the object keeps no state of its own,
 * so an idle room costs nothing and a broadcast reaches whoever is still there.
 */
export function acceptInboxSocket(state: DurableObjectState): Response {
  const pair = new WebSocketPair()
  const [client, server] = Object.values(pair)

  state.acceptWebSocket(server)

  return new Response(null, { status: 101, webSocket: client })
}

/**
 * A socket the runtime has already torn down throws on `send`; the round must
 * still reach the others, so the faulty one is dropped instead of the frame.
 */
function sendOrDrop(socket: WebSocket, payload: string): void {
  try {
    socket.send(payload)
  } catch {
    try {
      socket.close()
    } catch {
      return
    }
  }
}

export function broadcastInboxEvent(
  state: DurableObjectState,
  event: InboxEvent
): void {
  const payload = JSON.stringify(event)

  for (const socket of state.getWebSockets()) {
    sendOrDrop(socket, payload)
  }
}

export function answerInboxSocketMessage(
  socket: WebSocket,
  message: string | ArrayBuffer
): void {
  if (message === KEEPALIVE_PING) {
    socket.send(KEEPALIVE_PONG)
  }
}

function internalSecretMatches(request: Request, secret?: string): boolean {
  const presented = request.headers.get(INTERNAL_SECRET_HEADER)

  return Boolean(secret && presented && equalsInConstantTime(secret, presented))
}

export async function handleInboxRealtimeRequest(
  state: DurableObjectState,
  env: CloudflareEnv,
  request: Request
): Promise<Response> {
  const { pathname } = new URL(request.url)

  if (pathname === INBOX_PUBLISH_PATH) {
    if (!internalSecretMatches(request, env.INTERNAL_WORKFLOW_SECRET)) {
      return refuse(
        401,
        "unauthenticated",
        "Le secret des déclencheurs internes est absent ou faux."
      )
    }

    broadcastInboxEvent(state, (await request.json()) as InboxEvent)

    return new Response(null, { status: 204 })
  }

  if (!isInboxSocketUpgrade(request)) {
    return refuse(
      400,
      "validation",
      "Cette adresse n'accepte qu'une connexion WebSocket."
    )
  }

  return acceptInboxSocket(state)
}

function inboxStub(env: CloudflareEnv) {
  return env.INBOX_REALTIME.get(
    env.INBOX_REALTIME.idFromName(INBOX_REALTIME_NAME)
  )
}

/**
 * The socket answers to the same refusals as the routes it mirrors, in the
 * order `refuseSession` uses: a session the platform no longer honours says
 * what it refuses before anything about a role.
 */
export function inboxSocketRefusal(auth: AuthContext): Response | null {
  if (auth.accountRefusal) {
    return refuse(
      403,
      "forbidden",
      "Ce compte est désactivé : la plateforme n'honore plus sa session."
    )
  }

  if (!(auth.user && auth.session)) {
    return refuse(401, "unauthenticated", "Authentification requise.")
  }

  if (!auth.isPlatformAdmin) {
    return refuse(403, "forbidden", "Réservé à l'équipe Pupitre.")
  }

  return null
}

/**
 * The socket opens only for the platform team, and the session is resolved
 * before the request ever reaches the object: the room has no reader of its own.
 */
export async function handleInboxEventsRequest(
  request: Request,
  env: CloudflareEnv
): Promise<Response> {
  const refused = inboxSocketRefusal(await resolveAuthContext(request))

  if (refused) {
    return refused
  }

  if (!isInboxSocketUpgrade(request)) {
    return refuse(
      400,
      "validation",
      "Cette adresse n'accepte qu'une connexion WebSocket."
    )
  }

  return await inboxStub(env).fetch(request)
}

/** What each write calls once the Worker is up: the API knows the room only through this. */
export function configureInboxPublisher(env: CloudflareEnv): void {
  configureInboxRealtime(async (event) => {
    await inboxStub(env).fetch(`${INTERNAL_ORIGIN}${INBOX_PUBLISH_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INTERNAL_SECRET_HEADER]: env.INTERNAL_WORKFLOW_SECRET ?? "",
      },
      body: JSON.stringify(event),
    })
  })
}
