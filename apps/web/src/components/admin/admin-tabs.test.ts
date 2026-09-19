import { describe, expect, it } from "bun:test"
import {
  ADMIN_SERVER_TAB,
  ADMIN_SERVER_TABS,
  adminServerTab,
} from "@/components/admin/admin-server-detail"
import {
  ADMIN_SUBSCRIPTION_TAB,
  ADMIN_SUBSCRIPTION_TABS,
  adminSubscriptionTab,
} from "@/components/admin/admin-subscription-detail"

describe("adminServerTab", () => {
  it("keeps a tab the address names and falls back to the overview", () => {
    for (const tab of ADMIN_SERVER_TABS) {
      expect(adminServerTab(tab)).toBe(tab)
    }

    expect(adminServerTab("billing")).toBe(ADMIN_SERVER_TAB)
    expect(adminServerTab(undefined)).toBe(ADMIN_SERVER_TAB)
    expect(adminServerTab(3)).toBe(ADMIN_SERVER_TAB)
  })
})

describe("adminSubscriptionTab", () => {
  it("keeps a tab the address names and falls back to the overview", () => {
    for (const tab of ADMIN_SUBSCRIPTION_TABS) {
      expect(adminSubscriptionTab(tab)).toBe(tab)
    }

    expect(adminSubscriptionTab("devices")).toBe(ADMIN_SUBSCRIPTION_TAB)
    expect(adminSubscriptionTab(undefined)).toBe(ADMIN_SUBSCRIPTION_TAB)
  })
})
