import { describe, expect, it } from "vitest"
import { closeMenusOnDismiss } from "./menu"

type Listener = (event: unknown) => void

function fakeMenu(inside: unknown) {
  const listeners: Record<string, Listener> = {}

  return {
    open: true,
    contains: (node: unknown) => node === inside,
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener
    },
    listeners,
  }
}

function bind(menu: ReturnType<typeof fakeMenu>) {
  const listeners: Record<string, Listener> = {}
  const root = {
    querySelectorAll: () => [menu],
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener
    },
  }

  closeMenusOnDismiss("[data-menu]", root as unknown as Document)

  return listeners
}

describe("closeMenusOnDismiss", () => {
  it("closes an open menu when the click lands outside it", () => {
    const menu = fakeMenu("summary")
    const root = bind(menu)

    root.click({ target: "elsewhere" })

    expect(menu.open).toBe(false)
  })

  it("leaves the menu open while the click stays inside it", () => {
    const menu = fakeMenu("summary")
    const root = bind(menu)

    root.click({ target: "summary" })

    expect(menu.open).toBe(true)
  })

  it("closes the menu on Escape and ignores every other key", () => {
    const menu = fakeMenu("summary")

    bind(menu)

    menu.listeners.keydown({ key: "ArrowDown" })
    expect(menu.open).toBe(true)

    menu.listeners.keydown({ key: "Escape" })
    expect(menu.open).toBe(false)
  })
})
