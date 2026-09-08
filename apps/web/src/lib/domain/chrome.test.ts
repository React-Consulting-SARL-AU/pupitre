import { describe, expect, it } from "bun:test"
import { sidebarCarriesChrome } from "./chrome"

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
