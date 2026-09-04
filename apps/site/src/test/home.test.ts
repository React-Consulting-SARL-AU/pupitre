import { describe, expect, it } from "vitest"
import Fr from "../pages/fr/index.astro"
import En from "../pages/index.astro"
import { render } from "./render"

describe("home", () => {
  it("carries the sentence and two buttons in English", async () => {
    const html = await render(En, { path: "/" })

    expect(html).toContain(
      '<h1 class="heading-1 max-w-3xl">Your AI agents work on a machine of their own. Your laptop breathes.</h1>'
    )
    expect(html).toContain(
      '<a href="/download/" class="btn btn-primary">Download the app</a>'
    )
    expect(html).toContain(
      '<a href="https://app.pupitre.sh/" class="btn btn-secondary">Order</a>'
    )
  })

  it("carries the sentence and two buttons in French", async () => {
    const html = await render(Fr, { path: "/fr/" })

    expect(html).toContain('<html lang="fr"')
    expect(html).toContain(
      '<h1 class="heading-1 max-w-3xl">Vos agents IA travaillent sur une machine à eux. Votre laptop respire.</h1>'
    )
    expect(html).toContain(
      '<a href="/fr/download/" class="btn btn-primary">Télécharger l’app</a>'
    )
    expect(html).toContain(
      '<a href="https://app.pupitre.sh/" class="btn btn-secondary">Commander</a>'
    )
  })
})
