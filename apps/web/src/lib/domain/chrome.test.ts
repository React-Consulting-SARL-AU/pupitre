import { describe, expect, it } from "bun:test"
import {
  consoleSection,
  SHORTCUT_MODIFIERS,
  shortcutModifier,
  sidebarCarriesChrome,
} from "./chrome"

describe("la section de la console", () => {
  it("reste la même d'une page à l'autre d'une même section", () => {
    expect(consoleSection("/dashboard/admin/inbox/thr_1")).toBe("admin")
    expect(consoleSection("/dashboard/admin/users")).toBe("admin")
    expect(consoleSection("/dashboard/servers/srv_1")).toBe("servers")
  })

  it("change quand la barre latérale change de section", () => {
    expect(consoleSection("/dashboard/billing")).not.toBe(
      consoleSection("/dashboard/servers")
    )
    expect(consoleSection("/dashboard")).toBe("")
  })
})

describe("le chrome de la console", () => {
  it("laisse la barre latérale porter le thème et le légal dans la console", () => {
    for (const pathname of [
      "/dashboard",
      "/dashboard/servers",
      "/dashboard/download",
      "/dashboard/servers/abc",
    ]) {
      expect(sidebarCarriesChrome(pathname), pathname).toBe(true)
    }
  })

  it("garde le pied de page partout ailleurs", () => {
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

describe("la touche d'un raccourci", () => {
  it("est la touche commande sur un appareil Apple", () => {
    for (const agent of [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    ]) {
      expect(shortcutModifier(agent), agent).toBe(SHORTCUT_MODIFIERS.apple)
    }
  })

  it("est la touche contrôle partout ailleurs, et avant que le navigateur parle", () => {
    for (const agent of [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Mozilla/5.0 (X11; Linux x86_64)",
      "",
    ]) {
      expect(shortcutModifier(agent), agent).toBe(SHORTCUT_MODIFIERS.other)
    }
  })
})
