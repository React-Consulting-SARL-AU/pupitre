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
import { AuditLog, type AuditLogSearch } from "@/components/dashboard/audit-log"
import { useSessionApiClient } from "@/testing/harness"
import { ListSearchHarness } from "@/testing/list-search"
import { pick, render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

async function seed() {
  const { organization, members } = await createOrganizationWithMembers({
    roles: ["owner"],
    subscription: {},
  })
  const { prisma } = await bootApiTestServer()

  await prisma.event.createMany({
    data: [
      {
        organizationId: organization.id,
        action: "server.enrolled",
        targetType: "server",
        targetId: "srv-1",
        actorUserId: members[0].user.id,
      },
      {
        organizationId: organization.id,
        action: "member.invited",
        targetType: "invitation",
        targetId: "inv-1",
      },
    ],
  })

  return { organization, owner: members[0] }
}

async function mount(organization: { id: string; name: string; slug: string }) {
  const view = await render(
    withDashboard(
      <ListSearchHarness<AuditLogSearch>>
        {(handle) => <AuditLog {...handle} />}
      </ListSearchHarness>,
      { organization, license: "valid" }
    )
  )

  mounted.push(view.unmount)

  await waitUntil(
    () => view.container.textContent?.includes("1–2 of 2") === true
  )

  return view
}

describe("AuditLog", () => {
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

  it("lists the organisation's journal as a table, with who did what", async () => {
    const { organization, owner } = await seed()

    await useSessionApiClient(owner.token)

    const view = await mount(organization)

    expect(view.container.querySelectorAll("tbody tr")).toHaveLength(2)
    expect(view.container.textContent).toContain("srv-1")
    expect(view.container.textContent).toContain(owner.user.email)
  })

  it("keeps the action asked for in the address it reads", async () => {
    const { organization, owner } = await seed()

    await useSessionApiClient(owner.token)

    const view = await mount(organization)
    const action = document.querySelector("#audit-action")

    if (!action) {
      throw new Error("no action filter")
    }

    await pick(action, "Server enrolled")
    await waitUntil(
      () => view.container.textContent?.includes("1–1 of 1") === true
    )

    expect(view.container.textContent).not.toContain("inv-1")
  })
})
