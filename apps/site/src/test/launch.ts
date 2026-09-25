import { vi } from "vitest"
import { LAUNCH_ENDS_AT } from "../lib/launch"

const DAY_MS = 86_400_000

export const DURING_LAUNCH = new Date(LAUNCH_ENDS_AT.getTime() - DAY_MS)

export const AFTER_LAUNCH = new Date(LAUNCH_ENDS_AT.getTime() + DAY_MS)

export function buildAt(date: Date): void {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(date)
}

export function buildNow(): void {
  vi.useRealTimers()
}
