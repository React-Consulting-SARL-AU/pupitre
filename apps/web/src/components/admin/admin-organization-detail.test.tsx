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
import { AdminOrganizationDetail } from "@/components/admin/admin-organization-detail"
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

describe("AdminOrganizationDetail", () => {
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

  it("shows the members, the servers and the subscriptions of one organisation", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner", "member"],
      subscription: { quantity: 3, status: "active" },
    })

    await createServer({ organizationId: organization.id, name: "vps-one" })

    const { container, unmount } = await render(
      withDashboard(<AdminOrganizationDetail id={organization.id} />, {
        platformRole: "owner",
      })
    )

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-one") === true)

    expect(container.textContent).toContain(organization.slug)
    expect(container.textContent).toContain(members[0].user.email)
    expect(container.textContent).toContain(members[1].user.email)
    expect(container.textContent).toContain("3 seats")
    expect(container.textContent).toContain("Active")
  })

  it("says plainly when an organisation has neither server nor subscription", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Seule",
      roles: ["owner"],
    })

    const { container, unmount } = await render(
      withDashboard(<AdminOrganizationDetail id={organization.id} />, {
        platformRole: "member",
      })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("No server.") === true
    )

    expect(container.textContent).toContain("No subscription, past or present.")
    expect(container.querySelectorAll("button")).toHaveLength(0)
  })

  it("grants a subscription outside Stripe and shows its row", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })

    const { container, unmount, click } = await render(
      withDashboard(<AdminOrganizationDetail id={organization.id} />, {
        platformRole: "owner",
      })
    )

    mounted.push(unmount)

    await waitUntil(
      () =>
        container.textContent?.includes("No subscription, past or present.") ===
        true
    )
    await click(trigger(container, "Grant a subscription"))

    const seats = document.querySelector(`#grant-${organization.id}-seats`)
    const note = document.querySelector(`#grant-${organization.id}-note`)
    const confirm = document.querySelector("[role=dialog] button[type=submit]")

    if (!(seats && note && confirm)) {
      throw new Error("the grant dialog did not open")
    }

    await fill(seats, "3")
    await fill(note, "Partner of the launch")
    await click(confirm)
    await waitUntilStored(async () => {
      const stored = await prisma.subscription.findFirst({
        where: { organizationId: organization.id },
      })

      return (
        stored?.product === "granted" &&
        stored.quantity === 3 &&
        stored.note === "Partner of the launch"
      )
    })
    await waitUntil(() => container.textContent?.includes("3 seats") === true)

    expect(container.textContent).toContain("Granted")
    expect(container.textContent).toContain(
      "A subscription is live: stop it before granting another."
    )
  })

  it("keeps the grant shut while a subscription is live", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
      subscription: { quantity: 2, status: "active" },
    })

    const { container, unmount } = await render(
      withDashboard(<AdminOrganizationDetail id={organization.id} />, {
        platformRole: "admin",
      })
    )

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("2 seats") === true)

    expect(
      trigger(container, "Grant a subscription").hasAttribute("disabled")
    ).toBe(true)
    expect(container.textContent).toContain(
      "A subscription is live: stop it before granting another."
    )
  })
})
