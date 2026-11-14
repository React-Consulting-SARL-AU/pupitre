import { describe, expect, it } from "bun:test"
import { contractJsonSchema } from "../contracts/json-schema"
import {
  APP_MCP_TOOLS,
  CONFIRMED_TOOLS,
  isAppMcpTool,
  isPupitreMcpName,
  LOCAL_TOOLS,
  machineMcpName,
} from "./index"

describe("machineMcpName", () => {
  it("prefixes a chosen SSH name", () => {
    expect(machineMcpName("prod")).toBe("pupitre-prod")
  })

  it("keeps an app alias as it is", () => {
    expect(machineMcpName("pupitre-a1b2")).toBe("pupitre-a1b2")
  })

  it("turns what a client refuses into dashes", () => {
    expect(machineMcpName("box.example.com")).toBe("pupitre-box-example-com")
  })
})

describe("isPupitreMcpName", () => {
  it("knows the app's entry and the machines' entries", () => {
    expect(isPupitreMcpName("pupitre")).toBe(true)
    expect(isPupitreMcpName("pupitre-prod")).toBe(true)
    expect(isPupitreMcpName("playwright")).toBe(false)
  })
})

describe("APP_MCP_TOOLS", () => {
  it("gives every tool a JSON Schema a client can read", () => {
    for (const schema of Object.values(APP_MCP_TOOLS)) {
      expect(contractJsonSchema(schema).type).toBe("object")
    }
  })

  it("confirms only tools it declares", () => {
    for (const tool of CONFIRMED_TOOLS) {
      expect(isAppMcpTool(tool)).toBe(true)
    }
  })

  it("never asks the owner about a change that stays on this computer", () => {
    for (const tool of LOCAL_TOOLS) {
      expect(isAppMcpTool(tool)).toBe(true)
      expect(CONFIRMED_TOOLS.has(tool)).toBe(false)
    }
  })

  it("forwards a port, never a range nor a hostname", () => {
    expect(
      APP_MCP_TOOLS.forward_open.safeParse({ port: 8081, server: "s1" }).success
    ).toBe(true)
    expect(
      APP_MCP_TOOLS.forward_open.safeParse({ port: 70_000, server: "s1" })
        .success
    ).toBe(false)
    expect(
      APP_MCP_TOOLS.forward_open.safeParse({
        host: "10.0.0.2",
        port: 8081,
        server: "s1",
      }).success
    ).toBe(false)
  })

  it("refuses an unknown argument", () => {
    expect(
      APP_MCP_TOOLS.project_remove.safeParse({
        name: "shop",
        server: "s1",
        sudo: true,
      }).success
    ).toBe(false)
  })

  it("reads an inherited key as no tool", () => {
    expect(isAppMcpTool("toString")).toBe(false)
  })
})
