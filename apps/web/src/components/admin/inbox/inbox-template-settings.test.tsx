import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { seedPlatformMailboxes } from "@pupitre/api/testing/mail"
import { PLATFORM_MAILBOX_IDS } from "@pupitre/shared/platform"
import { act } from "react"
import { InboxTemplateSettings } from "@/components/admin/inbox/inbox-template-settings"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import {
  render,
  trigger,
  waitUntil,
  waitUntilStored,
  withDashboard,
} from "@/testing/render"

const mounted: (() => void)[] = []

const NAME = "Accusé de réception"

const RENAMED = "Accusé de réception, version courte"

const BODY = "Bonjour, nous avons bien reçu votre message."

const MAILBOXES = [
  {
    id: PLATFORM_MAILBOX_IDS.support,
    address: "support@pupitre.studio",
    display_name: "Support",
    signature: null,
    sensitive: false,
    can_reply: true,
    enabled: true,
    sort_order: 0,
    threads: 0,
    unread: 0,
  },
]

async function fillField(element: Element, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    "value"
  )?.set

  await act(async () => {
    setter?.call(element, value)
    element.dispatchEvent(new Event("input", { bubbles: true }))
    await Promise.resolve()
  })
}

describe("InboxTemplateSettings", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    await seedPlatformMailboxes()

    const console = await createConsoleUser({
      email: "ops@test.local",
      role: "platform_admin",
    })

    await useSessionApiClient(console.token)
    await (await bootApiTestServer()).prisma.mailTemplate.create({
      data: { id: "tpl_1", name: NAME, body: BODY, mailboxId: null },
    })
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("renames a canned reply from the settings page", async () => {
    const { prisma } = await bootApiTestServer()
    const { container, unmount, click } = await render(
      withDashboard(<InboxTemplateSettings canAct mailboxes={MAILBOXES} />, {
        platformRole: "owner",
      })
    )

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes(NAME) === true)

    await click(trigger(container, `Change the canned reply ${NAME}`))

    const name = container.querySelector("#template-name")

    if (!(name instanceof HTMLInputElement)) {
      throw new Error("the canned reply form did not render")
    }

    expect(name.value).toBe(NAME)

    await fillField(name, RENAMED)
    await click(trigger(container, "Save the changes to the canned reply"))

    await waitUntilStored(async () => {
      const stored = await prisma.mailTemplate.findUnique({
        where: { id: "tpl_1" },
      })

      return stored?.name === RENAMED
    })

    const stored = await prisma.mailTemplate.findUniqueOrThrow({
      where: { id: "tpl_1" },
    })

    expect(stored.body).toBe(BODY)
    expect(await prisma.mailTemplate.count()).toBe(1)
  })

  it("gives a plain member the canned replies without a form", async () => {
    const { container, unmount } = await render(
      withDashboard(
        <InboxTemplateSettings canAct={false} mailboxes={MAILBOXES} />,
        { platformRole: "member" }
      )
    )

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes(NAME) === true)

    expect(container.querySelector("#template-name")).toBeNull()
    expect(container.textContent).not.toContain("Change the canned reply")
  })
})
