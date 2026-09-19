import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { ingestInboundEmail } from "@pupitre/api/mail/ingest"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { resetFakeMail, useFakeMail } from "@pupitre/api/testing/mail"
import { act } from "react"
import { InboxList } from "@/components/admin/inbox/inbox-list"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

const SETTLE_MS = 50

const ADDRESS = "support@pupitre.studio"

/** The address list lands after the threads: it must settle before the container goes. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
  })
}

function eml(subject: string): ArrayBuffer {
  const lines = [
    "From: Ada Lovelace <ada@test.local>",
    `To: ${ADDRESS}`,
    `Subject: ${subject}`,
    `Message-ID: <${crypto.randomUUID()}@test.local>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "My server refuses the agent.",
    "",
  ]

  return new TextEncoder().encode(lines.join("\r\n")).buffer as ArrayBuffer
}

function receive(subject: string) {
  return ingestInboundEmail({
    envelopeFrom: "ada@test.local",
    envelopeTo: ADDRESS,
    raw: eml(subject),
  })
}

describe("InboxList", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeMail()

    const console = await createConsoleUser({
      email: "ops@test.local",
      role: "platform_admin",
    })

    await useSessionApiClient(console.token)
  })

  afterEach(async () => {
    await settle()

    for (const unmount of mounted.splice(0)) {
      unmount()
    }

    resetFakeMail()
  })

  it("lists a received conversation with its sender, address and message count", async () => {
    await receive("Agent refused")

    const { container, unmount } = await render(
      withDashboard(<InboxList />, { platformRole: "owner" })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Agent refused") === true
    )

    expect(container.textContent).toContain("Ada Lovelace")
    expect(container.textContent).toContain("My server refuses the agent.")
    expect(container.textContent).toContain(ADDRESS)
    expect(container.textContent).toContain("1 message")
    expect(container.textContent).toContain("Nobody assigned")
    expect(container.textContent).toContain("1 conversation still unread")
    expect(container.querySelectorAll("ul > li")).toHaveLength(1)
  })

  it("says so when no conversation matches", async () => {
    const { container, unmount } = await render(
      withDashboard(<InboxList />, { platformRole: "owner" })
    )

    mounted.push(unmount)

    await waitUntil(
      () =>
        container.textContent?.includes(
          "No conversation matches these filters."
        ) === true
    )

    expect(container.querySelectorAll("ul > li")).toHaveLength(0)
  })

  it("offers the compose gesture to an admin and withholds it from a member", async () => {
    const asAdmin = await render(
      withDashboard(<InboxList />, { platformRole: "admin" })
    )

    mounted.push(asAdmin.unmount)

    await waitUntil(
      () => asAdmin.container.textContent?.includes("Write an email") === true
    )

    const asMember = await render(
      withDashboard(<InboxList />, { platformRole: "member" })
    )

    mounted.push(asMember.unmount)

    await waitUntil(
      () => asMember.container.textContent?.includes("Unread only") === true
    )

    expect(asMember.container.textContent).not.toContain("Write an email")
  })
})
