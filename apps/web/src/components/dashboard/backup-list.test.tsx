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
import {
  BackupList,
  type BackupListSearch,
} from "@/components/dashboard/backup-list"
import { ToastProvider } from "@/components/ui/toast"
import { apiJson, useSessionApiClient } from "@/testing/harness"
import { ListSearchHarness } from "@/testing/list-search"
import { render, trigger, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

async function declare(token: string, id: string) {
  const response = await apiJson("/agent/backups", {
    method: "POST",
    bearer: token,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id,
      created_at: "2026-09-19T03:15:00Z",
      trigger: "manual",
      bytes: 1_610_612_736,
      counts: { setup: true, home: false, databases: 2, projects: 3, paths: 0 },
      config_revision: 4,
      agent_version: "1.8.0",
      recipient: "A10gydBSR5g4m/L8q8Msuz7sSJNSPyytp4QgelrXxEw=",
      kdf_salt: "lneDgZnxLTb17pcdSfaKvA==",
      location: {
        endpoint: "https://acc.r2.cloudflarestorage.com",
        region: "auto",
        bucket: "pupitre-backups",
        key: `pupitre/srv/${id}`,
        path_style: true,
        sha256: "a".repeat(64),
      },
    }),
  })

  expect(response.status).toBe(201)
}

async function seed(role: OrgRole) {
  const { organization, members } = await createOrganizationWithMembers({
    roles: ["owner", role],
    subscription: {},
  })
  const [owner, viewer] = members
  const kept = await createServer({
    organizationId: organization.id,
    name: "vps-kept",
    assignedUserId: viewer.user.id,
  })
  const removed = await createServer({
    organizationId: organization.id,
    name: "vps-removed",
    assignedUserId: owner.user.id,
  })

  await declare(kept.token, "20260919T031500Z-aaaaaa")
  await declare(removed.token, "20260918T031500Z-bbbbbb")

  const { prisma } = await bootApiTestServer()

  await prisma.server.delete({ where: { id: removed.server.id } })

  return { organization, viewer }
}

async function mount(
  organization: { id: string; name: string; slug: string },
  role: OrgRole
) {
  const view = await render(
    withDashboard(
      <ToastProvider>
        <ListSearchHarness<BackupListSearch>>
          {(handle) => <BackupList {...handle} />}
        </ListSearchHarness>
      </ToastProvider>,
      { organization, role, entitlement: "valid" }
    )
  )

  mounted.push(view.unmount)

  return view
}

describe("BackupList", () => {
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

  it("lists the organisation's backups with size and contents, and forgets one whose server is gone", async () => {
    const { organization, viewer } = await seed("admin")

    await useSessionApiClient(viewer.token)

    const view = await mount(organization, "admin")

    await waitUntil(() =>
      (view.container.textContent ?? "").includes("vps-removed · removed")
    )

    expect(view.container.textContent).toContain("vps-kept")
    expect(view.container.textContent).toContain("1.5 GB")
    expect(view.container.textContent).toContain(
      "Setup · 3 projects · 2 databases"
    )
    expect(
      [...view.container.querySelectorAll("button")].filter(
        (button) => button.textContent === "Forget"
      )
    ).toHaveLength(1)

    await view.click(trigger(view.container, "Forget"))
    await waitUntil(() => document.querySelector("[role=alertdialog]") !== null)

    const dialog = document.querySelector("[role=alertdialog]")
    const confirm = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Forget"
    )

    if (!confirm) {
      throw new Error("no confirmation button")
    }

    expect(dialog?.textContent).toContain("stay in your bucket")

    await view.click(confirm)
    await waitUntil(() =>
      (document.body.textContent ?? "").includes(
        "Backup of vps-removed forgotten."
      )
    )

    expect(view.container.textContent).not.toContain("vps-removed")
  })

  it("shows a member only the backups of their servers, without forgetting", async () => {
    const { organization, viewer } = await seed("member")

    await useSessionApiClient(viewer.token)

    const view = await mount(organization, "member")

    await waitUntil(() =>
      (view.container.textContent ?? "").includes("vps-kept")
    )

    expect(view.container.textContent).not.toContain("vps-removed")
    expect(
      [...view.container.querySelectorAll("button")].map(
        (button) => button.textContent
      )
    ).not.toContain("Forget")
  })
})
