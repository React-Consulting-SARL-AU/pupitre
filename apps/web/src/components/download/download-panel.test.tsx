import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { DownloadPanel } from "@/components/download/download-panel"
import type { DashboardOrganization } from "@/lib/domain/dashboard-context"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

const NOTES =
  "## The app\n\n- Onboarding en trois étapes.\n- Catalogue de services complet."

const KEY_PREFIX = "app/1.4.0"

const DOWNLOADS = `http://localhost/__downloads/${KEY_PREFIX}`

// Only the offer rows: the checklist above carries links of its own.
function offerLinks(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll("ul a")].map((link) =>
    link.getAttribute("href")
  )
}

let organization: DashboardOrganization

function panel() {
  return withDashboard(<DownloadPanel />, {
    organization,
    license: "valid",
  })
}

async function publishEveryOs() {
  const { prisma } = await bootApiTestServer()

  await prisma.appRelease.createMany({
    data: [
      {
        version: "1.4.0",
        os: "macos",
        arch: "arm64",
        format: "dmg",
        r2Key: `${KEY_PREFIX}/Pupitre-1.4.0-arm64.dmg`,
        bytes: 118_000_000,
        sha256: "a".repeat(64),
        notes: NOTES,
        channel: "stable",
      },
      {
        version: "1.4.0",
        os: "windows",
        arch: "x64",
        format: "exe",
        r2Key: `${KEY_PREFIX}/Pupitre-Setup-1.4.0-x64.exe`,
        bytes: 92_000_000,
        sha256: "b".repeat(64),
        notes: NOTES,
        channel: "stable",
      },
      {
        version: "1.4.0",
        os: "linux",
        arch: "x64",
        format: "AppImage",
        r2Key: `${KEY_PREFIX}/Pupitre-1.4.0-x64.AppImage`,
        bytes: 104_000_000,
        sha256: "c".repeat(64),
        notes: NOTES,
        channel: "stable",
      },
    ],
  })
}

describe("DownloadPanel", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    const consoleUser = await createConsoleUser({ email: "ada@test.local" })

    await useSessionApiClient(consoleUser.token)

    organization = {
      id: consoleUser.organization.id,
      name: consoleUser.organization.name,
      slug: consoleUser.organization.slug,
      state: "active",
    }
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("says nothing is published yet instead of showing a dead button", async () => {
    const { container, unmount } = await render(panel())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Nothing to download yet") === true
    )

    expect(container.textContent).toContain(
      "No version of the app has been published yet"
    )
    const links = offerLinks(container)

    expect(links).toEqual([])
    expect(container.textContent).not.toContain("Download for")
    expect(container.textContent).toContain("Not published yet")
    expect(container.textContent).toContain("No version has been published yet")
  })

  it("puts what is left in order, and drops what is done", async () => {
    const { container, unmount } = await render(panel())

    mounted.push(unmount)

    await waitUntil(
      () =>
        container.textContent?.includes(
          "Install the app and link it to your account"
        ) === true
    )

    const text = container.textContent ?? ""
    const order = [
      "Install the app and link it to your account",
      "Rent a server and add it",
    ].map((step) => text.indexOf(step))

    expect(order.every((position) => position >= 0)).toBe(true)
    expect(order[0]).toBeLessThan(order[1])

    expect(text).not.toContain("Create your account")
    expect(text).not.toContain("Start the trial")
  })

  it("still lists the three systems and the requirements", async () => {
    const { container, unmount } = await render(panel())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Requirements") === true
    )

    expect(container.textContent).toContain("macOS")
    expect(container.textContent).toContain("Windows")
    expect(container.textContent).toContain("Linux")
    expect(container.textContent).toContain("macOS 13 or newer")
    expect(container.textContent).toContain("Windows 11")
    expect(container.textContent).toContain("Ubuntu 22.04 or newer")
    expect(container.textContent).toContain("Ubuntu 22.04 or 24.04")
    expect(container.textContent).toContain("4 GB")
  })

  it("shows the three systems, their version and their notes from the API", async () => {
    await publishEveryOs()

    const { container, unmount } = await render(panel())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("1.4.0") === true)

    expect(container.textContent).toContain("Version 1.4.0")
    expect(container.textContent).toContain("Onboarding en trois étapes.")
    expect(container.textContent).toContain("Catalogue de services complet.")
    expect(container.textContent).not.toContain("Not published yet")
    expect(container.textContent).not.toContain("beta")

    const heading = [...container.querySelectorAll("h3")].find((node) =>
      node.textContent?.includes("The app")
    )

    expect(heading).toBeDefined()
    expect(container.querySelectorAll("li").length).toBeGreaterThanOrEqual(2)
    expect(container.textContent).not.toContain("## ")
    expect(container.textContent).not.toContain("- Onboarding")

    const links = offerLinks(container)

    expect(links).toEqual([
      `${DOWNLOADS}/Pupitre-1.4.0-arm64.dmg`,
      `${DOWNLOADS}/Pupitre-Setup-1.4.0-x64.exe`,
      `${DOWNLOADS}/Pupitre-1.4.0-x64.AppImage`,
    ])
  })

  it("offers the beta, and says so, when nothing is stable yet", async () => {
    const { prisma } = await bootApiTestServer()

    await prisma.appRelease.create({
      data: {
        version: "1.5.0",
        os: "macos",
        arch: "arm64",
        format: "dmg",
        r2Key: "app/1.5.0/Pupitre-1.5.0-arm64.dmg",
        bytes: 118_000_000,
        sha256: "d".repeat(64),
        notes: "Canal beta.",
        channel: "beta",
      },
    })

    const { container, unmount } = await render(panel())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("1.5.0") === true)

    expect(container.textContent).toContain("beta")
    expect(container.textContent).toContain("Canal beta.")
  })

  it("keeps the stable version in front of a newer beta", async () => {
    const { prisma } = await bootApiTestServer()

    await publishEveryOs()
    await prisma.appRelease.create({
      data: {
        version: "1.5.0",
        os: "macos",
        arch: "arm64",
        format: "dmg",
        r2Key: "app/1.5.0/Pupitre-1.5.0-arm64.dmg",
        bytes: 118_000_000,
        sha256: "d".repeat(64),
        notes: "Canal beta.",
        channel: "beta",
      },
    })

    const { container, unmount } = await render(panel())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("1.4.0") === true)

    expect(container.textContent).not.toContain("1.5.0")
    expect(container.textContent).not.toContain("beta")
  })
})
