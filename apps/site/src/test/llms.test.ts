import { MODULE_IDS } from "@pupitre/shared/catalog"
import { describe, expect, it, vi } from "vitest"

interface Entry {
  id: string
  data: Record<string, unknown>
}

const DOCS: Entry[] = [
  {
    id: "en/start/vps",
    data: {
      locale: "en",
      section: "start",
      order: 1,
      title: "Rent a server",
      description: "Where to rent one and what to ask for.",
    },
  },
  {
    id: "en/start/install",
    data: {
      locale: "en",
      section: "start",
      order: 2,
      title: "Install the app",
      description: "Download it, sign in, connect the server.",
    },
  },
  {
    id: "en/daily/terminals",
    data: {
      locale: "en",
      section: "daily",
      order: 1,
      title: "Terminals",
      description: "Sessions that survive a closed laptop.",
    },
  },
  {
    id: "fr/start/vps",
    data: {
      locale: "fr",
      section: "start",
      order: 1,
      title: "Louer un serveur",
      description: "Où en louer un.",
    },
  },
]

const POSTS: Entry[] = [
  {
    id: "en/agents",
    data: {
      locale: "en",
      title: "Agents on a machine of their own",
      description: "Why they belong on a server.",
    },
  },
]

const LEGAL: Entry[] = [
  {
    id: "en/terms",
    data: { locale: "en", title: "Terms", description: "The contract." },
  },
]

const COLLECTIONS: Record<string, Entry[]> = {
  docs: DOCS,
  blog: POSTS,
  legal: LEGAL,
}

vi.mock("astro:content", () => ({
  getCollection: (name: string, filter?: (entry: Entry) => boolean) => {
    const entries = COLLECTIONS[name] ?? []

    return Promise.resolve(filter ? entries.filter(filter) : entries)
  },
}))

async function llms(): Promise<string> {
  const { GET } = await import("../pages/llms.txt")

  return await (await GET()).text()
}

describe("llms.txt", () => {
  it("serves plain text an agent can read straight through", async () => {
    const { GET } = await import("../pages/llms.txt")
    const response = await GET()

    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8"
    )
    expect(await response.text()).toContain("# Pupitre")
  })

  it("opens on Start here, so the first documentation is one jump away", async () => {
    const body = await llms()
    const headings = [...body.matchAll(/^## (.+)$/gm)].map((match) => match[1])

    expect(headings[0]).toBe("Start here")
    expect(headings).toContain("Documentation")

    const start = body.slice(
      body.indexOf("## Start here"),
      body.indexOf("## Documentation")
    )

    expect(start).toContain(
      "- [Rent a server](https://pupitre.studio/docs/start/vps/): Where to rent one and what to ask for."
    )
    expect(start).toContain(
      "[Install the app](https://pupitre.studio/docs/start/install/)"
    )
    expect(start).not.toContain("Terminals")
    expect(start).not.toContain("Louer un serveur")
  })

  it("lists every catalogue module and the other pages of the site", async () => {
    const body = await llms()

    for (const id of MODULE_IDS) {
      expect(body, id).toContain(`(${id})`)
    }
    expect(body).toContain("https://pupitre.studio/pricing/")
    expect(body).toContain("https://pupitre.studio/download/")
    expect(body).toContain("https://pupitre.studio/fr/")
  })
})
