import { afterEach, describe, expect, it } from "bun:test"
import { QueryClientProvider } from "@tanstack/react-query"
import { DataConsentForm } from "@/components/auth/data-consent-form"
import { createQueryClient } from "@/lib/query/client"
import { render, withRouter } from "@/testing/render"

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

async function mount() {
  const rendered = await render(
    withRouter(
      <QueryClientProvider client={createQueryClient()}>
        <DataConsentForm callbackURL="/dashboard" />
      </QueryClientProvider>
    )
  )

  mounted.push(rendered.unmount)

  return rendered
}

function acceptButton(container: HTMLElement) {
  return container.querySelector<HTMLButtonElement>("button[type='submit']")
}

describe("DataConsentForm", () => {
  it("says what is stored, where, why, who else receives it and how to withdraw", async () => {
    const { container } = await mount()
    const text = container.textContent ?? ""

    expect(text).toContain("heartbeats")
    expect(text).toContain("Cloudflare, Inc., a United States company")
    expect(text).toContain("outside Morocco and outside the European Union")
    expect(text).toContain("Stripe receives nothing today")
    expect(text).toContain("Web Analytics, without a cookie")
    expect(
      container.querySelector("a[href='/dashboard/settings']")
    ).not.toBeNull()
    expect(
      container.querySelector("a[href='https://pupitre.studio/legal/privacy/']")
    ).not.toBeNull()
  })

  it("keeps the agreement closed until the box is ticked", async () => {
    const { container, click } = await mount()
    const checkbox = container.querySelector("#data-consent")

    expect(acceptButton(container)?.disabled).toBe(true)

    if (!checkbox) {
      throw new Error("the consent checkbox is missing")
    }

    await click(checkbox)

    expect(acceptButton(container)?.disabled).toBe(false)
  })
})
