import { describe, expect, it } from "bun:test"
import {
  COMMAND_NAMES,
  COMMANDS,
  isCommandName,
  LIMITED_COMMANDS,
  MIGRATION_COMMANDS,
  RESTRICTED_COMMANDS,
  requiresPrivilege,
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
  "harden.sudo",
  "upgrade",
  "report",
  "snapshot",
  "status",
  "service.status",
  "service.secret",
  "service.start",
  "service.stop",
  "service.restart",
  "service.logs",
  "completions",
  "project.list",
  "project.add",
  "project.detect",
  "project.update",
  "project.remove",
  "project.up",
  "project.down",
  "project.restart",
  "project.logs",
  "project.pull",
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
  "fs.list",
  "fs.stat",
  "fs.read",
  "fs.write",
  "fs.mkdir",
  "fs.rename",
  "fs.remove",
  "secrets.sync",
  "db.dump",
  "db.import",
  "db.shell",
  "db.url",
  "tunnel.status",
  "tunnel.sync",
  "tunnel.restart",
  "access.list",
  "access.create",
  "access.update",
  "access.revoke",
  "backup.status",
  "backup.contents",
  "backup.run",
  "backup.delete",
  "backup.inspect",
  "backup.restore.setup",
  "backup.restore.data",
  "backup.restore.abort",
  "enroll",
  "keys.list",
  "keys.sync",
  "keys.trust",
  "platform.sync",
  "agent.upgrade",
  "agent.migrate",
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
  it("only lets the nine contract commands through", () => {
    expect(([...RESTRICTED_COMMANDS] as string[]).sort()).toEqual(
      [
        "agent.migrate",
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
    expect(RESTRICTED_COMMANDS).toContain("snapshot")
    expect(RESTRICTED_COMMANDS).not.toContain("install")
  })

  it("lets a restricted server re-enrol, the gesture that repairs it", () => {
    expect(RESTRICTED_COMMANDS).toContain("enroll")
  })
})

describe("a configuration that is not at the expected revision", () => {
  const migrating: readonly string[] = MIGRATION_COMMANDS

  it("keeps open the view of the machine and the ways out", () => {
    for (const cmd of ["snapshot", "diag", "agent.upgrade", "agent.migrate"]) {
      expect(migrating).toContain(cmd)
    }
  })

  it("closes everything that reads or writes a configuration", () => {
    for (const cmd of ["install", "upgrade", "module.config", "project.add"]) {
      expect(migrating).not.toContain(cmd)
    }
  })

  it("lets a restricted server migrate too, since it can still update", () => {
    for (const cmd of RESTRICTED_COMMANDS) {
      expect(MIGRATION_COMMANDS).toContain(cmd)
    }

    expect(MIGRATION_COMMANDS).toContain("agent.migrate")
  })
})

describe("a session opened without the password", () => {
  it("lets through what a dev process could not turn into root", () => {
    for (const cmd of [
      "hello",
      "snapshot",
      "project.up",
      "fs.write",
      "service.restart",
      "agent.upgrade",
      "agent.migrate",
      "platform.sync",
    ]) {
      expect(requiresPrivilege(cmd)).toBe(false)
    }
  })

  it("keeps for the privileged session what configures, reveals or trusts", () => {
    for (const cmd of [
      "install",
      "install.check",
      "uninstall",
      "upgrade",
      "harden",
      "harden.sudo",
      "service.secret",
      "db.dump",
      "db.import",
      "backup.run",
      "backup.delete",
      "backup.inspect",
      "backup.restore.setup",
      "backup.restore.data",
      "backup.restore.abort",
      "enroll",
      "keys.trust",
      "reboot",
    ]) {
      expect(requiresPrivilege(cmd)).toBe(true)
    }
  })

  it("holds a command unknown to the list for privileged", () => {
    expect(requiresPrivilege("db.drop")).toBe(true)
  })

  it("keeps a downgrade for the privileged session", () => {
    expect(requiresPrivilege("agent.upgrade", { version: "1.0.0" })).toBe(false)
    expect(requiresPrivilege("agent.upgrade", { allow_downgrade: true })).toBe(
      true
    )
  })

  it("keeps for the privileged session what opens a project to the web", () => {
    expect(requiresPrivilege("project.add", { name: "shop" })).toBe(false)
    expect(requiresPrivilege("project.add", { protected: false })).toBe(true)
    expect(
      requiresPrivilege("project.add", {
        processes: [{ id: "hooks", protected: false }],
      })
    ).toBe(true)
    expect(
      requiresPrivilege("project.update", {
        patch: { protected: true, processes: [{ id: "web" }] },
      })
    ).toBe(false)
    expect(
      requiresPrivilege("project.update", { patch: { protected: false } })
    ).toBe(true)
    expect(
      requiresPrivilege("project.update", {
        patch: { processes: [{ id: "web", protected: false }] },
      })
    ).toBe(true)
  })

  it("keeps access keys for the privileged session", () => {
    for (const cmd of [
      "access.list",
      "access.create",
      "access.update",
      "access.revoke",
    ]) {
      expect(requiresPrivilege(cmd)).toBe(true)
    }
  })

  it("names only contract commands, each of them classified once", () => {
    for (const cmd of LIMITED_COMMANDS) {
      expect(isCommandName(cmd)).toBe(true)
    }

    expect(new Set(LIMITED_COMMANDS).size).toBe(LIMITED_COMMANDS.length)
  })

  it("keeps open what a restricted or migrating server answers, bar enrolment", () => {
    for (const cmd of [...RESTRICTED_COMMANDS, ...MIGRATION_COMMANDS]) {
      expect(requiresPrivilege(cmd)).toBe(cmd === "enroll")
    }
  })
})

describe("isCommandName", () => {
  it("narrows a string to a known command", () => {
    expect(isCommandName("db.dump")).toBe(true)
    expect(isCommandName("db.drop")).toBe(false)
  })
})
