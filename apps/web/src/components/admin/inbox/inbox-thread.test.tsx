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
  seedPlatformMailboxes,
  useFakeMail,
} from "@pupitre/api/testing/mail"
import { act } from "react"
import { InboxThread } from "@/components/admin/inbox/inbox-thread"
import { parseInboxSearch } from "@/lib/domain/inbox-search"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import {
  render,
  trigger,
  waitUntil,
  waitUntilStored,
  withDashboard,
} from "@/testing/render"

const mounted: (() => void)[] = []

const MARK_TOGGLE_RE = /Mark (read|unread)/

const ADDRESS = "support@pupitre.studio"

const SENDER = "ada@test.local"

const INBOUND_MESSAGE_ID = "agent-refused-1@test.local"

const REPLY = "The agent needs the key we just sent you."

const SEARCH = parseInboxSearch({})

function eml(): ArrayBuffer {
  const lines = [
    `From: Ada Lovelace <${SENDER}>`,
    `To: ${ADDRESS}`,
    "Cc: bo@test.local",
    "Subject: Agent refused",
    `Message-ID: <${INBOUND_MESSAGE_ID}>`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="mix"',
    "",
    "--mix",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "My server refuses the agent.",
    "",
    "--mix",
    "Content-Type: text/html; charset=UTF-8",
    "",
    "<p>My server refuses the agent.</p>",
    "",
    "--mix",
    'Content-Type: text/plain; name="journal.txt"',
    'Content-Disposition: attachment; filename="journal.txt"',
    "Content-Transfer-Encoding: base64",
    "",
    btoa("error 502"),
    "",
    "--mix--",
    "",
  ]

  return new TextEncoder().encode(lines.join("\r\n")).buffer as ArrayBuffer
}

function receive() {
  return ingestInboundEmail({
    envelopeFrom: SENDER,
    envelopeTo: ADDRESS,
    raw: eml(),
  })
}

async function fillTextarea(element: Element, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set

  await act(async () => {
    setter?.call(element, value)
    element.dispatchEvent(new Event("input", { bubbles: true }))
    await Promise.resolve()
  })
}

describe("InboxThread", () => {
  let mail: FakeMail

  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    mail = useFakeMail()
    await seedPlatformMailboxes()

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

    resetFakeMail()
  })

  it("shows the exchange and marks the conversation read once opened", async () => {
    const { threadId } = await receive()
    const { prisma } = await bootApiTestServer()
    const { container, unmount, click } = await render(
      withDashboard(<InboxThread search={SEARCH} threadId={threadId} />, {
        platformRole: "owner",
      })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Ada Lovelace") === true
    )

    expect(container.textContent).toContain("Agent refused")
    expect(container.textContent).toContain(`To ${ADDRESS}`)
    expect(container.textContent).toContain("Cc bo@test.local")
    expect(container.textContent).toContain("journal.txt")
    expect(container.querySelector("iframe")).not.toBeNull()

    await click(trigger(container, "Show the plain text"))

    expect(container.textContent).toContain("My server refuses the agent.")

    await waitUntilStored(async () => {
      const stored = await prisma.mailThread.findUniqueOrThrow({
        where: { id: threadId },
      })

      return stored.unread === false
    })
  })

  it("sends a reply as an admin, and the sender carries it back to the message answered", async () => {
    const { threadId } = await receive()
    const { prisma } = await bootApiTestServer()
    const { container, unmount, click } = await render(
      withDashboard(<InboxThread search={SEARCH} threadId={threadId} />, {
        platformRole: "owner",
      })
    )

    mounted.push(unmount)

    await waitUntil(() => container.querySelector("#inbox-reply") !== null)

    const composer = container.querySelector("#inbox-reply")

    if (!(composer instanceof HTMLTextAreaElement)) {
      throw new Error("the reply composer did not render")
    }

    await fillTextarea(composer, REPLY)
    await click(trigger(container, "Send"))

    await waitUntilStored(async () => {
      const sent = await prisma.mailMessage.findFirst({
        where: { threadId, direction: "outbound" },
      })

      return sent?.delivery === "sent"
    })

    const sent = await prisma.mailMessage.findFirstOrThrow({
      where: { threadId, direction: "outbound" },
    })

    expect(sent.text).toBe(REPLY)
    expect(sent.error).toBeNull()
    expect(sent.sentAt).not.toBeNull()
    expect(sent.inReplyTo).toBe(INBOUND_MESSAGE_ID)

    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0].from).toBe(ADDRESS)
    expect(mail.sent[0].to).toEqual([SENDER])
    expect(mail.sent[0].raw).toContain(`In-Reply-To: <${INBOUND_MESSAGE_ID}>`)

    await waitUntil(() => composer.value === "")

    expect(container.textContent).not.toContain("The reply was not sent.")
  })

  it("puts a chosen file in the bucket itself, then sends the reply carrying its key", async () => {
    const { threadId } = await receive()
    const { prisma } = await bootApiTestServer()
    const puts: { url: string; body: string; contentType: string | null }[] = []
    const nativeFetch = globalThis.fetch
    const bucket = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = await new Response(init?.body).arrayBuffer()
        const contentType = new Headers(init?.headers).get("content-type")
        const slot = mail.signed.find((request) => request.method === "PUT")

        if (!slot) {
          throw new Error("no upload was signed before the PUT")
        }

        await mail.storage.put(slot.key, body, contentType ?? "")
        puts.push({
          url: String(input),
          body: new TextDecoder().decode(body),
          contentType,
        })

        return new Response(null, { status: 200 })
      }
    )

    globalThis.fetch = bucket as unknown as typeof fetch

    try {
      const { container, unmount, click } = await render(
        withDashboard(<InboxThread search={SEARCH} threadId={threadId} />, {
          platformRole: "owner",
        })
      )

      mounted.push(unmount)

      await waitUntil(() => container.querySelector("#inbox-reply") !== null)

      const composer = container.querySelector("#inbox-reply")
      const picker = container.querySelector("#inbox-reply-files")

      if (
        !(
          composer instanceof HTMLTextAreaElement &&
          picker instanceof HTMLInputElement
        )
      ) {
        throw new Error("the reply composer did not render")
      }

      const transfer = new DataTransfer()

      transfer.items.add(
        new File(["agent log"], "notes.txt", { type: "text/plain" })
      )

      await act(async () => {
        picker.files = transfer.files
        picker.dispatchEvent(new Event("change", { bubbles: true }))
        await Promise.resolve()
      })

      expect(container.textContent).toContain("notes.txt")
      expect(mail.signed).toHaveLength(0)

      await fillTextarea(composer, REPLY)
      await click(trigger(container, "Send"))

      await waitUntilStored(async () => {
        const sent = await prisma.mailMessage.findFirst({
          where: { threadId, direction: "outbound" },
        })

        return sent?.delivery === "sent"
      })

      const sent = await prisma.mailMessage.findFirstOrThrow({
        where: { threadId, direction: "outbound" },
        include: { attachments: true },
      })
      const slot = mail.signed.find((request) => request.method === "PUT")

      expect(puts).toHaveLength(1)
      expect(puts[0].url).toContain("X-Amz-Signature")
      expect(puts[0].body).toBe("agent log")
      expect(puts[0].contentType).toBe("text/plain")
      expect(slot?.key).toStartWith("mail/uploads/")
      expect(sent.attachments.map((attachment) => attachment.filename)).toEqual(
        ["notes.txt"]
      )
      expect(sent.attachments[0].mimeType).toBe("text/plain")
      expect(sent.attachments[0].size).toBe(9)
      expect(mail.sent[0].raw).toContain('filename="notes.txt"')

      await waitUntil(() => composer.value === "")

      expect(
        container.querySelector("[aria-label='Remove notes.txt']")
      ).toBeNull()

      await waitUntil(
        () =>
          container.querySelector("[aria-label='Download notes.txt']") !== null
      )
    } finally {
      globalThis.fetch = nativeFetch
    }
  })

  it("folds the side pane away and names the key that closes the conversation", async () => {
    const { threadId } = await receive()
    const { container, unmount } = await render(
      withDashboard(<InboxThread search={SEARCH} threadId={threadId} />, {
        platformRole: "owner",
      })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Agent refused") === true
    )

    const panels = [...container.querySelectorAll("details")]
    const back = container.querySelector("a[href*='/dashboard/admin/inbox']")

    expect(
      panels.map((panel) => panel.querySelector("h2")?.textContent)
    ).toEqual(["Details", "Internal notes", "Activity"])
    expect(panels.every((panel) => panel.open)).toBe(true)
    expect(back?.getAttribute("title")).toBe(
      "Close the conversation or the selection · Esc"
    )
  })

  it("keeps the reply as a draft, and throws it away once the composer is emptied", async () => {
    const { threadId } = await receive()
    const { prisma } = await bootApiTestServer()
    const { container, unmount } = await render(
      withDashboard(<InboxThread search={SEARCH} threadId={threadId} />, {
        platformRole: "owner",
      })
    )

    mounted.push(unmount)

    await waitUntil(() => container.querySelector("#inbox-reply") !== null)

    const composer = container.querySelector("#inbox-reply")

    if (!(composer instanceof HTMLTextAreaElement)) {
      throw new Error("the reply composer did not render")
    }

    await fillTextarea(composer, REPLY)

    await waitUntilStored(async () => {
      const draft = await prisma.mailDraft.findUnique({ where: { threadId } })

      return draft?.body === REPLY
    })

    await fillTextarea(composer, "")

    await waitUntilStored(async () => {
      const draft = await prisma.mailDraft.findUnique({ where: { threadId } })

      return draft === null
    })

    expect(container.textContent).not.toContain("Draft kept")
  })

  it("gives a plain member the conversation without the composer", async () => {
    const { threadId } = await receive()
    const { container, unmount } = await render(
      withDashboard(<InboxThread search={SEARCH} threadId={threadId} />, {
        platformRole: "member",
      })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Agent refused") === true
    )

    expect(container.querySelector("#inbox-reply")).toBeNull()
    expect(container.textContent).not.toContain("Close the conversation")
    expect(container.querySelector("#inbox-assignee")).toBeNull()
    expect(container.textContent).toMatch(MARK_TOGGLE_RE)
  })
})
