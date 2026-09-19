import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "@pupitre/api/testing/factories"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterContextProvider } from "@tanstack/react-router"
import { ServerActions } from "@/components/dashboard/server-actions"
import { ToastProvider } from "@/components/ui/toast"
import { queryKeys } from "@/lib/api/queries"
import { DashboardContext } from "@/lib/domain/dashboard-context"
import { createQueryClient } from "@/lib/query/client"
import { getRouter } from "@/router"
import { useSessionApiClient } from "@/testing/harness"
import { render, trigger, waitUntil } from "@/testing/render"

const mounted: (() => void)[] = []

describe("ServerActions", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("refreshes the account, and its seat count, once the server is revoked", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const { server } = await createServer({ organizationId: organization.id })
    const queryClient = createQueryClient()
    const invalidated = spyOn(queryClient, "invalidateQueries")

    await useSessionApiClient(owner.token)

    const { container, unmount, click } = await render(
      <RouterContextProvider router={getRouter()}>
        <QueryClientProvider client={queryClient}>
          <DashboardContext.Provider
            value={{
              user: {
                id: owner.user.id,
                email: owner.user.email,
                name: "Ada",
                image: null,
                locale: "fr",
              },
              organizations: [],
              activeOrganization: {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
                state: "active",
                reason: null,
              },
              role: "owner",
              entitlement: "valid",
              platformRole: null,
            }}
          >
            <ToastProvider>
              <ServerActions
                decommissionAt={null}
                serverId={server.id}
                serverName={server.name}
                status="active"
              />
            </ToastProvider>
          </DashboardContext.Provider>
        </QueryClientProvider>
      </RouterContextProvider>
    )

    mounted.push(unmount)

    await click(trigger(container, "Delete the server"))
    await click(trigger(document.body, "Delete"))
    await waitUntil(() =>
      invalidated.mock.calls.some(
        ([filters]) =>
          JSON.stringify(filters?.queryKey) === JSON.stringify(queryKeys.me)
      )
    )

    const stored = await prisma.server.findUniqueOrThrow({
      where: { id: server.id },
    })

    expect(stored.status).toBe("revoked")
  })
})
