import { afterEach, describe, expect, it } from "bun:test"
import { QueryClientProvider } from "@tanstack/react-query"
import { SignInForm } from "@/components/auth/sign-in-form"
import { queryKeys } from "@/lib/api/queries"
import { createQueryClient } from "@/lib/query/client"
import { render } from "@/testing/render"

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

async function mountWith(providers: string[]) {
  const client = createQueryClient()

  client.setQueryData(queryKeys.socialProviders, providers)

  const rendered = await render(
    <QueryClientProvider client={client}>
      <SignInForm />
    </QueryClientProvider>
  )

  mounted.push(rendered.unmount)

  return rendered
}

function divider(container: HTMLElement) {
  return container.querySelector("[data-testid='sign-in-divider']")
}

describe("SignInForm", () => {
  it("offers no provider when the platform mounts none", async () => {
    const { container } = await mountWith([])

    expect(container.textContent).not.toContain("Continue with Google")
    expect(container.textContent).not.toContain("Continue with GitHub")
    expect(divider(container)).toBeNull()
  })

  it("keeps the magic link and the passkey without any provider", async () => {
    const { container } = await mountWith([])

    expect(container.textContent).toContain("Send me a sign-in link")
    expect(container.textContent).toContain("Use a passkey")
    expect(container.querySelector("input#email")).not.toBeNull()
  })

  it("offers only the mounted provider", async () => {
    const { container } = await mountWith(["google"])

    expect(container.textContent).toContain("Continue with Google")
    expect(container.textContent).not.toContain("Continue with GitHub")
    expect(divider(container)).not.toBeNull()
  })

  it("offers both providers when both are mounted", async () => {
    const { container } = await mountWith(["github", "google"])

    expect(container.textContent).toContain("Continue with Google")
    expect(container.textContent).toContain("Continue with GitHub")
    expect(divider(container)).not.toBeNull()
  })

  it("says where the account is stored before the email is typed", async () => {
    const { container } = await mountWith([])
    const notice = container.querySelector(
      "[data-testid='sign-in-data-notice']"
    )
    const order = [
      ...container.querySelectorAll(
        "[data-testid='sign-in-data-notice'], input#email"
      ),
    ].map((element) => element.tagName)

    expect(notice?.textContent).toContain("Cloudflare, in the United States")
    expect(notice?.querySelector("a")?.getAttribute("href")).toBe(
      "https://pupitre.studio/legal/privacy/"
    )
    expect(order).toEqual(["P", "INPUT"])
  })

  it("keeps the magic link and the passkey when a provider is mounted", async () => {
    const { container } = await mountWith(["github"])

    expect(container.textContent).toContain("Send me a sign-in link")
    expect(container.textContent).toContain("Use a passkey")
  })
})
