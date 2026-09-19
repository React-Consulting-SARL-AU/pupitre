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
import {
  AdminEventList,
  type AdminEventListSearch,
} from "@/components/admin/admin-event-list"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { ListSearchHarness } from "@/testing/list-search"
import { fill, pick, render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

function list(platformRole: OrgRole) {
  return withDashboard(
    <ListSearchHarness<AdminEventListSearch>>
      {(handle) => <AdminEventList {...handle} />}
    </ListSearchHarness>,
    { platformRole }
  )
}

interface EventInput {
  organizationId: string | null
  action: string
  targetType: string
  targetId: string
}

async function recordEvent({
  organizationId,
  action,
  targetType,
  targetId,
}: EventInput) {
  const { prisma } = await bootApiTestServer()

  return await prisma.event.create({
    data: { organizationId, action, targetType, targetId },
  })
}

describe("AdminEventList", () => {
  let organizationId: string

  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    const console = await createConsoleUser({
      email: "ops@test.local",
      role: "platform_admin",
    })

    await useSessionApiClient(console.token)

    organizationId = console.organization.id
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("reads the whole platform, naming each action and its target", async () => {
    await recordEvent({
      organizationId,
      action: "server.enrolled",
      targetType: "server",
      targetId: "srv-1",
    })
    await recordEvent({
      organizationId: null,
      action: "affiliate_link.created",
      targetType: "affiliate_link",
      targetId: "lnk-1",
    })

    const { container, unmount } = await render(list("member"))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Affiliate link created") === true
    )

    expect(container.textContent).toContain("Server enrolled")
    expect(container.textContent).toContain("1–2 of 2")
  })

  it("keeps only the action asked for", async () => {
    await recordEvent({
      organizationId,
      action: "server.enrolled",
      targetType: "server",
      targetId: "srv-1",
    })
    await recordEvent({
      organizationId,
      action: "user.banned",
      targetType: "user",
      targetId: "usr-1",
    })

    const { container, unmount } = await render(list("owner"))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("1–2 of 2") === true)

    const action = document.querySelector("#admin-events-action")

    if (!action) {
      throw new Error("no action filter")
    }

    await pick(action, "Account banned")
    await waitUntil(() => container.textContent?.includes("1–1 of 1") === true)

    expect(container.textContent).not.toContain("Server enrolled")
  })

  it("keeps only the organisation the reader names", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })

    await recordEvent({
      organizationId,
      action: "server.enrolled",
      targetType: "server",
      targetId: "srv-mine",
    })
    await recordEvent({
      organizationId: organization.id,
      action: "server.enrolled",
      targetType: "server",
      targetId: "srv-theirs",
    })

    const { container, unmount } = await render(list("owner"))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("1–2 of 2") === true)

    const field = container.querySelector("#admin-events-organization")

    if (!field) {
      throw new Error("no organisation filter")
    }

    await fill(field, organization.id)
    await waitUntil(() => container.textContent?.includes("1–1 of 1") === true)

    expect(container.textContent).toContain("srv-theirs")
    expect(container.textContent).not.toContain("srv-mine")
  })
})
