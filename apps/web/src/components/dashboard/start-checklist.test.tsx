import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { createServer } from "@pupitre/api/testing/factories"
import type { OrgRole } from "@pupitre/shared/permissions"
import type { ServerStatus } from "@pupitre/shared/platform-api"
import { StartChecklist } from "@/components/dashboard/start-checklist"
import type { DashboardOrganization } from "@/lib/domain/dashboard-context"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

let organization: DashboardOrganization
let userId: string

interface Mount {
  role?: OrgRole
  compact?: boolean
}

function list({ role = "owner", compact }: Mount) {
  return withDashboard(<StartChecklist compact={compact} />, {
    organization,
    role,
  })
}

function doneSteps(container: HTMLElement): number {
  return container.querySelectorAll('[data-shape="filled"]').length
}

function currentStep(container: HTMLElement): string {
  return container.querySelector('[aria-current="step"]')?.textContent ?? ""
}

async function linkDevice() {
  const { prisma } = await bootApiTestServer()

  await prisma.device.create({
    data: {
      userId,
      name: "Le laptop d'Ada",
      publicKey: "ssh-ed25519 AAAA",
      fingerprint: `SHA256:${crypto.randomUUID()}`,
    },
  })
}

function seedServer(status: ServerStatus) {
  return createServer({ organizationId: organization.id, status })
}

describe("StartChecklist", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    const console = await createConsoleUser({ email: "ada@test.local" })

    await useSessionApiClient(console.token)

    userId = console.user.id
    organization = {
      id: console.organization.id,
      name: console.organization.name,
      slug: console.organization.slug,
      state: "active",
    }
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("starts at one step done out of three, and asks for the app", async () => {
    const { container, unmount } = await render(list({}))

    mounted.push(unmount)

    await waitUntil(() => currentStep(container).length > 0)

    expect(doneSteps(container)).toBe(1)
    expect(currentStep(container)).toContain(
      "Install the app and link it to your account"
    )
    expect(container.textContent).toContain("Rent a server and add it")

    const links = [...container.querySelectorAll("a")].map((link) =>
      link.getAttribute("href")
    )

    expect(links).toContain("/dashboard/download")
  })

  it("gives a member the same path as the owner", async () => {
    const { container, unmount } = await render(list({ role: "member" }))

    mounted.push(unmount)

    await waitUntil(() => currentStep(container).length > 0)

    expect(currentStep(container)).toContain(
      "Install the app and link it to your account"
    )
  })

  it("moves on to the server as soon as a device is linked, and says where to rent", async () => {
    await linkDevice()

    const { container, unmount } = await render(list({}))

    mounted.push(unmount)

    await waitUntil(() => doneSteps(container) === 2)

    expect(currentStep(container)).toContain("Rent a server and add it")
    expect(container.textContent).toContain("4 GB of memory at least")

    const guide = [...container.querySelectorAll("a")].find(
      (link) => link.textContent?.includes("Which server to rent") === true
    )

    expect(guide?.getAttribute("href")).toContain("/docs/start/vps/")
    expect(guide?.getAttribute("target")).toBe("_blank")
  })

  it("says enrolment is in progress until the server has spoken", async () => {
    await linkDevice()
    await seedServer("enrolling")

    const { container, unmount } = await render(list({}))

    mounted.push(unmount)

    await waitUntil(
      () => container.querySelector('[data-shape="breathing"]') !== null
    )

    expect(container.textContent).toContain("Enrolment under way")
    expect(doneSteps(container)).toBe(2)
  })

  it("keeps only what remains when space runs short", async () => {
    await linkDevice()

    const { container, unmount } = await render(list({ compact: true }))

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Rent a server and add it") === true
    )

    expect(container.querySelectorAll("ol > li")).toHaveLength(1)
    expect(container.textContent).not.toContain("Create your account")
    expect(container.textContent).not.toContain("Install the app")
  })
})
