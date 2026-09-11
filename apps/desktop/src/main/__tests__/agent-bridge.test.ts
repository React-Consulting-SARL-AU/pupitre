import { describe, expect, it } from "bun:test";
import { COMMAND_NAMES } from "@pupitre/shared/agent-protocol";
import { BRIDGE_COMMANDS, checkedCall, isRefusal } from "../agent-bridge";

const knows = (serverId: string) => serverId === "srv-1";

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

describe("ce que le renderer peut demander à l'agent", () => {
  it("laisse passer une lecture de la liste, paramètres validés", () => {
    const call = checkedCall("srv-1", "snapshot", undefined, knows);

    expect(call).toEqual({ serverId: "srv-1", cmd: "snapshot", params: {} });
  });

  it("garde les paramètres tels que le contrat les lit", () => {
    const call = checkedCall("srv-1", "process.kill", { pid: 42 }, knows);

    expect(call).toEqual({
      serverId: "srv-1",
      cmd: "process.kill",
      params: { pid: 42 },
    });
  });

  it("laisse piloter et lire un service par son identifiant, et rien de plus", () => {
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

    expect(
      checkedCall(
        "srv-1",
        "service.logs",
        { id: "db.postgres", lines: 50, follow: true },
        knows
      )
    ).toEqual({
      serverId: "srv-1",
      cmd: "service.logs",
      params: { id: "db.postgres", lines: 50, follow: true },
    });
    expect(
      refusalOf("srv-1", "service.logs", { id: "db.postgres", lines: 0 })?.id
    ).toBe("refusal.params.invalid");
  });

  it("efface une capture par son chemin listé, ou toute la galerie", () => {
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

  it("refuse un serveur que la configuration ne connaît pas", () => {
    expect(refusalOf("srv-9", "snapshot")).toEqual({
      code: "bad_request",
      id: "refusal.server.unknown",
    });
    expect(refusalOf(42, "snapshot")?.id).toBe("refusal.server.unknown");
  });

  it("refuse une commande hors du contrat", () => {
    expect(refusalOf("srv-1", "rm -rf")).toEqual({
      code: "unknown_command",
      id: "refusal.command.unknown",
    });
  });

  it("refuse toute commande du contrat qu'aucun écran n'émet par ce pont", () => {
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

  it("refuse des paramètres que le contrat n'accepte pas", () => {
    expect(refusalOf("srv-1", "process.kill", { pid: "x" })).toEqual({
      code: "bad_request",
      id: "refusal.params.invalid",
    });
  });

  it("ne laisse aucune lecture d'identifiant passer par ici", () => {
    for (const cmd of BRIDGE_COMMANDS) {
      expect(refusalOf("srv-1", cmd, {})?.id).not.toBe(
        "refusal.bridge.credential"
      );
    }
  });
});
