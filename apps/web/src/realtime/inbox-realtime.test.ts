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
    dataConsented: true,
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

describe("who opens the inbox socket", () => {
  it("lets a member of the platform team through", () => {
    expect(inboxSocketRefusal(context())).toBeNull()
  })

  it("refuses a deactivated account with 403, despite a valid session", () => {
    const refused = inboxSocketRefusal(
      context({ accountRefusal: { kind: "account_deactivated" } })
    )

    expect(refused?.status).toBe(403)
  })

  it("refuses a team member who has not agreed to the data storage", async () => {
    const refused = inboxSocketRefusal(context({ dataConsented: false }))

    expect(refused?.status).toBe(403)
    expect(await refused?.json()).toMatchObject({
      error: { code: "consent_required" },
    })
  })

  it("refuses with 401 without a session, with 403 outside the team", () => {
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

describe("the socket origin", () => {
  it("refuses a socket opened from a page other than the console", async () => {
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

describe("removing a team member", () => {
  it("closes their sockets and leaves the others' open", () => {
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

describe("broadcasting an event", () => {
  it("drops the socket that throws and serves the others", () => {
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
