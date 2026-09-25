import { afterEach, describe, expect, it } from "bun:test"
import { InboxList } from "@/components/admin/inbox/inbox-list"
import type { InboxMailbox, InboxThread } from "@/lib/api/inbox-queries"
import { parseInboxSearch } from "@/lib/domain/inbox-search"
import { render, trigger, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

const SEARCH = parseInboxSearch({})

const MAILBOX: InboxMailbox = {
  id: "mbx_support",
  address: "support@pupitre.studio",
  display_name: "Support",
  signature: null,
  sensitive: false,
  can_reply: true,
  enabled: true,
  sort_order: 0,
  threads: 1,
  unread: 1,
}

function thread(overrides: Partial<InboxThread> = {}): InboxThread {
  return {
    id: "thr_1",
    address: "support@pupitre.studio",
    mailbox_id: "mbx_support",
    subject: "Agent refused",
    status: "open",
    unread: true,
    assigned_user: null,
    contact: null,
    linked_organization: null,
    from: { email: "ada@test.local", name: "Ada Lovelace" },
    sender_authenticated: true,
    snippet: "My server refuses the agent.",
    messages: 1,
    notes: 0,
    has_draft: false,
    automated: false,
    last_inbound_at: "2026-09-18T08:00:00.000Z",
    last_outbound_at: null,
    updated_at: "2026-09-18T08:00:00.000Z",
    created_at: "2026-09-18T08:00:00.000Z",
    ...overrides,
  }
}

interface ListOverrides {
  threads?: InboxThread[]
  selected?: string[]
  onSelectedChange?: (selected: string[]) => void
  onBulk?: (patch: { status?: "open" | "closed"; unread?: boolean }) => void
  canAct?: boolean
}

function renderList(overrides: ListOverrides = {}) {
  const rows = overrides.threads ?? [thread()]

  return render(
    withDashboard(
      <InboxList
        bulkPending={false}
        canAct={overrides.canAct ?? true}
        failed={false}
        fetching={false}
        focusedId={rows[0]?.id ?? null}
        mailboxes={[MAILBOX]}
        onBulk={overrides.onBulk ?? (() => undefined)}
        onOffsetChange={() => undefined}
        onRetry={() => undefined}
        onSelectedChange={overrides.onSelectedChange ?? (() => undefined)}
        openThreadId={null}
        pending={false}
        search={SEARCH}
        selected={overrides.selected ?? []}
        threads={rows}
        total={rows.length}
      />,
      { platformRole: "owner" }
    )
  )
}

describe("InboxList", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("lists a conversation with its sender, mailbox and badges", async () => {
    const { container, unmount } = await renderList({
      threads: [thread({ has_draft: true, notes: 2 })],
    })

    mounted.push(unmount)

    expect(container.textContent).toContain("Ada Lovelace")
    expect(container.textContent).toContain("Agent refused")
    expect(container.textContent).toContain("My server refuses the agent.")
    expect(container.textContent).toContain("Support")
    expect(container.textContent).toContain("Draft kept")
    expect(container.textContent).toContain("2 internal notes")
    expect(container.textContent).toContain("Nobody assigned")
    expect(container.textContent).not.toContain("Unverified sender")
    expect(container.querySelectorAll("ul > li")).toHaveLength(1)
  })

  it("warns of a sender the receiving server could not authenticate", async () => {
    const { container, unmount } = await renderList({
      threads: [thread({ sender_authenticated: false })],
    })

    mounted.push(unmount)

    expect(container.textContent).toContain("Unverified sender")
  })

  it("names the key in the title of opening and of selecting a conversation", async () => {
    const { container, unmount } = await renderList()

    mounted.push(unmount)

    const box = container.querySelector(
      "[aria-label='Select this conversation']"
    )
    const link = container.querySelector("a[href*='/inbox/thr_1']")

    expect(box?.getAttribute("title")).toBe("Select the conversation · x")
    expect(link?.getAttribute("title")).toBe(
      "Open the conversation · Enter / o"
    )
  })

  it("says so when no conversation matches", async () => {
    const { container, unmount } = await renderList({ threads: [] })

    mounted.push(unmount)

    expect(container.textContent).toContain(
      "No conversation matches these filters."
    )
    expect(container.querySelectorAll("ul > li")).toHaveLength(0)
  })

  it("hands the ticked conversation back to its owner", async () => {
    const picked: string[][] = []
    const { container, unmount, click } = await renderList({
      onSelectedChange: (selected) => {
        picked.push(selected)
      },
    })

    mounted.push(unmount)

    const box = container.querySelector(
      "[aria-label='Select this conversation']"
    )

    if (!box) {
      throw new Error("the row checkbox did not render")
    }

    await click(box)

    expect(picked).toEqual([["thr_1"]])
  })

  it("offers the bulk gestures once something is selected, and closing only to an admin", async () => {
    const asked: { status?: string; unread?: boolean }[] = []
    const { container, unmount, click } = await renderList({
      selected: ["thr_1"],
      onBulk: (patch) => {
        asked.push(patch)
      },
    })

    mounted.push(unmount)

    expect(container.textContent).toContain("1 conversation selected")

    await click(trigger(container, "Close the selection"))

    expect(asked).toEqual([{ status: "closed" }])

    const asMember = await renderList({ selected: ["thr_1"], canAct: false })

    mounted.push(asMember.unmount)

    expect(asMember.container.textContent).not.toContain("Close the selection")
    expect(asMember.container.textContent).toContain("Mark the selection read")
  })
})
