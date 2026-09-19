import { describe, expect, it } from "bun:test"
import type { AdminSearchResults } from "@/lib/api/admin-queries"
import { searchHits } from "@/lib/domain/admin-search"

const EMPTY: AdminSearchResults = {
  users: [],
  organizations: [],
  servers: [],
  threads: [],
}

function results(patch: Partial<AdminSearchResults>): AdminSearchResults {
  return { ...EMPTY, ...patch }
}

describe("searchHits", () => {
  it("names the server by its host and its organisation", () => {
    const [hit] = searchHits(
      results({
        servers: [
          {
            id: "srv_1",
            name: "vps-one",
            host: "vps-one.example",
            organization: { id: "org_1", name: "Atelier" },
          },
        ],
      })
    )

    expect(hit.secondary).toBe("vps-one.example · Atelier")
  })

  it("names the server by its organisation alone when it has no host yet", () => {
    const [hit] = searchHits(
      results({
        servers: [
          {
            id: "srv_1",
            name: "vps-one",
            host: null,
            organization: { id: "org_1", name: "Atelier" },
          },
        ],
      })
    )

    expect(hit.secondary).toBe("Atelier")
  })

  it("carries the account state on the accounts and nothing on the rest", () => {
    const hits = searchHits(
      results({
        users: [
          {
            id: "usr_1",
            email: "ada@test.local",
            name: "Ada",
            state: "suspended",
          },
        ],
        organizations: [{ id: "org_1", name: "Atelier", slug: "atelier" }],
      })
    )

    expect(hits[0].look?.label).toBe("admin.users.state.suspended")
    expect(hits[1].look).toBeNull()
  })
})
