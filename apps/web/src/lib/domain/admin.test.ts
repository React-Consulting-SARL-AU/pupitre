import { describe, expect, it } from "bun:test"
import {
  accountIsProtected,
  canActOnPlatform,
  canRestore,
  canSuspend,
  overviewFigures,
  platformOpen,
  releaseVersions,
  suspendedReasonKey,
  userLook,
} from "@/lib/domain/admin"

describe("platformOpen", () => {
  it("opens the platform pages on the platform organisation, for its members", () => {
    expect(platformOpen("org_pupitre", "member")).toBe(true)
    expect(platformOpen("org_pupitre", "owner")).toBe(true)
  })

  it("keeps them shut on any other organisation, and for anyone outside", () => {
    expect(platformOpen("org_perso", "owner")).toBe(false)
    expect(platformOpen(null, "owner")).toBe(false)
    expect(platformOpen("org_pupitre", null)).toBe(false)
  })
})

describe("canActOnPlatform", () => {
  it("lets the two roles the owner grants on the platform organisation act", () => {
    expect(canActOnPlatform("owner")).toBe(true)
    expect(canActOnPlatform("admin")).toBe(true)
  })

  it("leaves a plain member, and anyone outside, reading only", () => {
    expect(canActOnPlatform("member")).toBe(false)
    expect(canActOnPlatform(null)).toBe(false)
  })
})

describe("suspendedReasonKey", () => {
  it("names the two reasons a server can be suspended for", () => {
    expect(suspendedReasonKey("billing")).toBe(
      "admin.servers.suspendedReason.billing"
    )
    expect(suspendedReasonKey("admin")).toBe(
      "admin.servers.suspendedReason.admin"
    )
  })

  it("says nothing for a server that is not suspended", () => {
    expect(suspendedReasonKey(null)).toBeNull()
    expect(suspendedReasonKey("weird")).toBeNull()
  })
})

describe("canRestore", () => {
  it("only lifts the suspension the team laid", () => {
    expect(canRestore("admin")).toBe(true)
    expect(canRestore("billing")).toBe(false)
    expect(canRestore(null)).toBe(false)
  })
})

describe("accountIsProtected", () => {
  it("closes the ban when the platform refused it over who the account is", () => {
    expect(accountIsProtected(409)).toBe(true)
  })

  it("leaves it open when nothing was refused, or the refusal was another one", () => {
    expect(accountIsProtected(undefined)).toBe(false)
    expect(accountIsProtected(404)).toBe(false)
  })
})

describe("releaseVersions", () => {
  it("gathers the artefacts of a version into one line, newest first", () => {
    const versions = releaseVersions([
      {
        version: "0.5.0",
        channel: "stable",
        published_at: "2026-09-01T10:00:00Z",
      },
      {
        version: "0.6.0",
        channel: "beta",
        published_at: "2026-09-10T10:00:00Z",
      },
      {
        version: "0.6.0",
        channel: "beta",
        published_at: "2026-09-10T11:00:00Z",
      },
    ])

    expect(versions.map((version) => version.version)).toEqual([
      "0.6.0",
      "0.5.0",
    ])
    expect(versions[0]).toMatchObject({
      builds: 2,
      channels: ["beta"],
      publishedAt: "2026-09-10T11:00:00.000Z",
      stable: false,
    })
    expect(versions[1].stable).toBe(true)
  })

  it("takes the dates Eden revived, and still orders them", () => {
    const versions = releaseVersions([
      {
        version: "0.5.0",
        channel: "stable",
        published_at: new Date("2026-09-01T10:00:00Z"),
      },
      {
        version: "0.6.0",
        channel: "beta",
        published_at: new Date("2026-09-10T10:00:00Z"),
      },
    ])

    expect(versions.map((version) => version.version)).toEqual([
      "0.6.0",
      "0.5.0",
    ])
    expect(versions[0].publishedAt).toBe("2026-09-10T10:00:00.000Z")
  })

  it("has nothing to show before the first publication", () => {
    expect(releaseVersions([])).toEqual([])
  })
})

describe("canSuspend", () => {
  it("only offers the suspension on a running server", () => {
    expect(canSuspend("active")).toBe(true)

    for (const status of ["enrolling", "grace", "suspended", "revoked"]) {
      expect(canSuspend(status), status).toBe(false)
    }
  })
})

describe("userLook", () => {
  it("reads a banned account as barred, whatever else is true", () => {
    expect(userLook({ banned: true, email_verified: true })).toMatchObject({
      shape: "barred",
      tone: "danger",
    })
  })

  it("reads an unverified email as a hollow warning", () => {
    expect(userLook({ banned: false, email_verified: false })).toMatchObject({
      shape: "hollow",
      tone: "warn",
    })
  })

  it("reads a verified account as a filled dot", () => {
    expect(userLook({ banned: false, email_verified: true })).toMatchObject({
      shape: "filled",
      tone: "ok",
    })
  })
})

describe("overviewFigures", () => {
  const overview = {
    users: 12,
    organizations: 9,
    servers: {
      total: 7,
      enrolling: 1,
      active: 4,
      grace: 0,
      suspended: 1,
      revoked: 1,
    },
    subscriptions: {
      total: 6,
      trialing: 2,
      active: 3,
      past_due: 0,
      canceled: 1,
      other: 0,
      launch: 2,
    },
    affiliate_links: 3,
    referrals: 5,
  }

  it("lays the seven figures out, servers and subscriptions with their parts", () => {
    const figures = overviewFigures(overview)

    expect(figures.map((figure) => [figure.id, figure.value])).toEqual([
      ["users", 12],
      ["organizations", 9],
      ["servers", 7],
      ["subscriptions", 6],
      ["launch", 2],
      ["affiliate_links", 3],
      ["referrals", 5],
    ])
    expect(figures[2].parts.map((part) => part.value)).toEqual([1, 4, 0, 1, 1])
  })

  it("keeps the launch out of the status breakdown, which counts each line once", () => {
    const figures = overviewFigures(overview)
    const subscriptions = figures[3]

    expect(subscriptions.parts.map((part) => part.label)).toEqual([
      "billing.status.trialing",
      "billing.status.active",
      "billing.status.past_due",
      "billing.status.canceled",
      "admin.overview.other",
    ])
    expect(subscriptions.parts.reduce((sum, part) => sum + part.value, 0)).toBe(
      subscriptions.value
    )
    expect(figures[4].parts).toEqual([])
  })

  it("counts a status the API left out as zero", () => {
    const figures = overviewFigures({
      ...overview,
      servers: { total: 0 },
      subscriptions: { total: 0 },
    })

    expect(figures[2].parts.every((part) => part.value === 0)).toBe(true)
    expect(figures[3].parts.every((part) => part.value === 0)).toBe(true)
    expect(figures[4].value).toBe(0)
  })
})
