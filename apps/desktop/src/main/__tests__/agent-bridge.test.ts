import { describe, expect, it } from "bun:test";
import { COMMAND_NAMES } from "@pupitre/shared/agent-protocol";
import { BRIDGE_COMMANDS, checkedCall, isRefusal } from "../agent-bridge";

const knows = {
  declaresService: (serverId: string, id: string) =>
    serverId === "srv-1" && id === "db.postgres",
  knows: (serverId: string) => serverId === "srv-1",
};

function refusalOf(
  serverId: unknown,
  cmd: unknown,
  params?: unknown
): { code: string; id: string | undefined } | null {
  const call = checkedCall(serverId, cmd, params, knows);

  return isRefusal(call) && !call.ok
    ? { code: call.error.code, id: call.error.phrase?.id }
    : null;
}

describe("what the renderer can ask the agent", () => {
  it("lets a list read through, parameters validated", () => {
    const call = checkedCall("srv-1", "snapshot", undefined, knows);

    expect(call).toEqual({ serverId: "srv-1", cmd: "snapshot", params: {} });
  });

  it("keeps the parameters as the contract reads them", () => {
    const call = checkedCall("srv-1", "process.kill", { pid: 42 }, knows);

    expect(call).toEqual({
      serverId: "srv-1",
      cmd: "process.kill",
      params: { pid: 42 },
    });
  });

  it("lets a service be driven by its identifier, and nothing more", () => {
    for (const cmd of [
      "service.start",
      "service.stop",
      "service.restart",
    ] as const) {
      expect(checkedCall("srv-1", cmd, { id: "db.postgres" }, knows)).toEqual({
        serverId: "srv-1",
        cmd,
        params: { id: "db.postgres" },
      });
      expect(refusalOf("srv-1", cmd, {})?.id).toBe("refusal.params.invalid");
      expect(
        refusalOf("srv-1", cmd, { id: "db.postgres", force: true })?.id
      ).toBe("refusal.params.invalid");
    }
  });

  it("refuses a service the agent has not listed", () => {
    for (const cmd of [
      "service.start",
      "service.stop",
      "service.restart",
    ] as const) {
      expect(refusalOf("srv-1", cmd, { id: "db.inventé" })).toEqual({
        code: "service_not_found",
        id: "refusal.service.unknown",
      });
    }
  });

  it("redirects the project list and a service's logs to their own channel", () => {
    expect(refusalOf("srv-1", "project.list")?.id).toBe(
      "refusal.bridge.command"
    );
    expect(
      refusalOf("srv-1", "service.logs", { id: "db.postgres", lines: 50 })?.id
    ).toBe("refusal.bridge.command");
  });

  it("deletes a capture by its listed path, or the whole gallery", () => {
    expect(checkedCall("srv-1", "shots.clean", undefined, knows)).toEqual({
      serverId: "srv-1",
      cmd: "shots.clean",
      params: {},
    });
    expect(
      checkedCall(
        "srv-1",
        "shots.clean",
        { path: "2026-09-04/login.png" },
        knows
      )
    ).toEqual({
      serverId: "srv-1",
      cmd: "shots.clean",
      params: { path: "2026-09-04/login.png" },
    });
    expect(refusalOf("srv-1", "shots.clean", { path: "" })?.id).toBe(
      "refusal.params.invalid"
    );
  });

  it("refuses a server the configuration does not know", () => {
    expect(refusalOf("srv-9", "snapshot")).toEqual({
      code: "bad_request",
      id: "refusal.server.unknown",
    });
    expect(refusalOf(42, "snapshot")?.id).toBe("refusal.server.unknown");
  });

  it("refuses a command outside the contract", () => {
    expect(refusalOf("srv-1", "rm -rf")).toEqual({
      code: "unknown_command",
      id: "refusal.command.unknown",
    });
  });

  it("refuses any contract command that no screen sends through this bridge", () => {
    const shut = COMMAND_NAMES.filter((cmd) => !BRIDGE_COMMANDS.has(cmd));

    expect(shut).toContain("install");
    expect(shut).toContain("harden");
    expect(shut).toContain("upgrade");
    expect(shut).toContain("agent.upgrade");
    expect(shut).toContain("enroll");
    expect(shut).toContain("project.add");
    expect(shut).toContain("project.remove");
    expect(shut).toContain("secrets.sync");
    expect(shut).toContain("keys.sync");
    expect(shut).toContain("hello");

    for (const cmd of shut) {
      expect([cmd, refusalOf("srv-1", cmd)]).toEqual([
        cmd,
        { code: "bad_request", id: "refusal.bridge.command" },
      ]);
    }
  });

  it("refuses parameters the contract does not accept", () => {
    expect(refusalOf("srv-1", "process.kill", { pid: "x" })).toEqual({
      code: "bad_request",
      id: "refusal.params.invalid",
    });
  });

  it("lets no credential read through here", () => {
    for (const cmd of BRIDGE_COMMANDS) {
      expect(refusalOf("srv-1", cmd, {})?.id).not.toBe(
        "refusal.bridge.credential"
      );
    }
  });
});
