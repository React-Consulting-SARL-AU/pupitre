import { describe, expect, it } from "bun:test"
import type { AuthContext } from "@pupitre/api/auth-context"
import {
  broadcastInboxEvent,
  closeRevokedInboxSockets,
  handleInboxEventsRequest,
  inboxSocketRefusal,
} from "@/realtime/inbox-realtime"

const SESSION = { id: "ses_1" } as AuthContext["session"]

const USER = { id: "usr_1" } as AuthContext["user"]

function context(patch: Partial<AuthContext> = {}): AuthContext {
  return {
    user: USER,
    session: SESSION,
    organizationId: null,
    role: null,
    platformRole: "admin",
    isPlatformAdmin: true,
    accountRefusal: null,
    organizationState: null,
    ...patch,
  }
}

interface FakeSocket {
  sent: string[]
  closed: boolean
  send: (payload: string) => void
  close: () => void
}

function fakeSocket(throwing = false): FakeSocket {
  const socket: FakeSocket = {
    sent: [],
    closed: false,
    send: (payload: string) => {
      if (throwing) {
        throw new Error("socket already gone")
      }

      socket.sent.push(payload)
    },
    close: () => {
      socket.closed = true
    },
  }

  return socket
}

function stateOf(sockets: FakeSocket[]): DurableObjectState {
  return {
    getWebSockets: () => sockets as unknown as WebSocket[],
  } as unknown as DurableObjectState
}

describe("qui ouvre la socket de la boîte", () => {
  it("laisse passer un membre de l'équipe de la plateforme", () => {
    expect(inboxSocketRefusal(context())).toBeNull()
  })

  it("refuse en 403 un compte désactivé, malgré une session valide", () => {
    const refused = inboxSocketRefusal(
      context({ accountRefusal: { kind: "account_deactivated" } })
    )

    expect(refused?.status).toBe(403)
  })

  it("refuse en 401 sans session, en 403 hors de l'équipe", () => {
    const anonymous = inboxSocketRefusal(
      context({ user: null, session: null, isPlatformAdmin: false })
    )
    const outsider = inboxSocketRefusal(
      context({ platformRole: null, isPlatformAdmin: false })
    )

    expect(anonymous?.status).toBe(401)
    expect(outsider?.status).toBe(403)
  })
})

describe("l'origine de la socket", () => {
  it("refuse une socket ouverte depuis une autre page que la console", async () => {
    // happy-dom's Request drops the Origin header a browser forbids scripts to set; the Worker's keeps it.
    const handshake = {
      url: "https://app.pupitre.studio/api/v1/admin/inbox/events",
      headers: new Headers({
        origin: "https://evil.example",
        upgrade: "websocket",
      }),
    } as Request
    const refused = await handleInboxEventsRequest(
      handshake,
      {} as CloudflareEnv
    )

    expect(refused.status).toBe(403)
    expect(
      ((await refused.json()) as { error: { message: string } }).error.message
    ).toBe("This socket only opens from the Pupitre console.")
  })
})

describe("le retrait d'un membre de l'équipe", () => {
  it("ferme ses sockets et laisse celles des autres ouvertes", () => {
    const leaving = fakeSocket()
    const staying = fakeSocket()
    const state = {
      getWebSockets: (tag?: string) =>
        (tag === "usr_leaving"
          ? [leaving]
          : [leaving, staying]) as unknown as WebSocket[],
    } as unknown as DurableObjectState

    closeRevokedInboxSockets(state, "usr_leaving")

    expect(leaving.closed).toBe(true)
    expect(staying.closed).toBe(false)
    expect(staying.sent).toEqual([])
  })
})

describe("la diffusion d'un événement", () => {
  it("écarte la socket qui jette et sert les autres", () => {
    const broken = fakeSocket(true)
    const alive = fakeSocket()

    broadcastInboxEvent(stateOf([broken, alive]), {
      type: "thread.received",
      thread_id: "thr_1",
    })

    expect(broken.closed).toBe(true)
    expect(alive.sent).toEqual([
      JSON.stringify({ type: "thread.received", thread_id: "thr_1" }),
    ])
  })
})
