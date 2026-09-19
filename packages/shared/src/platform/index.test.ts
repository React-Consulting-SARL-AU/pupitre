import { describe, expect, it } from "bun:test"
import { TRIAL_WARN_DAYS } from "../plans/index"
import {
  ADMIN_MAX_PAGE_SIZE,
  ADMIN_PAGE_SIZE,
  PLATFORM_ADMIN_MEMBER_ID,
  PLATFORM_ADMIN_USER_ID,
  PLATFORM_ORGANIZATION_ID,
  PLATFORM_ORGANIZATION_NAME,
  PLATFORM_ORGANIZATION_SLUG,
  TRIAL_WORKLIST_DAYS,
} from "./index"

describe("the platform's own organization", () => {
  it("keeps the identifiers the seed has already written", () => {
    expect(PLATFORM_ORGANIZATION_ID).toBe("org_pupitre")
    expect(PLATFORM_ORGANIZATION_SLUG).toBe("pupitre")
    expect(PLATFORM_ORGANIZATION_NAME).toBe("Pupitre")
    expect(PLATFORM_ADMIN_USER_ID).toBe("usr_pupitre_admin")
    expect(PLATFORM_ADMIN_MEMBER_ID).toBe("mem_pupitre_admin")
  })

  it("names three distinct rows", () => {
    const ids = [
      PLATFORM_ORGANIZATION_ID,
      PLATFORM_ADMIN_USER_ID,
      PLATFORM_ADMIN_MEMBER_ID,
    ]

    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("the platform pages", () => {
  it("ask for fifty rows and never more than two hundred", () => {
    expect(ADMIN_PAGE_SIZE).toBe(50)
    expect(ADMIN_MAX_PAGE_SIZE).toBe(200)
    expect(ADMIN_PAGE_SIZE).toBeLessThanOrEqual(ADMIN_MAX_PAGE_SIZE)
  })
})

describe("the trial deadlines", () => {
  it("looks further ahead for the team than for the customer", () => {
    expect(TRIAL_WORKLIST_DAYS).toBe(7)
    expect(TRIAL_WARN_DAYS).toBe(3)
    expect(TRIAL_WORKLIST_DAYS).toBeGreaterThan(TRIAL_WARN_DAYS)
  })
})
