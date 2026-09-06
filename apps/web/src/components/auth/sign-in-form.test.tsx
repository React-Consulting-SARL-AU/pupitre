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
  it("n'offre aucun fournisseur quand la plateforme n'en monte aucun", async () => {
    const { container } = await mountWith([])

    expect(container.textContent).not.toContain("Continuer avec Google")
    expect(container.textContent).not.toContain("Continuer avec GitHub")
    expect(divider(container)).toBeNull()
  })

  it("garde le lien magique et la clé d'accès sans aucun fournisseur", async () => {
    const { container } = await mountWith([])

    expect(container.textContent).toContain("Recevoir un lien de connexion")
    expect(container.textContent).toContain("Utiliser une clé d'accès")
    expect(container.querySelector("input#email")).not.toBeNull()
  })

  it("n'offre que le fournisseur monté", async () => {
    const { container } = await mountWith(["google"])

    expect(container.textContent).toContain("Continuer avec Google")
    expect(container.textContent).not.toContain("Continuer avec GitHub")
    expect(divider(container)).not.toBeNull()
  })

  it("offre les deux fournisseurs quand les deux sont montés", async () => {
    const { container } = await mountWith(["github", "google"])

    expect(container.textContent).toContain("Continuer avec Google")
    expect(container.textContent).toContain("Continuer avec GitHub")
    expect(divider(container)).not.toBeNull()
  })

  it("garde le lien magique et la clé d'accès quand un fournisseur est monté", async () => {
    const { container } = await mountWith(["github"])

    expect(container.textContent).toContain("Recevoir un lien de connexion")
    expect(container.textContent).toContain("Utiliser une clé d'accès")
  })
})
