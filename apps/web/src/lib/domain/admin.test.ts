import { describe, expect, it } from "bun:test"
import {
  accountGestures,
  accountIsProtected,
  accountLook,
  accountReason,
  canActOnPlatform,
  canCancelSubscription,
  canDeleteSubscription,
  canGrantSubscription,
  canResizeSubscription,
  canRestore,
  canSuspend,
  dateInputValue,
  endOfDayIso,
  organizationGestures,
  organizationLook,
  organizationReason,
  overviewFigures,
  platformOpen,
  productKey,
  releaseVersions,
  SUBSCRIPTION_PRODUCT_FILTERS,
  subscriptionIsLive,
  suspendedReasonKey,
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

describe("productKey", () => {
  it("names the three products, the granted one included", () => {
    expect(productKey("prod_server")).toBe("admin.subscriptions.product.server")
    expect(productKey("launch")).toBe("admin.subscriptions.product.launch")
    expect(productKey("granted")).toBe("admin.subscriptions.product.granted")
    expect(SUBSCRIPTION_PRODUCT_FILTERS).toContain("granted")
  })

  it("has no name for a product it does not know", () => {
    expect(productKey("prod_other")).toBeNull()
    expect(productKey(null)).toBeNull()
  })
})

describe("subscriptionIsLive", () => {
  it("counts what Stripe still bills, and what a trial or a granted right still covers", () => {
    for (const status of ["active", "trialing", "past_due"]) {
      expect(subscriptionIsLive(status), status).toBe(true)
    }

    for (const status of ["canceled", "unpaid", "incomplete_expired"]) {
      expect(subscriptionIsLive(status), status).toBe(false)
    }
  })
})

describe("canCancelSubscription", () => {
  it("stops anything that is not already cancelled", () => {
    expect(canCancelSubscription("active")).toBe(true)
    expect(canCancelSubscription("trialing")).toBe(true)
    expect(canCancelSubscription("canceled")).toBe(false)
  })
})

describe("canDeleteSubscription", () => {
  it("deletes a platform row whatever its status", () => {
    expect(
      canDeleteSubscription({ product: "launch", status: "trialing" })
    ).toBe(true)
    expect(
      canDeleteSubscription({ product: "granted", status: "active" })
    ).toBe(true)
  })

  it("deletes a Stripe row only once Stripe no longer bills it", () => {
    expect(
      canDeleteSubscription({ product: "prod_server", status: "canceled" })
    ).toBe(true)
    expect(
      canDeleteSubscription({ product: "prod_server", status: "active" })
    ).toBe(false)
    expect(
      canDeleteSubscription({ product: "prod_server", status: "past_due" })
    ).toBe(false)
  })
})

describe("canResizeSubscription", () => {
  it("resizes the granted product alone", () => {
    expect(canResizeSubscription("granted")).toBe(true)
    expect(canResizeSubscription("launch")).toBe(false)
    expect(canResizeSubscription("prod_server")).toBe(false)
  })
})

describe("canGrantSubscription", () => {
  it("grants to an organisation with nothing live", () => {
    expect(
      canGrantSubscription({ organizationId: "org_perso", hasLive: false })
    ).toBe(true)
  })

  it("refuses the platform organisation and one with a live subscription", () => {
    expect(
      canGrantSubscription({ organizationId: "org_pupitre", hasLive: false })
    ).toBe(false)
    expect(
      canGrantSubscription({ organizationId: "org_perso", hasLive: true })
    ).toBe(false)
  })
})

describe("endOfDayIso", () => {
  it("sends the last instant of the chosen day, and reads it back as that day", () => {
    const iso = endOfDayIso("2026-12-31")

    expect(iso).not.toBeNull()

    const sent = new Date(iso ?? "")

    expect(sent.getFullYear()).toBe(2026)
    expect(sent.getMonth()).toBe(11)
    expect(sent.getDate()).toBe(31)
    expect(sent.getHours()).toBe(23)
    expect(sent.getMinutes()).toBe(59)
    expect(dateInputValue(iso)).toBe("2026-12-31")
  })

  it("sends nothing for an empty field, and refuses what is not a date", () => {
    expect(endOfDayIso("")).toBeNull()
    expect(endOfDayIso("soon")).toBeNull()
    expect(dateInputValue(null)).toBe("")
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

describe("accountLook", () => {
  it("bars a suspended account and a scheduled deletion", () => {
    expect(accountLook("suspended")).toMatchObject({
      shape: "barred",
      tone: "danger",
      label: "admin.users.state.suspended",
    })
    expect(accountLook("deleting")).toMatchObject({
      shape: "barred",
      label: "admin.users.state.deleting",
    })
  })

  it("warns on a deactivated account and fills an active one", () => {
    expect(accountLook("deactivated")).toMatchObject({
      shape: "hollow",
      tone: "warn",
    })
    expect(accountLook("active")).toMatchObject({ shape: "filled", tone: "ok" })
  })
})

describe("organizationLook", () => {
  it("names each organisation state with its own label", () => {
    expect(organizationLook("closed")).toMatchObject({
      shape: "hollow",
      label: "admin.organizations.state.closed",
    })
    expect(organizationLook("suspended")).toMatchObject({
      tone: "danger",
      label: "admin.organizations.state.suspended",
    })
    expect(organizationLook("active")).toMatchObject({ tone: "ok" })
  })
})

describe("accountGestures", () => {
  it("offers to suspend an active account and to lift a suspended one", () => {
    expect(accountGestures("active")).toContain("suspend")
    expect(accountGestures("active")).not.toContain("unsuspend")
    expect(accountGestures("suspended")).toContain("unsuspend")
    expect(accountGestures("suspended")).not.toContain("suspend")
  })

  it("offers to reactivate a deactivated account", () => {
    expect(accountGestures("deactivated")).toEqual([
      "reactivate",
      "delete",
      "revoke_sessions",
    ])
  })

  it("offers to cancel or to hasten a scheduled deletion, and nothing that would repeat it", () => {
    expect(accountGestures("deleting")).toEqual([
      "cancel_deletion",
      "purge",
      "revoke_sessions",
    ])
  })
})

describe("organizationGestures", () => {
  it("offers to suspend, close or delete an active organisation", () => {
    expect(organizationGestures("active")).toEqual([
      "suspend",
      "close",
      "delete",
    ])
  })

  it("offers to lift a suspension and to reopen a closed organisation", () => {
    expect(organizationGestures("suspended")).toContain("restore")
    expect(organizationGestures("closed")).toEqual(["reopen", "delete"])
  })

  it("offers to cancel or to hasten a scheduled deletion", () => {
    expect(organizationGestures("deleting")).toEqual([
      "cancel_deletion",
      "purge",
    ])
  })
})

describe("accountReason", () => {
  it("reads the reason the state was written with, and no older one", () => {
    const account = {
      banned_reason: "abus",
      deactivated_reason: "inactif",
      deletion_reason: "demande",
    }

    expect(accountReason({ ...account, state: "suspended" })).toBe("abus")
    expect(accountReason({ ...account, state: "deactivated" })).toBe("inactif")
    expect(accountReason({ ...account, state: "deleting" })).toBe("demande")
    expect(accountReason({ ...account, state: "active" })).toBeNull()
  })
})

describe("organizationReason", () => {
  it("reads the reason the state was written with", () => {
    const organization = {
      suspended_reason: "abus",
      closed_reason: "demande",
      deletion_reason: "purge",
    }

    expect(organizationReason({ ...organization, state: "suspended" })).toBe(
      "abus"
    )
    expect(organizationReason({ ...organization, state: "closed" })).toBe(
      "demande"
    )
    expect(organizationReason({ ...organization, state: "deleting" })).toBe(
      "purge"
    )
    expect(organizationReason({ ...organization, state: "active" })).toBeNull()
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
