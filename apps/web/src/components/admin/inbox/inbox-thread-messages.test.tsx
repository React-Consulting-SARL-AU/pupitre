import { afterEach, describe, expect, it } from "bun:test"
import { InboxMessageText } from "@/components/admin/inbox/inbox-message-text"
import { InboxThreadMessages } from "@/components/admin/inbox/inbox-thread-messages"
import type { InboxMessage } from "@/lib/api/inbox-queries"
import { render, trigger, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

function message(rank: number): InboxMessage {
  return {
    id: `msg_${rank}`,
    direction: "inbound",
    from: { email: "ada@test.local", name: "Ada Lovelace" },
    to: ["support@pupitre.studio"],
    cc: [],
    subject: "Agent refused",
    text: `Message number ${rank}`,
    has_html: false,
    automated: false,
    delivery: "received",
    error: null,
    sent_by: null,
    received_at: "2026-09-18T08:00:00.000Z",
    sent_at: null,
    attachments: [],
  }
}

describe("InboxThreadMessages", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("keeps a short thread whole", async () => {
    const { container, unmount } = await render(
      withDashboard(
        <InboxThreadMessages messages={[message(1), message(2)]} />,
        { platformRole: "owner" }
      )
    )

    mounted.push(unmount)

    expect(container.textContent).toContain("Message number 1")
    expect(container.textContent).toContain("Message number 2")
    expect(container.textContent).not.toContain("earlier message")
  })

  it("folds everything past the fifth message, and unfolds it on demand", async () => {
    const messages = [1, 2, 3, 4, 5, 6, 7].map(message)
    const { container, unmount, click } = await render(
      withDashboard(<InboxThreadMessages messages={messages} />, {
        platformRole: "owner",
      })
    )

    mounted.push(unmount)

    expect(container.textContent).toContain("2 earlier messages")
    expect(container.textContent).not.toContain("Message number 1")
    expect(container.textContent).toContain("Message number 7")

    await click(trigger(container, "2 earlier messages"))

    expect(container.textContent).toContain("Message number 1")
  })
})

describe("InboxMessageText", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("folds the quoted history until it is asked for", async () => {
    const { container, unmount, click } = await render(
      withDashboard(
        <InboxMessageText text={"On regarde.\n\n> Mon serveur est tombé"} />,
        { platformRole: "owner" }
      )
    )

    mounted.push(unmount)

    expect(container.textContent).toContain("On regarde.")
    expect(container.textContent).not.toContain("Mon serveur est tombé")

    await click(trigger(container, "Show the quoted history"))

    expect(container.textContent).toContain("Mon serveur est tombé")
  })
})
