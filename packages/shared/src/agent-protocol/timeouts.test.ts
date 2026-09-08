import { describe, expect, it } from "bun:test"
import { COMMAND_NAMES, type CommandName } from "./index"
import {
  COMMAND_TIMEOUTS_MS,
  DEFAULT_TIMEOUT_MS,
  patienceOf,
  timeoutOf,
} from "./timeouts"

describe("les délais des commandes", () => {
  it("ne nomment que des commandes du contrat", () => {
    const named = Object.keys(COMMAND_TIMEOUTS_MS) as CommandName[]

    for (const cmd of named) {
      expect(COMMAND_NAMES).toContain(cmd)
    }
  })

  it("donnent le défaut à ce qu'ils ne nomment pas", () => {
    expect(timeoutOf("doctor")).toBe(DEFAULT_TIMEOUT_MS)
  })

  it("laissent une installation aller au bout d'un miroir lent", () => {
    expect(timeoutOf("install")).toBeGreaterThan(timeoutOf("snapshot"))
    expect(timeoutOf("harden")).toBe(timeoutOf("install"))
  })

  /** Past half of it, the screen says how long this is allowed to take. */
  it("disent à mi-course quand commencer à le dire", () => {
    expect(patienceOf("install")).toBe(timeoutOf("install") / 2)
  })
})
