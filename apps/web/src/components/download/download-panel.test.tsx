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

function panel() {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <DownloadPanel />
    </QueryClientProvider>
  )
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
      "Aucune version de Pupitre n'a encore été publiée"
    )
    expect(container.querySelectorAll("a")).toHaveLength(0)
    expect(container.textContent).not.toContain("Télécharger pour")
    expect(container.textContent).toContain("Pas encore publié")
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

  it("reads the published version from the releases API", async () => {
    const { prisma } = await bootApiTestServer()

    await prisma.release.create({
      data: {
        version: "1.4.0",
        arch: "amd64",
        sha256: "a".repeat(64),
        signature: `${"b".repeat(86)}==`,
        r2Key: "agent/1.4.0/amd64",
        channel: "stable",
      },
    })

    const { container, unmount } = await render(panel())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("1.4.0") === true)

    expect(container.textContent).toContain("Version 1.4.0")
    expect(container.textContent).toContain(
      "les installateurs de l'app ne le sont pas encore"
    )
  })
})
