import { describe, expect, it } from "bun:test"
import { PROTOCOL_VERSION } from "../agent-protocol/envelope"
import { compareVersions } from "../semver"
import {
  agentFloorFor,
  compatibility,
  GENERATIONS,
  generationOf,
} from "./index"

describe("the compatibility sheet", () => {
  it("runs from the oldest generation to the most recent", () => {
    for (const [index, generation] of GENERATIONS.entries()) {
      const previous = GENERATIONS[index - 1]

      if (!previous) {
        continue
      }

      expect(generation.protocol).toBeGreaterThanOrEqual(previous.protocol)
      expect(compareVersions(generation.app, previous.app)).toBeGreaterThan(0)
      expect(compareVersions(generation.agent, previous.agent)).toBeGreaterThan(
        0
      )
    }
  })

  it("ends on the protocol the contract carries today", () => {
    expect(GENERATIONS.at(-1)?.protocol).toBe(PROTOCOL_VERSION)
  })
})

describe("generationOf", () => {
  it("files a version under the latest generation it reaches", () => {
    expect(generationOf("app", "0.1.0")?.protocol).toBe(1)
    expect(generationOf("app", "0.1.9")?.protocol).toBe(1)
    expect(generationOf("app", "1.9.9")?.protocol).toBe(2)
    expect(generationOf("app", "9.9.9")?.protocol).toBe(3)
    expect(generationOf("agent", "0.4.2")?.protocol).toBe(2)
    expect(generationOf("agent", "2.0.0")?.protocol).toBe(3)
    expect(generationOf("app", "0.9.1")?.app).toBe("0.2.0")
    expect(generationOf("app", "1.0.0")?.app).toBe("1.0.0")
    expect(generationOf("app", "2.3.0")?.app).toBe("2.0.0")
  })

  it("files neither a version from before the sheet nor a development build", () => {
    expect(generationOf("app", "0.0.9")).toBeNull()
    expect(generationOf("agent", "v0.1.0-3-gabc1234")).toBeNull()
  })

  it("files a pre-release under the line it announces", () => {
    expect(generationOf("app", "0.1.0-beta.1")?.protocol).toBe(1)
  })
})

describe("the floors", () => {
  it("name the agent that an app drives", () => {
    expect(agentFloorFor("0.1.0")).toBe("0.1.0")
    expect(agentFloorFor("0.2.0")).toBe("0.2.0")
    expect(agentFloorFor("0.9.1")).toBe("0.2.0")
    expect(agentFloorFor("1.0.0")).toBe("1.0.0")
    expect(agentFloorFor("1.3.0")).toBe("1.0.0")
    expect(agentFloorFor("2.0.0")).toBe("2.0.0")
  })

  it("name nothing for a version the sheet ignores", () => {
    expect(agentFloorFor("0.0.1")).toBeNull()
    expect(agentFloorFor("dev")).toBeNull()
  })
})

describe("compatibility", () => {
  it("accepts two versions of the same generation", () => {
    expect(compatibility("0.1.0", "0.1.0")).toBe("ok")
    expect(compatibility("0.9.1", "0.2.0")).toBe("ok")
    expect(compatibility("0.1.2", "0.1.0")).toBe("ok")
    expect(compatibility("1.4.0", "1.0.0")).toBe("ok")
  })

  it("separates 1.0 from 0.x, which do not open the privileged session", () => {
    expect(compatibility("0.9.1", "1.0.0")).toBe("app_too_old")
    expect(compatibility("1.0.0", "0.9.1")).toBe("agent_too_old")
    expect(compatibility("1.0.0-rc.1", "1.0.0")).toBe("ok")
  })

  it("separates 2.0, which speaks of licence, from 1.x", () => {
    expect(compatibility("2.0.0", "2.1.0")).toBe("ok")
    expect(compatibility("1.4.0", "2.0.0")).toBe("app_too_old")
    expect(compatibility("2.0.0", "1.2.1")).toBe("agent_too_old")
  })

  it("files a pre-release under the line it announces", () => {
    expect(compatibility("0.1.0-beta.1", "0.1.0")).toBe("ok")
  })

  it("does not judge a development build", () => {
    expect(compatibility("0.1.0", "v0.1.0-3-gabc1234")).toBe("unknown")
    expect(compatibility("dev", "0.1.0")).toBe("unknown")
  })

  it("names the side to update when a version precedes the sheet", () => {
    expect(compatibility("0.0.1", "0.1.0")).toBe("app_too_old")
    expect(compatibility("0.1.0", "0.0.1")).toBe("agent_too_old")
  })

  it("names the side to update between two generations", () => {
    expect(compatibility("0.1.2", "0.2.0")).toBe("app_too_old")
    expect(compatibility("0.2.0", "0.1.2")).toBe("agent_too_old")
  })
})
