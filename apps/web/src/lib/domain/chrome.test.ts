import { describe, expect, it } from "bun:test"
import {
  consoleSection,
  SHORTCUT_MODIFIERS,
  shortcutModifier,
  sidebarCarriesChrome,
} from "./chrome"

describe("the console section", () => {
  it("stays the same from one page to another within a section", () => {
    expect(consoleSection("/dashboard/admin/inbox/thr_1")).toBe("admin")
    expect(consoleSection("/dashboard/admin/users")).toBe("admin")
    expect(consoleSection("/dashboard/servers/srv_1")).toBe("servers")
  })

  it("changes when the sidebar changes section", () => {
    expect(consoleSection("/dashboard/billing")).not.toBe(
      consoleSection("/dashboard/servers")
    )
    expect(consoleSection("/dashboard")).toBe("")
  })
})

describe("the console chrome", () => {
  it("lets the sidebar carry the theme and the legal pages in the console", () => {
    for (const pathname of [
      "/dashboard",
      "/dashboard/servers",
      "/dashboard/download",
      "/dashboard/servers/abc",
    ]) {
      expect(sidebarCarriesChrome(pathname), pathname).toBe(true)
    }
  })

  it("keeps the footer everywhere else", () => {
    for (const pathname of [
      "/",
      "/auth/sign-in",
      "/auth/device",
      "/status",
      "/dashboards",
    ]) {
      expect(sidebarCarriesChrome(pathname), pathname).toBe(false)
    }
  })
})

describe("a shortcut's key", () => {
  it("is the command key on an Apple device", () => {
    for (const agent of [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    ]) {
      expect(shortcutModifier(agent), agent).toBe(SHORTCUT_MODIFIERS.apple)
    }
  })

  it("is the control key everywhere else, and before the browser speaks", () => {
    for (const agent of [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Mozilla/5.0 (X11; Linux x86_64)",
      "",
    ]) {
      expect(shortcutModifier(agent), agent).toBe(SHORTCUT_MODIFIERS.other)
    }
  })
})
