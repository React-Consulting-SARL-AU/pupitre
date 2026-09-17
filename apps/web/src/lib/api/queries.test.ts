import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { QueryObserver } from "@tanstack/react-query"
import {
  pollSubscription,
  SERVERS_POLL_INTERVAL_MS,
  serversQueryOptions,
} from "@/lib/api/queries"
import { createQueryClient } from "@/lib/query/client"
import {
  createConsoleUser,
  useSessionApiClient,
  waitFor,
} from "@/testing/harness"

const POLL_GRACE_MS = 10_000

interface ListedServer {
  id: string
  status: string
  usage: { disk: number; ram: number } | null
}

describe("serversQueryOptions", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("polls every five seconds", () => {
    expect(serversQueryOptions().refetchInterval).toBe(SERVERS_POLL_INTERVAL_MS)
    expect(SERVERS_POLL_INTERVAL_MS).toBe(5000)
  })

  it(
    "sees a server go from enrolling to active without a reload",
    async () => {
      const { prisma } = await bootApiTestServer()
      const { organization, token } = await createConsoleUser({
        email: "ada@test.local",
      })

      await useSessionApiClient(token)

      const server = await prisma.server.create({
        data: {
          organizationId: organization.id,
          name: "vps-poll",
          arch: "amd64",
          status: "enrolling",
          serverTokenHash: `hash-${crypto.randomUUID()}`,
        },
      })

      const client = createQueryClient()
      const observer = new QueryObserver(client, serversQueryOptions())
      const seen: string[] = []
      const unsubscribe = observer.subscribe((result) => {
        const listed = result.data as ListedServer[] | undefined
        const current = listed?.[0]?.status

        if (current && seen.at(-1) !== current) {
          seen.push(current)
        }
      })

      try {
        await waitFor(() => seen.includes("enrolling"))

        await prisma.server.update({
          where: { id: server.id },
          data: { status: "active", lastHeartbeatAt: new Date() },
        })

        await waitFor(
          () => seen.includes("active"),
          SERVERS_POLL_INTERVAL_MS + POLL_GRACE_MS
        )
      } finally {
        unsubscribe()
        client.clear()
      }

      expect(seen).toEqual(["enrolling", "active"])
    },
    { timeout: 30_000 }
  )
})

describe("pollSubscription", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("keeps waiting past a cancelled mirror until a live one lands", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, token } = await createConsoleUser({
      email: "ada@test.local",
    })

    await useSessionApiClient(token)
    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: "sub_old",
        product: "prod_server",
        quantity: 1,
        status: "canceled",
      },
    })

    let settled = false
    const polling = pollSubscription(organization.id, {
      intervalMs: 20,
      timeoutMs: 5000,
    }).then((subscription) => {
      settled = true

      return subscription
    })

    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(settled).toBe(false)

    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: "sub_new",
        product: "prod_server",
        quantity: 2,
        status: "trialing",
      },
    })

    const subscription = await polling

    expect(subscription.stripe_subscription_id).toBe("sub_new")
    expect(subscription.status).toBe("trialing")
  })

  it("returns at once when the mirror is already live", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, token } = await createConsoleUser({
      email: "ada@test.local",
    })

    await useSessionApiClient(token)
    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: "sub_live",
        product: "prod_server",
        quantity: 1,
        status: "active",
      },
    })

    const subscription = await pollSubscription(organization.id, {
      intervalMs: 20,
      timeoutMs: 1000,
    })

    expect(subscription.stripe_subscription_id).toBe("sub_live")
  })
})
