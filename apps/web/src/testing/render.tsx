import type { ReactElement } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

export interface Rendered {
  container: HTMLElement
  unmount: () => void
  click: (element: Element) => Promise<void>
}

export async function render(element: ReactElement): Promise<Rendered> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const container = document.createElement("div")

  document.body.appendChild(container)

  let root: Root | null = null

  await act(() => {
    root = createRoot(container)
    root.render(element)
  })

  return {
    container,
    unmount: () => {
      act(() => {
        root?.unmount()
      })
      container.remove()
    },
    click: async (target: Element) => {
      await act(async () => {
        ;(target as HTMLElement).click()
        await Promise.resolve()
      })
    },
  }
}

const POLL_MS = 20

export async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    })
  }

  throw new Error("condition not met before the deadline")
}

export async function fill(input: Element, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set

  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await Promise.resolve()
  })
}

export function trigger(container: HTMLElement, label: string): HTMLElement {
  const found = [...document.querySelectorAll("button")].find((button) =>
    (button.textContent ?? "").includes(label)
  )

  if (!found) {
    throw new Error(`no button labelled ${label} in ${container.innerHTML}`)
  }

  return found
}
