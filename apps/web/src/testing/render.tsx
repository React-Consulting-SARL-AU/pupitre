import type { OrgRole } from "@pupitre/shared/permissions"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterContextProvider } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  type DashboardActiveOrganization,
  DashboardContext,
} from "@/lib/domain/dashboard-context"
import { createQueryClient } from "@/lib/query/client"
import { getRouter } from "@/router"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

export function withRouter(element: ReactElement): ReactElement {
  return (
    <RouterContextProvider router={getRouter()}>
      {element}
    </RouterContextProvider>
  )
}

export type HarnessOrganization = Pick<
  DashboardActiveOrganization,
  "id" | "name" | "slug"
> &
  Partial<DashboardActiveOrganization>

export interface DashboardHarness {
  organization?: HarnessOrganization | null
  role?: OrgRole
  license?: string
  platformRole?: OrgRole | null
  platformCanAct?: boolean
}

const ACTING_PLATFORM_ROLES: (OrgRole | null)[] = ["owner", "admin"]

export function withDashboard(
  element: ReactElement,
  {
    organization = null,
    role = "owner",
    license = "valid",
    platformRole = null,
    platformCanAct = ACTING_PLATFORM_ROLES.includes(platformRole),
  }: DashboardHarness = {}
): ReactElement {
  return withRouter(
    <QueryClientProvider client={createQueryClient()}>
      <DashboardContext.Provider
        value={{
          user: {
            id: "u1",
            email: "console@test.local",
            name: "Ada",
            image: null,
            locale: "fr",
          },
          organizations: [],
          activeOrganization: organization
            ? { state: "active", reason: null, ...organization }
            : null,
          role: organization ? role : null,
          license,
          platformRole,
          platformCanAct,
        }}
      >
        {element}
      </DashboardContext.Provider>
    </QueryClientProvider>
  )
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

// React listens on the prototype's value setter, so the value must go through it.
export async function fill(input: Element, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    "value"
  )?.set

  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await Promise.resolve()
  })
}

export interface KeyModifiers {
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
}

export async function press(
  target: Element,
  name: string,
  modifiers: KeyModifiers = {}
): Promise<void> {
  const details = { bubbles: true, cancelable: true, key: name, ...modifiers }

  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", details))
    target.dispatchEvent(new KeyboardEvent("keyup", details))
    await Promise.resolve()
  })
}

function key(target: Element, name: string): Promise<void> {
  return press(target, name)
}

function options(): Element[] {
  return [...document.querySelectorAll("[role=option]")]
}

// A `Select` item is reached the way a keyboard reaches it.
export async function pick(control: Element, label: string): Promise<void> {
  await act(async () => {
    ;(control as HTMLElement).focus()
    await Promise.resolve()
  })
  await key(control, "Enter")
  await waitUntil(() =>
    options().some((option) => (option.textContent ?? "").includes(label))
  )

  for (let step = options().length; step > 0; step -= 1) {
    await key(document.activeElement ?? control, "ArrowDown")

    if ((document.activeElement?.textContent ?? "").includes(label)) {
      await key(document.activeElement ?? control, "Enter")

      return
    }
  }

  throw new Error(`no option labelled ${label} in ${document.body.innerHTML}`)
}

export async function waitUntilStored(
  check: () => Promise<boolean>,
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await check()) {
      return
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    })
  }

  throw new Error("condition not met before the deadline")
}

export function trigger(container: HTMLElement, label: string): HTMLElement {
  const buttons = [...document.querySelectorAll("button")]

  // An exact label wins over a longer one containing it: "Assign" must not pick "Assigned".
  const found =
    buttons.find((button) => (button.textContent ?? "").trim() === label) ??
    buttons.find((button) => button.getAttribute("aria-label") === label) ??
    buttons.find((button) => (button.textContent ?? "").includes(label))

  if (!found) {
    throw new Error(`no button labelled ${label} in ${container.innerHTML}`)
  }

  return found
}
