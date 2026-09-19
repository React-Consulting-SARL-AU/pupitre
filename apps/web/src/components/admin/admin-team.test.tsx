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
  ADMIN_PAGE_SIZE,
  PLATFORM_ORGANIZATION_ID,
} from "@pupitre/shared/platform"
import { AdminTeam } from "@/components/admin/admin-team"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { render, trigger, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

const EXTRA = 2

async function fillTeam(count: number) {
  const { prisma } = await bootApiTestServer()

  for (let index = 0; index < count; index += 1) {
    const user = await prisma.user.create({
      data: {
        id: `team-${index}`,
        email: `team-${index}@pupitre.studio`,
        name: `Équipier ${index}`,
        emailVerified: true,
      },
    })

    await prisma.member.create({
      data: {
        id: `member-${index}`,
        organizationId: PLATFORM_ORGANIZATION_ID,
        userId: user.id,
        role: "member",
        createdAt: new Date(),
      },
    })
  }
}

describe("AdminTeam", () => {
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
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("turns the page instead of hiding the members past the first one", async () => {
    await fillTeam(ADMIN_PAGE_SIZE + EXTRA)

    const total = ADMIN_PAGE_SIZE + EXTRA + 1
    const { container, unmount, click } = await render(
      withDashboard(<AdminTeam />, { platformRole: "owner" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.querySelectorAll("tbody tr").length === ADMIN_PAGE_SIZE
    )

    expect(container.textContent).toContain(`1–${ADMIN_PAGE_SIZE} of ${total}`)

    await click(trigger(container, "Next"))

    expect(container.querySelectorAll("tbody tr")).toHaveLength(
      total - ADMIN_PAGE_SIZE
    )
    expect(container.textContent).toContain(
      `${ADMIN_PAGE_SIZE + 1}–${total} of ${total}`
    )
  })
})
