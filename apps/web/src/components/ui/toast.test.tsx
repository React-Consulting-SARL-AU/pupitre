import { afterEach, describe, expect, it } from "bun:test"
import { ToastProvider } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { render, trigger, waitUntil } from "@/testing/render"

const mounted: (() => void)[] = []

function Probe({ onRetry }: { onRetry?: () => void }) {
  const toast = useToast()

  return (
    <>
      <button
        onClick={() => {
          toast.done("Server revoked.")
        }}
        type="button"
      >
        done
      </button>
      <button
        onClick={() => {
          toast.failed({
            title: "The deletion failed.",
            fix: "Try again in a moment.",
            action: onRetry ? { label: "Try again", run: onRetry } : null,
          })
        }}
        type="button"
      >
        failed
      </button>
    </>
  )
}

function stack(): string {
  return document.querySelector("[data-testid=toasts]")?.textContent ?? ""
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("toasts", () => {
  it("say what has just been done, and close", async () => {
    const view = await render(
      <ToastProvider>
        <Probe />
      </ToastProvider>
    )

    mounted.push(view.unmount)

    await view.click(trigger(view.container, "done"))
    await waitUntil(() => stack().includes("Server revoked."))

    const toast = document.querySelector("[data-tone=done]")

    expect(toast).not.toBeNull()

    await view.click(
      document.querySelector(
        "[data-testid=toasts] [aria-label=Close][title=Close]"
      ) as Element
    )
    await waitUntil(() => !stack().includes("Server revoked."))
  })

  it("carry a failure's remedy and the action that retries", async () => {
    let retried = 0
    const view = await render(
      <ToastProvider>
        <Probe
          onRetry={() => {
            retried += 1
          }}
        />
      </ToastProvider>
    )

    mounted.push(view.unmount)

    await view.click(trigger(view.container, "failed"))
    await waitUntil(() => stack().includes("The deletion failed."))

    expect(stack()).toContain("Try again in a moment.")
    expect(document.querySelector("[data-tone=failed]")).not.toBeNull()

    await view.click(trigger(document.body, "Try again"))
    await waitUntil(() => retried === 1)
  })

  it("stay silent outside the shell, without breaking the action", async () => {
    const view = await render(<Probe />)

    mounted.push(view.unmount)

    await view.click(trigger(view.container, "done"))

    expect(document.querySelector("[data-testid=toasts]")).toBeNull()
  })
})
