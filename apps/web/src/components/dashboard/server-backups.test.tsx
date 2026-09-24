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
import { ServerBackups } from "@/components/dashboard/server-backups"
import { apiJson, useSessionApiClient } from "@/testing/harness"
import { render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

async function serverWithBackup() {
  const { organization, members } = await createOrganizationWithMembers({
    roles: ["owner"],
    subscription: {},
  })
  const [owner] = members
  const { server, token } = await createServer({
    organizationId: organization.id,
    assignedUserId: owner.user.id,
  })
  const declared = await apiJson("/agent/backups", {
    method: "POST",
    bearer: token,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "20260919T031500Z-7f3a2c",
      created_at: "2026-09-19T03:15:00Z",
      trigger: "schedule",
      bytes: 2048,
      counts: { setup: true, home: true, databases: 0, projects: 1, paths: 0 },
      config_revision: 4,
      agent_version: "1.8.0",
      recipient: "A10gydBSR5g4m/L8q8Msuz7sSJNSPyytp4QgelrXxEw=",
      kdf_salt: "lneDgZnxLTb17pcdSfaKvA==",
      location: {
        endpoint: "https://acc.r2.cloudflarestorage.com",
        region: "auto",
        bucket: "pupitre-backups",
        key: "pupitre/srv/20260919T031500Z-7f3a2c",
        path_style: true,
        sha256: "a".repeat(64),
      },
    }),
  })

  expect(declared.status).toBe(201)

  return { organization, owner, server }
}

describe("ServerBackups", () => {
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

  it("shows the beat, its error, and the server's backups", async () => {
    const { organization, owner, server } = await serverWithBackup()

    await useSessionApiClient(owner.token)

    const view = await render(
      withDashboard(
        <ServerBackups
          beat={{
            interval_hours: 24,
            last_run_at: new Date().toISOString(),
            last_ok_at: new Date(Date.now() - 86_400_000 * 2).toISOString(),
            last_error: "PutObject: AccessDenied",
          }}
          serverId={server.id}
        />,
        { organization, entitlement: "valid" }
      )
    )

    mounted.push(view.unmount)

    await waitUntil(() => (view.container.textContent ?? "").includes("2.0 kB"))

    expect(view.container.textContent).toContain("Every 24 h")
    expect(view.container.textContent).toContain("2 d ago")
    expect(view.container.textContent).toContain("PutObject: AccessDenied")
    expect(view.container.textContent).toContain(
      "Scheduled · Setup · Home folder · 1 project"
    )
  })

  it("says what the last backup lacks instead of an empty error", async () => {
    const { organization, owner, server } = await serverWithBackup()

    await useSessionApiClient(owner.token)

    const now = new Date().toISOString()
    const view = await render(
      withDashboard(
        <ServerBackups
          beat={{
            interval_hours: 24,
            last_run_at: now,
            last_ok_at: now,
            last_warnings: 2,
          }}
          serverId={server.id}
        />,
        { organization, entitlement: "valid" }
      )
    )

    mounted.push(view.unmount)

    await waitUntil(() => (view.container.textContent ?? "").includes("2.0 kB"))

    expect(view.container.textContent).toContain(
      "2 parts missing from the last backup"
    )
  })

  it("says where backups are set up when the server has none", async () => {
    const { organization, owner, server } = await serverWithBackup()

    await useSessionApiClient(owner.token)

    const view = await render(
      withDashboard(<ServerBackups beat={null} serverId={server.id} />, {
        organization,
        entitlement: "valid",
      })
    )

    mounted.push(view.unmount)

    await waitUntil(() => (view.container.textContent ?? "").includes("2.0 kB"))

    expect(view.container.textContent).toContain(
      "No backup is set up on this server."
    )
    expect(view.container.textContent).toContain("from the Pupitre app")
  })
})
