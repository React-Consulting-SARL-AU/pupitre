import { describe, expect, it } from "bun:test"
import {
  type Crumb,
  documentTitle,
  pageTitle,
  serverDocumentTitle,
} from "@/lib/domain/page-titles"

describe("documentTitle", () => {
  it("names the page then the product, in the locale of the match", () => {
    expect(documentTitle("/dashboard/servers", "fr")).toBe("Serveurs · Pupitre")
    expect(documentTitle("/dashboard/servers", "en")).toBe("Servers · Pupitre")
  })
})

describe("pageTitle", () => {
  it("hangs the platform pages under the overview", () => {
    expect(pageTitle("/dashboard/admin").parents).toEqual([])

    for (const routeId of [
      "/dashboard/admin/inbox",
      "/dashboard/admin/users",
      "/dashboard/admin/organizations",
      "/dashboard/admin/servers",
      "/dashboard/admin/subscriptions",
      "/dashboard/admin/affiliate-links",
      "/dashboard/admin/events",
      "/dashboard/admin/releases",
      "/dashboard/admin/team",
    ]) {
      expect(
        pageTitle(routeId).parents.map((crumb) => crumb.to),
        routeId
      ).toEqual(["/dashboard/admin"])
    }
  })

  it("hangs a platform detail under the list it came from", () => {
    const details: [string, Crumb["to"]][] = [
      ["/dashboard/admin/inbox/$threadId", "/dashboard/admin/inbox"],
      ["/dashboard/admin/users/$id", "/dashboard/admin/users"],
      ["/dashboard/admin/organizations/$id", "/dashboard/admin/organizations"],
      ["/dashboard/admin/servers/$id", "/dashboard/admin/servers"],
      [
        "/dashboard/admin/affiliate-links/$id",
        "/dashboard/admin/affiliate-links",
      ],
    ]

    for (const [routeId, list] of details) {
      expect(
        pageTitle(routeId).parents.map((crumb) => crumb.to),
        routeId
      ).toEqual(["/dashboard/admin", list])
    }
  })
})

describe("serverDocumentTitle", () => {
  it("takes the server's own name once the loader has answered", () => {
    expect(serverDocumentTitle("vps-e2e", "fr")).toBe("vps-e2e · Pupitre")
  })

  it("falls back to the generic name while the name is unknown", () => {
    expect(serverDocumentTitle(undefined, "fr")).toBe("Serveur · Pupitre")
    expect(serverDocumentTitle(null, "en")).toBe("Server · Pupitre")
  })
})
