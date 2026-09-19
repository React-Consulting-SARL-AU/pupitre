import { describe, expect, it } from "bun:test"
import {
  SHORTCUT_MODIFIERS,
  shortcutModifier,
  sidebarCarriesChrome,
} from "./chrome"

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
