import { afterEach, describe, expect, it } from "bun:test"
import {
  ConfirmFormDialog,
  type ConfirmFormDialogProps,
} from "@/components/ui/confirm-form-dialog"
import { MAX_REASON_LENGTH } from "@/lib/domain/admin"
import type { ConfirmFormValues } from "@/lib/schemas/confirm-form"
import {
  fill,
  press,
  render,
  trigger,
  waitUntil,
  withDashboard,
} from "@/testing/render"

const mounted: (() => void)[] = []

const A_DAY_MS = 86_400_000

/** What a `datetime-local` field holds: the local wall clock, without its zone. */
function localMoment(offsetMs: number): string {
  const moment = new Date(Date.now() + offsetMs)

  moment.setSeconds(0, 0)

  return new Date(moment.getTime() - moment.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

function dialog(overrides: Partial<ConfirmFormDialogProps> = {}) {
  const props: ConfirmFormDialogProps = {
    id: "purge",
    triggerLabel: "Purge",
    title: "Purge this server?",
    description: "The line and its history leave the console.",
    confirmLabel: "Purge",
    onConfirm: () => undefined,
    ...overrides,
  }

  return withDashboard(<ConfirmFormDialog {...props} />)
}

async function open(element: ReturnType<typeof dialog>) {
  const rendered = await render(element)

  mounted.push(rendered.unmount)

  await rendered.click(trigger(rendered.container, "Purge"))
  await waitUntil(() => document.querySelector("form") !== null)

  return rendered
}

function field(id: string): HTMLInputElement {
  const found = document.querySelector(`#${id}`)

  if (!found) {
    throw new Error(`no field ${id}`)
  }

  return found as HTMLInputElement
}

describe("ConfirmFormDialog", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("keeps the button inert until the keyword is retyped", async () => {
    const confirmed: ConfirmFormValues[] = []
    const rendered = await open(
      dialog({
        keyword: "PURGE",
        onConfirm: (values) => {
          confirmed.push(values)
        },
      })
    )
    const confirm = [...document.querySelectorAll("button")].find(
      (button) => button.getAttribute("type") === "submit"
    )

    expect(confirm?.disabled).toBe(true)

    await fill(field("purge-keyword"), "purg")

    expect(confirm?.disabled).toBe(true)

    await fill(field("purge-keyword"), "purge")

    expect(confirm?.disabled).toBe(false)

    if (!confirm) {
      throw new Error("no confirm button")
    }

    await rendered.click(confirm)
    await waitUntil(() => confirmed.length > 0)

    expect(confirmed[0].keyword).toBe("purge")
  })

  it("refuses an empty reason when the reason is required", async () => {
    const confirmed: ConfirmFormValues[] = []
    const rendered = await open(
      dialog({
        reason: "required",
        onConfirm: (values) => {
          confirmed.push(values)
        },
      })
    )
    const confirm = [...document.querySelectorAll("button")].find(
      (button) => button.getAttribute("type") === "submit"
    )

    if (!confirm) {
      throw new Error("no confirm button")
    }

    await rendered.click(confirm)
    await waitUntil(() => document.querySelector("[role=alert]") !== null)

    expect(confirmed).toHaveLength(0)

    await fill(field("purge-reason"), "abus répété")
    await rendered.click(confirm)
    await waitUntil(() => confirmed.length > 0)

    expect(confirmed[0].reason).toBe("abus répété")
  })

  it("offers the reason field when the reason is optional and asks for none without it", async () => {
    const confirmed: ConfirmFormValues[] = []
    const rendered = await open(
      dialog({
        reason: "optional",
        onConfirm: (values) => {
          confirmed.push(values)
        },
      })
    )
    const confirm = [...document.querySelectorAll("button")].find(
      (button) => button.getAttribute("type") === "submit"
    )

    if (!confirm) {
      throw new Error("no confirm button")
    }

    expect(field("purge-reason")).not.toBeNull()

    await rendered.click(confirm)
    await waitUntil(() => confirmed.length > 0)

    expect(confirmed[0].reason).toBe("")

    for (const unmount of mounted.splice(0)) {
      unmount()
    }

    await open(dialog())

    expect(document.querySelector("#purge-reason")).toBeNull()
  })

  it("refuses a reason longer than the platform keeps", async () => {
    const confirmed: ConfirmFormValues[] = []
    const rendered = await open(
      dialog({
        reason: "optional",
        onConfirm: (values) => {
          confirmed.push(values)
        },
      })
    )
    const confirm = [...document.querySelectorAll("button")].find(
      (button) => button.getAttribute("type") === "submit"
    )

    if (!confirm) {
      throw new Error("no confirm button")
    }

    await fill(field("purge-reason"), "a".repeat(MAX_REASON_LENGTH + 1))
    await rendered.click(confirm)
    await waitUntil(() => document.querySelector("[role=alert]") !== null)

    expect(confirmed).toHaveLength(0)
    expect(document.body.textContent).toContain(
      `At most ${MAX_REASON_LENGTH} characters.`
    )
  })

  it("shows the refusal inside the dialog and keeps what was typed", async () => {
    await open(
      dialog({
        reason: "required",
        busy: false,
        refusal: {
          message: "Le serveur refuse.",
          fix: "Révoquez-le d'abord.",
        },
      })
    )

    await fill(field("purge-reason"), "abus répété")

    expect(document.body.textContent).toContain("Le serveur refuse.")
    expect(document.body.textContent).toContain("Révoquez-le d'abord.")
    expect(field("purge-reason").value).toBe("abus répété")
  })

  it("confirms on Cmd+Enter from a field", async () => {
    const confirmed: ConfirmFormValues[] = []

    await open(
      dialog({
        reason: "required",
        onConfirm: (values) => {
          confirmed.push(values)
        },
      })
    )

    await fill(field("purge-reason"), "abus répété")
    await press(field("purge-reason"), "Enter", { metaKey: true })
    await waitUntil(() => confirmed.length > 0)

    expect(confirmed[0].reason).toBe("abus répété")
  })

  it("refuses a deadline already past and takes one still to come", async () => {
    const confirmed: ConfirmFormValues[] = []
    const rendered = await open(
      dialog({
        until: true,
        onConfirm: (values) => {
          confirmed.push(values)
        },
      })
    )
    const confirm = [...document.querySelectorAll("button")].find(
      (button) => button.getAttribute("type") === "submit"
    )

    if (!confirm) {
      throw new Error("no confirm button")
    }

    await fill(field("purge-until"), localMoment(-A_DAY_MS))
    await rendered.click(confirm)
    await waitUntil(() => document.querySelector("[role=alert]") !== null)

    expect(confirmed).toHaveLength(0)
    expect(document.body.textContent).toContain("Pick a date ahead of now.")

    const ahead = localMoment(A_DAY_MS)

    await fill(field("purge-until"), ahead)
    await rendered.click(confirm)
    await waitUntil(() => confirmed.length > 0)

    expect(confirmed[0].until).toBe(new Date(ahead).toISOString())
  })
})
