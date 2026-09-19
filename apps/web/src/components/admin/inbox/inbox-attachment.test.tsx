import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test"
import { ingestInboundEmail } from "@pupitre/api/mail/ingest"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import {
  type FakeMail,
  resetFakeMail,
  useFakeMail,
} from "@pupitre/api/testing/mail"
import { InboxAttachment } from "@/components/admin/inbox/inbox-attachment"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { render, trigger, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

const ADDRESS = "support@pupitre.studio"

const SENDER = "ada@test.local"

const PNG_BYTES =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

function eml(): ArrayBuffer {
  const lines = [
    `From: Ada Lovelace <${SENDER}>`,
    `To: ${ADDRESS}`,
    "Subject: Screenshot and dump",
    `Message-ID: <${crypto.randomUUID()}@test.local>`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="mix"',
    "",
    "--mix",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "Here is what the agent shows.",
    "",
    "--mix",
    'Content-Type: image/png; name="screen.png"',
    'Content-Disposition: attachment; filename="screen.png"',
    "Content-Transfer-Encoding: base64",
    "",
    PNG_BYTES,
    "",
    "--mix",
    'Content-Type: application/octet-stream; name="core.bin"',
    'Content-Disposition: attachment; filename="core.bin"',
    "Content-Transfer-Encoding: base64",
    "",
    btoa("abc"),
    "",
    "--mix--",
    "",
  ]

  return new TextEncoder().encode(lines.join("\r\n")).buffer as ArrayBuffer
}

async function receive() {
  const { threadId } = await ingestInboundEmail({
    envelopeFrom: SENDER,
    envelopeTo: ADDRESS,
    raw: eml(),
  })
  const { prisma } = await bootApiTestServer()
  const stored = await prisma.mailAttachment.findMany({
    where: { message: { threadId } },
    orderBy: { filename: "asc" },
  })

  return stored.map((attachment) => ({
    id: attachment.id,
    filename: attachment.filename,
    mime_type: attachment.mimeType,
    size: attachment.size,
  }))
}

describe("InboxAttachment", () => {
  let mail: FakeMail
  const opened = mock((_url: string) => null)
  const nativeOpen = window.open

  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    mail = useFakeMail()
    opened.mockClear()
    window.open = opened as unknown as typeof window.open

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

    window.open = nativeOpen
    resetFakeMail()
  })

  it("opens an image in the viewer on a URL signed when it opens", async () => {
    const [, image] = await receive()
    const { container, unmount, click } = await render(
      withDashboard(<InboxAttachment attachment={image} />, {
        platformRole: "owner",
      })
    )

    mounted.push(unmount)

    expect(container.textContent).toContain("screen.png")
    expect(mail.signed).toHaveLength(0)

    await click(trigger(container, "View screen.png"))
    await waitUntil(() => document.querySelector("[role=dialog] img") !== null)

    const shown = document.querySelector("[role=dialog] img")

    expect(shown?.getAttribute("alt")).toBe("screen.png")
    expect(shown?.getAttribute("src")).toStartWith("https://")
    expect(mail.signed).toHaveLength(1)
    expect(mail.signed[0].method).toBe("GET")
    expect(mail.signed[0].disposition).toStartWith("inline")
    expect(document.querySelector("[role=dialog]")?.textContent).toContain(
      "screen.png"
    )
  })

  it("only offers to save a file it cannot show, through a URL signed on the click", async () => {
    const [dump] = await receive()
    const { container, unmount, click } = await render(
      withDashboard(<InboxAttachment attachment={dump} />, {
        platformRole: "owner",
      })
    )

    mounted.push(unmount)

    expect(container.textContent).toContain("core.bin")
    expect(container.textContent).toContain("3 B")
    expect(container.querySelector("[aria-label='View core.bin']")).toBeNull()

    await click(trigger(container, "Download core.bin"))
    await waitUntil(() => opened.mock.calls.length === 1)

    expect(opened.mock.calls[0][0]).toStartWith("https://")
    expect(mail.signed).toHaveLength(1)
    expect(mail.signed[0].disposition).toStartWith("attachment")
  })
})
