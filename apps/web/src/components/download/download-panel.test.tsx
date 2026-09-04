import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { QueryClientProvider } from "@tanstack/react-query"
import { DownloadPanel } from "@/components/download/download-panel"
import { createQueryClient } from "@/lib/query/client"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { render, waitUntil } from "@/testing/render"

const mounted: (() => void)[] = []

const NOTES = "Onboarding en trois étapes.\nCatalogue de services complet."

const BASE = "https://downloads.pupitre.studio/1.4.0"

function panel() {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <DownloadPanel />
    </QueryClientProvider>
  )
}

async function publishEveryOs() {
  const { prisma } = await bootApiTestServer()

  await prisma.appRelease.createMany({
    data: [
      {
        version: "1.4.0",
        os: "macos",
        arch: "arm64",
        url: `${BASE}/Pupitre-1.4.0.dmg`,
        sha256: "a".repeat(64),
        notes: NOTES,
        channel: "stable",
      },
      {
        version: "1.4.0",
        os: "windows",
        url: `${BASE}/Pupitre-Setup-1.4.0.exe`,
        sha256: "b".repeat(64),
        notes: NOTES,
        channel: "stable",
      },
      {
        version: "1.4.0",
        os: "linux",
        url: `${BASE}/Pupitre-1.4.0.AppImage`,
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

    const { token } = await createConsoleUser({ email: "ada@test.local" })

    await useSessionApiClient(token)
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
      () =>
        container.textContent?.includes("Rien à télécharger pour l'instant") ===
        true
    )

    expect(container.textContent).toContain(
      "Aucune version de l'app n'a encore été publiée"
    )
    expect(container.querySelectorAll("a")).toHaveLength(0)
    expect(container.textContent).not.toContain("Télécharger pour")
    expect(container.textContent).toContain("Pas encore publié")
    expect(container.textContent).toContain("il n'y a donc rien à raconter ici")
  })

  it("still lists the three systems and the requirements", async () => {
    const { container, unmount } = await render(panel())

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Configuration requise") === true
    )

    expect(container.textContent).toContain("macOS")
    expect(container.textContent).toContain("Windows")
    expect(container.textContent).toContain("Linux")
    expect(container.textContent).toContain("macOS 13 ou plus récent")
    expect(container.textContent).toContain("Windows 11")
    expect(container.textContent).toContain("Ubuntu 22.04 ou plus récent")
    expect(container.textContent).toContain("Ubuntu 22.04 ou 24.04")
    expect(container.textContent).toContain("4 Go")
  })

  it("shows the three systems, their version and their notes from the API", async () => {
    await publishEveryOs()

    const { container, unmount } = await render(panel())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("1.4.0") === true)

    expect(container.textContent).toContain("Version 1.4.0")
    expect(container.textContent).toContain("Onboarding en trois étapes.")
    expect(container.textContent).toContain("Catalogue de services complet.")
    expect(container.textContent).not.toContain("Pas encore publié")

    const links = [...container.querySelectorAll("a")].map((link) =>
      link.getAttribute("href")
    )

    expect(links).toEqual([
      `${BASE}/Pupitre-1.4.0.dmg`,
      `${BASE}/Pupitre-Setup-1.4.0.exe`,
      `${BASE}/Pupitre-1.4.0.AppImage`,
    ])
  })

  it("ignores a version that is only in the beta channel", async () => {
    const { prisma } = await bootApiTestServer()

    await prisma.appRelease.create({
      data: {
        version: "1.5.0-beta.1",
        os: "macos",
        url: `${BASE}/Pupitre-1.5.0-beta.1.dmg`,
        sha256: "d".repeat(64),
        notes: "Canal beta.",
        channel: "beta",
      },
    })

    const { container, unmount } = await render(panel())

    mounted.push(unmount)

    await waitUntil(
      () =>
        container.textContent?.includes("Rien à télécharger pour l'instant") ===
        true
    )

    expect(container.textContent).not.toContain("1.5.0-beta.1")
  })
})
