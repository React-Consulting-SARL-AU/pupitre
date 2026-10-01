import { describe, expect, it } from "bun:test"
import {
  type AlertState,
  DISK_ALERT_PERCENT,
  detectAlerts,
  isAgentOutdated,
  isBackupFailed,
  isBackupStale,
  isDiskHigh,
  isLicenseGrace,
  isUnreachable,
  latestVersionOf,
  OUTDATED_AFTER_VERSIONS,
  UNREACHABLE_AFTER_MS,
  versionsBehind,
} from "./detect"

const NOW = new Date("2026-09-04T12:00:00Z")

const MINUTE_MS = 60_000

function state(overrides: Partial<AlertState> = {}): AlertState {
  return {
    status: "active",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    lastHeartbeatAt: new Date(NOW.getTime() - MINUTE_MS),
    disk: 12,
    agentVersion: "1.4.0",
    publishedVersions: ["1.4.0"],
    backup: null,
    ...overrides,
  }
}

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * MINUTE_MS)
}

function hoursAgo(hours: number): string {
  return minutesAgo(hours * 60).toISOString()
}

describe("unreachable server", () => {
  it("fires after thirty minutes without a heartbeat", () => {
    expect(UNREACHABLE_AFTER_MS).toBe(30 * MINUTE_MS)
    expect(isUnreachable(state({ lastHeartbeatAt: minutesAgo(31) }), NOW)).toBe(
      true
    )
  })

  it("lets pass a server seen twenty-nine minutes ago", () => {
    expect(isUnreachable(state({ lastHeartbeatAt: minutesAgo(29) }), NOW)).toBe(
      false
    )
  })

  it("counts from enrolment when no heartbeat has arrived", () => {
    expect(
      isUnreachable(
        state({ lastHeartbeatAt: null, createdAt: minutesAgo(45) }),
        NOW
      )
    ).toBe(true)
    expect(
      isUnreachable(
        state({ lastHeartbeatAt: null, createdAt: minutesAgo(5) }),
        NOW
      )
    ).toBe(false)
  })

  it("ignores a server that is enrolling, suspended or revoked", () => {
    for (const status of ["enrolling", "suspended", "revoked"] as const) {
      expect(
        isUnreachable(state({ status, lastHeartbeatAt: minutesAgo(120) }), NOW)
      ).toBe(false)
    }
  })
})

describe("disk above 90 %", () => {
  it("fires at 91 %", () => {
    expect(DISK_ALERT_PERCENT).toBe(90)
    expect(isDiskHigh(state({ disk: 91 }))).toBe(true)
  })

  it("lets exactly 90 % and 89 % pass", () => {
    expect(isDiskHigh(state({ disk: 90 }))).toBe(false)
    expect(isDiskHigh(state({ disk: 89 }))).toBe(false)
  })

  it("decides nothing without a measurement", () => {
    expect(isDiskHigh(state({ disk: null }))).toBe(false)
  })
})

describe("outdated agent", () => {
  it("counts the more recent published versions", () => {
    expect(
      versionsBehind(
        state({
          agentVersion: "1.4.0",
          publishedVersions: ["1.3.0", "1.4.0", "1.5.0", "1.6.0"],
        })
      )
    ).toBe(2)
  })

  it("fires at two versions behind", () => {
    expect(OUTDATED_AFTER_VERSIONS).toBe(2)
    expect(
      isAgentOutdated(
        state({ agentVersion: "1.4.0", publishedVersions: ["1.5.0", "1.6.0"] })
      )
    ).toBe(true)
  })

  it("lets a single version behind pass", () => {
    expect(
      isAgentOutdated(
        state({ agentVersion: "1.4.0", publishedVersions: ["1.5.0"] })
      )
    ).toBe(false)
  })

  it("decides nothing until the agent has stated its version", () => {
    expect(
      isAgentOutdated(
        state({ agentVersion: null, publishedVersions: ["1.5.0", "1.6.0"] })
      )
    ).toBe(false)
  })

  it("names the most recent published version", () => {
    expect(latestVersionOf(["1.9.0", "1.10.0", "1.2.0"])).toBe("1.10.0")
    expect(latestVersionOf([])).toBeNull()
  })
})

describe("licence in grace", () => {
  it("follows the server status", () => {
    expect(isLicenseGrace(state({ status: "grace" }))).toBe(true)
    expect(isLicenseGrace(state({ status: "active" }))).toBe(false)
    expect(isLicenseGrace(state({ status: "suspended" }))).toBe(false)
  })
})

describe("the overall decision", () => {
  it("raises nothing on a healthy server", () => {
    expect(detectAlerts(state(), NOW)).toEqual([])
  })

  it("raises each kind independently", () => {
    const kinds = detectAlerts(
      state({
        status: "grace",
        lastHeartbeatAt: minutesAgo(90),
        disk: 97,
        agentVersion: "1.0.0",
        publishedVersions: ["1.1.0", "1.2.0"],
        backup: {
          interval_hours: 24,
          last_run_at: hoursAgo(1),
          last_ok_at: hoursAgo(72),
          last_error: "boom",
        },
      }),
      NOW
    )

    expect(kinds.sort()).toEqual([
      "agent_outdated",
      "backup_failed",
      "backup_stale",
      "disk_high",
      "license_grace",
      "server_unreachable",
    ])
  })
})

describe("failed backup", () => {
  it("raises when the last attempt failed after the last success", () => {
    expect(
      isBackupFailed(
        state({
          backup: {
            interval_hours: 24,
            last_run_at: hoursAgo(1),
            last_ok_at: hoursAgo(25),
            last_error: "AccessDenied",
          },
        })
      )
    ).toBe(true)
  })

  it("raises for a server that has never succeeded", () => {
    expect(
      isBackupFailed(
        state({
          backup: {
            interval_hours: 24,
            last_run_at: hoursAgo(1),
            last_error: "NoSuchBucket",
          },
        })
      )
    ).toBe(true)
  })

  it("raises when the last backup left parts behind", () => {
    expect(
      isBackupFailed(
        state({
          backup: {
            interval_hours: 24,
            last_run_at: hoursAgo(1),
            last_ok_at: hoursAgo(1),
            last_warnings: 1,
          },
        })
      )
    ).toBe(true)
  })

  it("stays quiet when a success followed the error", () => {
    expect(
      isBackupFailed(
        state({
          backup: {
            interval_hours: 24,
            last_run_at: hoursAgo(1),
            last_ok_at: hoursAgo(1),
            last_error: "AccessDenied",
          },
        })
      )
    ).toBe(false)
  })

  it("stays quiet without an error, without a beat, or on a suspended server", () => {
    const failing = {
      interval_hours: 24,
      last_run_at: hoursAgo(1),
      last_error: "AccessDenied",
    }

    expect(
      isBackupFailed(
        state({ backup: { interval_hours: 24, last_run_at: hoursAgo(1) } })
      )
    ).toBe(false)
    expect(isBackupFailed(state({ backup: null }))).toBe(false)
    expect(
      isBackupFailed(state({ status: "suspended", backup: failing }))
    ).toBe(false)
  })
})

describe("overdue backup", () => {
  it("raises after two intervals without success", () => {
    expect(
      isBackupStale(
        state({ backup: { interval_hours: 24, last_ok_at: hoursAgo(49) } }),
        NOW
      )
    ).toBe(true)
  })

  it("lets pass a success less than two intervals old", () => {
    expect(
      isBackupStale(
        state({ backup: { interval_hours: 24, last_ok_at: hoursAgo(47) } }),
        NOW
      )
    ).toBe(false)
  })

  it("stays quiet when scheduling is switched off or no success exists", () => {
    expect(
      isBackupStale(
        state({ backup: { interval_hours: 0, last_ok_at: hoursAgo(500) } }),
        NOW
      )
    ).toBe(false)
    expect(
      isBackupStale(
        state({ backup: { interval_hours: 24, last_run_at: hoursAgo(100) } }),
        NOW
      )
    ).toBe(false)
  })
})
