import { describe, expect, it } from "bun:test"
import { inboxSort, parseInboxSearch } from "@/lib/domain/inbox-search"

describe("parseInboxSearch", () => {
  it("leaves the address bare when nothing is chosen", () => {
    expect(parseInboxSearch({})).toEqual({})
  })

  it("omits the sort, order, page and empty filters by default", () => {
    expect(
      parseInboxSearch({
        sort: "last_activity",
        direction: "desc",
        offset: "0",
        q: "",
        mailbox: "",
        assigned: "",
      })
    ).toEqual({})
  })

  it("keeps what the reader chose", () => {
    expect(
      parseInboxSearch({
        mailbox: "mbx_support",
        status: "closed",
        unread: "true",
        assigned: "me",
        organization_id: "org_1",
        automated: "true",
        q: " agent ",
        sort: "subject",
        direction: "asc",
        offset: "25",
      })
    ).toEqual({
      mailbox: "mbx_support",
      status: "closed",
      unread: true,
      assigned: "me",
      organization_id: "org_1",
      automated: true,
      q: "agent",
      sort: "subject",
      direction: "asc",
      offset: 25,
    })
  })

  it("drops a sort and a status the inbox does not know", () => {
    expect(
      parseInboxSearch({ sort: "expediteur", status: "archivée" })
    ).toEqual({})
  })

  it("brings a missing or unknown sort back to last activity", () => {
    expect(inboxSort(undefined)).toBe("last_activity")
    expect(inboxSort("expediteur")).toBe("last_activity")
    expect(inboxSort("subject")).toBe("subject")
  })
})
