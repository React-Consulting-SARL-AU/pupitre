import { type AuthContext, resolveAuthContext } from "@pupitre/api/auth-context"
import {
  configureInboxRealtime,
  type InboxEvent,
} from "@pupitre/api/mail/realtime"
import { isForeignOrigin } from "@pupitre/api/origin"
import {
  equalsInConstantTime,
  INTERNAL_SECRET_HEADER,
} from "@/workflows/internal-trigger"

export const INBOX_EVENTS_PATH = "/api/v1/admin/inbox/events"

export const INBOX_PUBLISH_PATH = "/publish"

// One instance for the whole platform: the inbox is a single room.
export const INBOX_REALTIME_NAME = "platform"

const WEBSOCKET_UPGRADE = "websocket"

const KEEPALIVE_PING = "ping"

const KEEPALIVE_PONG = "pong"

const INTERNAL_ORIGIN = "https://inbox-realtime.internal"

// Set by the Worker once the session is resolved; the room is reachable only through the Worker's stub.
const SOCKET_USER_HEADER = "x-pupitre-inbox-user"

const REVOKED_CLOSE_CODE = 4403

export function isInboxSocketUpgrade(request: Request): boolean {
  return (
    request.headers.get("upgrade")?.toLowerCase() === WEBSOCKET_UPGRADE ||
    request.headers.get("Upgrade")?.toLowerCase() === WEBSOCKET_UPGRADE
  )
}

function refuse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
}

function refuseNonSocket(): Response {
  return refuse(400, "validation", "This address only accepts a WebSocket.")
}

// Hibernation keeps no state in the object, so each socket is tagged with its reader.
export function acceptInboxSocket(
  state: DurableObjectState,
  userId: string
): Response {
  const pair = new WebSocketPair()
  const [client, server] = Object.values(pair)

  state.acceptWebSocket(server, [userId])

  return new Response(null, { status: 101, webSocket: client })
}

// A socket the runtime already tore down throws on `send`: it is dropped so the round still reaches the others.
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

export function closeRevokedInboxSockets(
  state: DurableObjectState,
  userId: string
): void {
  for (const socket of state.getWebSockets(userId)) {
    socket.close(REVOKED_CLOSE_CODE, "Access to the inbox was revoked.")
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
        "The internal trigger secret is missing or wrong."
      )
    }

    const event = (await request.json()) as InboxEvent

    if (event.type === "access.revoked" && event.user_id) {
      closeRevokedInboxSockets(state, event.user_id)
    } else {
      broadcastInboxEvent(state, event)
    }

    return new Response(null, { status: 204 })
  }

  const userId = request.headers.get(SOCKET_USER_HEADER)

  if (!(isInboxSocketUpgrade(request) && userId)) {
    return refuseNonSocket()
  }

  return acceptInboxSocket(state, userId)
}

function inboxStub(env: CloudflareEnv) {
  return env.INBOX_REALTIME.get(
    env.INBOX_REALTIME.idFromName(INBOX_REALTIME_NAME)
  )
}

// Same refusals, in the same order, as the admin route guards.
export function inboxSocketRefusal(auth: AuthContext): Response | null {
  if (auth.accountRefusal) {
    return refuse(
      403,
      "forbidden",
      "This account is deactivated: the platform no longer honours its session."
    )
  }

  if (!(auth.user && auth.session)) {
    return refuse(401, "unauthenticated", "Authentication required.")
  }

  if (!auth.dataConsented) {
    return refuse(
      403,
      "consent_required",
      "This account has not agreed to its data being stored: the console asks first."
    )
  }

  if (!auth.isPlatformAdmin) {
    return refuse(403, "forbidden", "Reserved for the Pupitre team.")
  }

  return null
}

export async function handleInboxEventsRequest(
  request: Request,
  env: CloudflareEnv
): Promise<Response> {
  if (isForeignOrigin(request)) {
    return refuse(
      403,
      "forbidden",
      "This socket only opens from the Pupitre console."
    )
  }

  const auth = await resolveAuthContext(request)
  const refused = inboxSocketRefusal(auth)

  if (refused) {
    return refused
  }

  if (!(isInboxSocketUpgrade(request) && auth.user)) {
    return refuseNonSocket()
  }

  const forwarded = new Request(request)

  forwarded.headers.set(SOCKET_USER_HEADER, auth.user.id)

  return await inboxStub(env).fetch(forwarded)
}

// The API knows the room only through this publisher.
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
