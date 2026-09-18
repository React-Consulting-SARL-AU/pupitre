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
import { joinPlatformOrganization } from "@pupitre/auth/testing"
import { AdminUserDetail } from "@/components/admin/admin-user-detail"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import {
  fill,
  render,
  trigger,
  waitUntil,
  waitUntilStored,
  withDashboard,
} from "@/testing/render"

const mounted: (() => void)[] = []

function page(id: string) {
  return withDashboard(<AdminUserDetail id={id} />, { platformRole: "owner" })
}

describe("AdminUserDetail", () => {
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

  it("shows the account, the organisations it belongs to and the servers it holds", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const owner = members[0]

    await createServer({
      organizationId: organization.id,
      name: "vps-one",
      assignedUserId: owner.user.id,
    })

    const { container, unmount } = await render(page(owner.user.id))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("Atelier") === true)

    expect(container.textContent).toContain(owner.user.email)
    expect(container.textContent).toContain("vps-one")
    expect(container.textContent).toContain("No platform role")
  })

  it("bans an account with the reason the ban is logged with", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["member"],
    })
    const target = members[0].user

    const { container, unmount, click } = await render(page(target.id))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes(target.email) === true
    )
    await click(trigger(container, "Ban"))

    const reason = document.querySelector("#ban-reason")
    const confirm = document.querySelector(
      "[role=alertdialog] button[type=submit]"
    )

    if (!(reason && confirm)) {
      throw new Error("the ban dialog did not open")
    }

    await fill(reason, "Abuse report")
    await click(confirm)
    await waitUntilStored(async () => {
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
      })

      return stored.banned === true && stored.banReason === "Abuse report"
    })
  })

  it("offers no ban on a member of the platform organisation", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const colleague = members[0].user

    await joinPlatformOrganization(
      (await bootApiTestServer()).prisma,
      colleague.id,
      "member"
    )

    const { container, unmount } = await render(page(colleague.id))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes(colleague.email) === true
    )

    expect(
      [...document.querySelectorAll("button")].some(
        (button) => (button.textContent ?? "").trim() === "Ban"
      )
    ).toBe(false)
  })

  it("leaves a reader of the platform without the ban", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["member"],
    })
    const target = members[0].user

    const { container, unmount } = await render(
      withDashboard(<AdminUserDetail id={target.id} />, {
        platformRole: "member",
      })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes(target.email) === true
    )

    expect(
      [...document.querySelectorAll("button")].some(
        (button) => (button.textContent ?? "").trim() === "Ban"
      )
    ).toBe(false)
  })
})
