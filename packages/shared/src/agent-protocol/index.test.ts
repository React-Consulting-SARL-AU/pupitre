import { describe, expect, it } from "bun:test"
import {
  COMMAND_NAMES,
  COMMANDS,
  isAllowedInRestrictedMode,
  isCommandName,
  RESTRICTED_COMMANDS,
} from "./index"

const CONTRACT_COMMANDS = [
  "hello",
  "ping",
  "probe",
  "catalog",
  "install",
  "install.check",
  "module.config",
  "uninstall",
  "harden",
  "upgrade",
  "report",
  "snapshot",
  "status",
  "service.status",
  "service.secret",
  "completions",
  "project.list",
  "project.add",
  "project.detect",
  "project.remove",
  "project.up",
  "project.down",
  "project.restart",
  "project.logs",
  "project.sync",
  "project.install",
  "project.env",
  "project.branches",
  "project.checkout",
  "project.git_status",
  "project.working_tree",
  "project.diff",
  "project.url",
  "project.debug",
  "agent.open",
  "sessions.list",
  "sessions.clean",
  "processes.list",
  "process.kill",
  "shots.list",
  "shots.url",
  "shots.read",
  "shots.clean",
  "secrets.sync",
  "db.dump",
  "db.import",
  "db.shell",
  "db.url",
  "tunnel.status",
  "tunnel.sync",
  "tunnel.restart",
  "enroll",
  "keys.list",
  "keys.sync",
  "platform.sync",
  "agent.upgrade",
  "reboot",
  "doctor",
  "diag",
]

describe("COMMANDS", () => {
  it("covers every command of the contract, nothing more", () => {
    expect(([...COMMAND_NAMES] as string[]).sort()).toEqual(
      [...CONTRACT_COMMANDS].sort()
    )
  })

  it("gives each command a params and a result schema", () => {
    for (const name of COMMAND_NAMES) {
      expect(COMMANDS[name].params.safeParse).toBeFunction()
      expect(COMMANDS[name].result.safeParse).toBeFunction()
    }
  })

  it("validates params through the table", () => {
    expect(
      COMMANDS["project.up"].params.safeParse({ name: "all" }).success
    ).toBe(true)
    expect(COMMANDS["project.up"].params.safeParse({}).success).toBe(false)
    expect(COMMANDS.ping.params.safeParse({}).success).toBe(true)
    expect(COMMANDS.ping.params.safeParse({ x: 1 }).success).toBe(false)
  })
})

describe("restricted mode", () => {
  it("only lets the eight contract commands through", () => {
    expect(([...RESTRICTED_COMMANDS] as string[]).sort()).toEqual(
      [
        "agent.upgrade",
        "diag",
        "enroll",
        "hello",
        "ping",
        "platform.sync",
        "snapshot",
        "status",
      ].sort()
    )
    expect(isAllowedInRestrictedMode("snapshot")).toBe(true)
    expect(isAllowedInRestrictedMode("install")).toBe(false)
  })

  it("lets a restricted server re-enrol, the gesture that repairs it", () => {
    expect(isAllowedInRestrictedMode("enroll")).toBe(true)
  })
})

describe("isCommandName", () => {
  it("narrows a string to a known command", () => {
    expect(isCommandName("db.dump")).toBe(true)
    expect(isCommandName("db.drop")).toBe(false)
  })
})
