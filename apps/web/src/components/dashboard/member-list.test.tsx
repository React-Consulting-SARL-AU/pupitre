import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { createOrganizationWithMembers } from "@pupitre/api/testing/factories"
import type { OrgRole } from "@pupitre/shared/permissions"
import { QueryClientProvider } from "@tanstack/react-query"
import { MemberList } from "@/components/dashboard/member-list"
import {
  DashboardContext,
  type DashboardOrganization,
} from "@/lib/domain/dashboard-context"
import { createQueryClient } from "@/lib/query/client"
import { useSessionApiClient } from "@/testing/harness"
import { fill, render, trigger, waitUntil } from "@/testing/render"

const mounted: (() => void)[] = []

function list(
  organization: DashboardOrganization,
  role: OrgRole,
  userId: string
) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <DashboardContext.Provider
        value={{
          user: {
            id: userId,
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
        <MemberList />
      </DashboardContext.Provider>
    </QueryClientProvider>
  )
}

describe("MemberList", () => {
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

  it("lets an admin invite someone, and shows the invitation as pending", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const [owner] = members

    await useSessionApiClient(owner.token)

    const { container, unmount, click } = await render(
      list(
        {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        "owner",
        owner.user.id
      )
    )

    mounted.push(unmount)

    await waitUntil(() =>
      (container.textContent ?? "").includes("Aucune invitation en attente")
    )

    const email = container.querySelector("#invite-email")

    if (!email) {
      throw new Error("no invite field")
    }

    await fill(email, "recrue@test.local")
    await click(trigger(container, "Inviter"))
    await waitUntil(() =>
      (container.textContent ?? "").includes("recrue@test.local")
    )

    expect(container.textContent).toContain("Invitation envoyée")
    expect(container.textContent).toContain("Propriétaire")
    expect(container.textContent).toContain("Membre")
  })

  it("shows a member the roster without the invite form", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const [owner, member] = members

    await useSessionApiClient(member.token)

    const { container, unmount } = await render(
      list(
        {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        "member",
        member.user.id
      )
    )

    mounted.push(unmount)

    await waitUntil(() =>
      (container.textContent ?? "").includes(owner.user.email)
    )

    expect(container.querySelector("#invite-email")).toBeNull()
    expect(container.textContent).toContain("· vous")
    expect(
      [...container.querySelectorAll("button")].map(
        (button) => button.textContent
      )
    ).toEqual([])
  })
})
