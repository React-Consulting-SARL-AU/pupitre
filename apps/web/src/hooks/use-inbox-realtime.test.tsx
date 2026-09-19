import { afterEach, describe, expect, it } from "bun:test"
import { QueryClientProvider } from "@tanstack/react-query"
import { useInboxRealtime } from "@/hooks/use-inbox-realtime"
import { inboxKeys } from "@/lib/api/inbox-queries"
import { createQueryClient } from "@/lib/query/client"
import { render } from "@/testing/render"

const mounted: (() => void)[] = []

interface FakeSocket {
  url: string
  onopen: (() => void) | null
  onmessage: ((frame: { data: unknown }) => void) | null
  onclose: (() => void) | null
  close: () => void
  closed: boolean
}

const sockets: FakeSocket[] = []

function openFake(url: string): WebSocket {
  const socket: FakeSocket = {
    url,
    onopen: null,
    onmessage: null,
    onclose: null,
    closed: false,
    close: () => {
      socket.closed = true
    },
  }

  sockets.push(socket)

  return socket as unknown as WebSocket
}

function Probe() {
  useInboxRealtime({ socketFactory: openFake, origin: "http://localhost:3000" })

  return null
}

describe("useInboxRealtime", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }

    sockets.length = 0
  })

  it("opens one socket on the events address and closes it on unmount", async () => {
    const client = createQueryClient()
    const { unmount } = await render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>
    )

    expect(sockets).toHaveLength(1)
    expect(sockets[0].url).toBe("ws://localhost:3000/api/v1/admin/inbox/events")

    unmount()

    expect(sockets[0].closed).toBe(true)
  })

  it("invalidates the thread a frame names, and the counters", async () => {
    const client = createQueryClient()
    const invalidated: string[] = []

    client.invalidateQueries = ((options: { queryKey: unknown[] }) => {
      invalidated.push(JSON.stringify(options.queryKey))

      return Promise.resolve()
    }) as typeof client.invalidateQueries

    const { unmount } = await render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>
    )

    mounted.push(unmount)

    sockets[0].onmessage?.({
      data: JSON.stringify({ type: "thread.updated", thread_id: "thr_1" }),
    })

    expect(invalidated).toContain(JSON.stringify(inboxKeys.allThreads))
    expect(invalidated).toContain(JSON.stringify(inboxKeys.counts))
    expect(invalidated).toContain(JSON.stringify(inboxKeys.thread("thr_1")))
  })

  it("ignores a frame it cannot read", async () => {
    const client = createQueryClient()
    let calls = 0

    client.invalidateQueries = (() => {
      calls += 1

      return Promise.resolve()
    }) as typeof client.invalidateQueries

    const { unmount } = await render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>
    )

    mounted.push(unmount)

    sockets[0].onmessage?.({ data: "not json" })

    expect(calls).toBe(0)
  })
})
