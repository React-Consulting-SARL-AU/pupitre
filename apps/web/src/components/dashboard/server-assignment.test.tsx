import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "@pupitre/api/testing/factories"
import type { OrgRole } from "@pupitre/shared/permissions"
import { QueryClientProvider } from "@tanstack/react-query"
import { ServerAssignment } from "@/components/dashboard/server-assignment"
import {
  DashboardContext,
  type DashboardOrganization,
} from "@/lib/domain/dashboard-context"
import { createQueryClient } from "@/lib/query/client"
import { useSessionApiClient } from "@/testing/harness"
import {
  choose,
  fill,
  render,
  trigger,
  waitUntil,
  waitUntilStored,
} from "@/testing/render"

const mounted: (() => void)[] = []

function card(
  organization: DashboardOrganization,
  role: OrgRole,
  serverId: string,
  assignedUserId: string | null = null
) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <DashboardContext.Provider
        value={{
          user: {
            id: assignedUserId ?? "viewer",
            email: "viewer@test.local",
            name: "Vue",
            image: null,
            locale: "fr",
          },
          organizations: [],
          activeOrganization: organization,
          role,
          entitlement: "valid",
        }}
      >
        <ServerAssignment
          assignedUserId={assignedUserId}
          pendingAssignmentEmail={null}
          serverId={serverId}
          serverName="vps-agence"
        />
      </DashboardContext.Provider>
    </QueryClientProvider>
  )
}

function organizationOf(organization: {
  id: string
  name: string
  slug: string
}): DashboardOrganization {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
  }
}

describe("ServerAssignment", () => {
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

  it("lets an admin hand a server to a member", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const [owner, member] = members
    const { server } = await createServer({ organizationId: organization.id })

    await useSessionApiClient(owner.token)

    const { container, unmount, click } = await render(
      card(organizationOf(organization), "owner", server.id)
    )

    mounted.push(unmount)

    await waitUntil(() =>
      (container.textContent ?? "").includes(member.user.email)
    )

    const assignee = container.querySelector("#assignee")

    if (!assignee) {
      throw new Error("no assignee select")
    }

    await choose(assignee, member.user.id)
    await click(trigger(container, "Attribuer"))
    await waitUntilStored(async () => {
      const stored = await prisma.server.findUnique({
        where: { id: server.id },
      })

      return stored?.assignedUserId === member.user.id
    })

    expect(
      (await prisma.server.findUniqueOrThrow({ where: { id: server.id } }))
        .assignedUserId
    ).toBe(member.user.id)
  })

  it("invites an unknown address and holds the server for it", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const { server } = await createServer({ organizationId: organization.id })

    await useSessionApiClient(members[0].token)

    const { container, unmount, click } = await render(
      card(organizationOf(organization), "owner", server.id)
    )

    mounted.push(unmount)

    const email = container.querySelector("#assign-email")

    if (!email) {
      throw new Error("no email field")
    }

    await fill(email, "recrue@test.local")
    await click(trigger(container, "Inviter et attribuer"))
    await waitUntilStored(async () => {
      const stored = await prisma.server.findUnique({
        where: { id: server.id },
      })

      return stored?.pendingAssignmentEmail === "recrue@test.local"
    })

    expect(await prisma.invitation.count()).toBe(1)
  })

  it("gives a member no control over the attribution", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const [, member] = members
    const { server } = await createServer({
      organizationId: organization.id,
      assignedUserId: member.user.id,
    })

    await useSessionApiClient(member.token)

    const { container, unmount } = await render(
      card(organizationOf(organization), "member", server.id, member.user.id)
    )

    mounted.push(unmount)

    expect(container.querySelector("#assignee")).toBeNull()
    expect(container.querySelector("#assign-email")).toBeNull()
    const buttons = [...container.querySelectorAll("button")].map(
      (button) => button.textContent ?? ""
    )

    expect(buttons).toEqual([])
  })
})
