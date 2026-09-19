import { describe, expect, it } from "bun:test"
import { inboxSort, parseInboxSearch } from "@/lib/domain/inbox-search"

describe("parseInboxSearch", () => {
  it("laisse l'adresse nue quand rien n'est choisi", () => {
    expect(parseInboxSearch({})).toEqual({})
  })

  it("omet le tri, l'ordre, la page et les filtres vides par défaut", () => {
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

  it("garde ce que le lecteur a choisi", () => {
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

  it("jette un tri et un statut que la boîte ne connaît pas", () => {
    expect(
      parseInboxSearch({ sort: "expediteur", status: "archivée" })
    ).toEqual({})
  })

  it("ramène un tri absent ou inconnu à la dernière activité", () => {
    expect(inboxSort(undefined)).toBe("last_activity")
    expect(inboxSort("expediteur")).toBe("last_activity")
    expect(inboxSort("subject")).toBe("subject")
  })
})
