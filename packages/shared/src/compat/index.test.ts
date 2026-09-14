import { describe, expect, it } from "bun:test"
import { PROTOCOL_VERSION } from "../agent-protocol/envelope"
import { compareVersions } from "../semver"
import {
  agentFloorFor,
  appFloorFor,
  compatibility,
  GENERATIONS,
  generationOf,
  protocolOf,
} from "./index"

describe("la feuille de compatibilité", () => {
  it("va de la plus ancienne génération à la plus récente", () => {
    for (const [index, generation] of GENERATIONS.entries()) {
      const previous = GENERATIONS[index - 1]

      if (!previous) {
        continue
      }

      expect(generation.protocol).toBeGreaterThan(previous.protocol)
      expect(compareVersions(generation.app, previous.app)).toBeGreaterThan(0)
      expect(compareVersions(generation.agent, previous.agent)).toBeGreaterThan(
        0
      )
    }
  })

  it("finit sur le protocole que le contrat porte aujourd'hui", () => {
    expect(GENERATIONS.at(-1)?.protocol).toBe(PROTOCOL_VERSION)
  })
})

describe("generationOf", () => {
  it("range une version dans la dernière génération qu'elle atteint", () => {
    expect(generationOf("app", "0.1.0")?.protocol).toBe(1)
    expect(generationOf("app", "0.1.9")?.protocol).toBe(1)
    expect(generationOf("app", "9.9.9")?.protocol).toBe(2)
    expect(generationOf("agent", "0.4.2")?.protocol).toBe(2)
  })

  it("ne range ni une version d'avant la feuille, ni un build de développement", () => {
    expect(generationOf("app", "0.0.9")).toBeNull()
    expect(generationOf("agent", "v0.1.0-3-gabc1234")).toBeNull()
  })

  it("range une pré-version dans la lignée qu'elle annonce", () => {
    expect(generationOf("app", "0.1.0-beta.1")?.protocol).toBe(1)
  })
})

describe("les planchers", () => {
  it("nomment l'agent qu'une app pilote et l'app qu'un agent sert", () => {
    expect(agentFloorFor("0.1.0")).toBe("0.1.0")
    expect(appFloorFor("0.1.0")).toBe("0.1.0")
    expect(protocolOf("app", "0.1.0")).toBe(1)
    expect(agentFloorFor("0.2.0")).toBe("0.2.0")
    expect(appFloorFor("0.3.1")).toBe("0.2.0")
    expect(protocolOf("agent", "0.2.0")).toBe(2)
  })

  it("ne nomment rien pour une version que la feuille ignore", () => {
    expect(agentFloorFor("0.0.1")).toBeNull()
    expect(appFloorFor("dev")).toBeNull()
  })
})

describe("compatibility", () => {
  it("accepte deux versions de la même génération", () => {
    expect(compatibility("0.1.0", "0.1.0")).toBe("ok")
    expect(compatibility("1.4.0", "0.2.0")).toBe("ok")
    expect(compatibility("0.1.2", "0.1.0")).toBe("ok")
  })

  it("range une pré-version dans la lignée qu'elle annonce", () => {
    expect(compatibility("0.1.0-beta.1", "0.1.0")).toBe("ok")
  })

  it("ne juge pas un build de développement", () => {
    expect(compatibility("0.1.0", "v0.1.0-3-gabc1234")).toBe("unknown")
    expect(compatibility("dev", "0.1.0")).toBe("unknown")
  })

  it("nomme le côté à mettre à jour quand une version précède la feuille", () => {
    expect(compatibility("0.0.1", "0.1.0")).toBe("app_too_old")
    expect(compatibility("0.1.0", "0.0.1")).toBe("agent_too_old")
  })

  it("nomme le côté à mettre à jour entre deux générations", () => {
    expect(compatibility("0.1.2", "0.2.0")).toBe("app_too_old")
    expect(compatibility("0.2.0", "0.1.2")).toBe("agent_too_old")
  })
})
