import { describe, expect, it } from "vitest"
import worker from "./index"

const PAGES: Record<string, string> = {
  "/404": '<html lang="en">',
  "/fr/404": '<html lang="fr">',
}

const env = {
  ASSETS: {
    fetch(request: Request): Promise<Response> {
      const { pathname } = new URL(request.url)
      const page = PAGES[pathname]

      return Promise.resolve(
        page
          ? new Response(page, {
              status: 200,
              headers: { "content-type": "text/html" },
            })
          : new Response("asset", { status: 200 })
      )
    },
  },
}

function get(path: string, host = "pupitre.studio"): Promise<Response> {
  return Promise.resolve(
    worker.fetch(new Request(`https://${host}${path}`), env)
  )
}

describe("the site worker", () => {
  it("sends www to the apex", async () => {
    const response = await get("/pricing/", "www.pupitre.studio")

    expect(response.status).toBe(301)
    expect(response.headers.get("location")).toBe(
      "https://pupitre.studio/pricing/"
    )
  })

  it("answers the 404 pages asked for by name with a 404, in their own language", async () => {
    for (const [path, lang] of [
      ["/404", "en"],
      ["/404/", "en"],
      ["/404.html", "en"],
      ["/fr/404/", "fr"],
      ["/fr/404.html", "fr"],
    ]) {
      const response = await get(path)

      expect(response.status, path).toBe(404)
      expect(await response.text(), path).toContain(`lang="${lang}"`)
      expect(response.headers.get("content-type"), path).toBe("text/html")
    }
  })

  it("hands every other path to the assets", async () => {
    const response = await get("/docs/404-errors/")

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("asset")
  })
})
