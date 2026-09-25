import { afterEach, describe, expect, it } from "bun:test";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import { type AgentClient, createAgentClient } from "../agent-client";
import { enterSudoPassword, setSudoPassword } from "../sudo-run";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "staging";

const PASSWORD = "k7mp-q2xw-9hdt-3vzc-u8fa-6rne";

const HASH =
  "$6$rounds=100000$Wq3vX8zYk1pL0sQe$PrJH1rPtYcXhyW28FJS0rQ7sq5jLB9mY/GZ8GL1MQMXesQF1UBBe.X8g.Z1cutPJzEeignRlhLB1GHAcUHivm.";

let fake: FakeAgent | null = null;

function agent(fixtures: string | string[]): AgentClient {
  fake = fakeAgent(fixtures);

  return createAgentClient({
    appVersion: "0.1.0",
    backoff: { attempts: 1, firstMs: 5, maxMs: 20 },
    spawn: fake.spawn,
  });
}

function vault(kept = true) {
  const held = new Map<string, string>();

  return {
    held,
    keep: (serverId: string, password: string) => {
      held.set(serverId, password);
    },
    state: (serverId: string) => ({ held: held.has(serverId), kept }),
  };
}

afterEach(() => {
  fake?.killAll();
  fake = null;
});

describe("setSudoPassword", () => {
  it("envoie l'empreinte sur la ligne secrète, jamais le mot de passe, et le garde une fois posé", async () => {
    const client = agent(["hello-then-ping.jsonl", "harden-sudo-ok.jsonl"]);
    const held = vault();
    const events: Event[] = [];

    await client.request(SERVER, "ping");

    const outcome = await setSudoPassword(
      SERVER,
      (event) => events.push(event),
      {
        client,
        draw: () => PASSWORD,
        hash: () => HASH,
        vault: held,
      }
    );

    expect(outcome).toEqual({ kept: true, ok: true });
    expect(held.held.get(SERVER)).toBe(PASSWORD);
    expect(events.length).toBe(5);

    const written = fake?.written() ?? [];
    const request = written.find((line) => line.includes('"harden.sudo"'));

    expect(request).not.toContain(HASH);
    expect(written).toContain(JSON.stringify({ password_hash: HASH }));
    expect(written.join("\n")).not.toContain(PASSWORD);
  });

  it("dit quand l'ordinateur n'a pas de trousseau pour le garder", async () => {
    const client = agent(["hello-then-ping.jsonl", "harden-sudo-ok.jsonl"]);

    await client.request(SERVER, "ping");

    const outcome = await setSudoPassword(SERVER, () => undefined, {
      client,
      draw: () => PASSWORD,
      hash: () => HASH,
      vault: vault(false),
    });

    expect(outcome).toEqual({ kept: false, ok: true });
  });

  it("ne garde rien quand l'agent refuse avant d'y toucher", async () => {
    const client = agent("harden-sudo-refused.jsonl");
    const held = vault();

    const outcome = await setSudoPassword(SERVER, () => undefined, {
      client,
      draw: () => PASSWORD,
      hash: () => HASH,
      vault: held,
    });

    expect(outcome).toMatchObject({
      error: { code: "bad_request" },
      ok: false,
    });
    expect(held.held.size).toBe(0);
  });

  it("passe par la session privilégiée, jamais par celle que sudo ouvre sans mot de passe", async () => {
    const client = agent(["hello-then-ping.jsonl", "harden-sudo-ok.jsonl"]);

    await client.request(SERVER, "ping");
    await setSudoPassword(SERVER, () => undefined, {
      client,
      draw: () => PASSWORD,
      hash: () => HASH,
      vault: vault(),
    });

    expect(fake?.purposes()).toEqual(["control", "privileged"]);
  });

  it("garde le mot de passe que l'agent a posé, même quand la règle a échoué ensuite", async () => {
    const client = agent("harden-sudo-restrict-failed.jsonl");
    const held = vault();

    const outcome = await setSudoPassword(SERVER, () => undefined, {
      client,
      draw: () => PASSWORD,
      hash: () => HASH,
      vault: held,
    });

    expect(outcome).toMatchObject({ error: { code: "internal" }, ok: false });
    expect(held.held.get(SERVER)).toBe(PASSWORD);
  });
});

/**
 * A server whose password this computer does not hold: another laptop, a lost
 * keychain. sudo is what says whether the password typed is the one, on the
 * very session the app would open with it.
 */
describe("enterSudoPassword", () => {
  function server(sudo: "password" | "nopasswd_all" = "password") {
    let offered: string | null = null;
    const calls: string[] = [];

    const client = {
      request: (
        _serverId: string,
        cmd: string,
        _params?: unknown,
        options: { privileged?: boolean } = {}
      ) => {
        calls.push(options.privileged ? `privileged ${cmd}` : cmd);

        if (cmd === "snapshot") {
          return Promise.resolve({ ok: true, result: { machine: { sudo } } });
        }

        return Promise.resolve(
          offered === PASSWORD
            ? { ok: true, result: { ts: "now" } }
            : {
                ok: false,
                error: {
                  code: "privilege_required",
                  message: "refusal.sudo.refused",
                  phrase: { id: "refusal.sudo.refused" },
                },
              }
        );
      },
      resetPrivileged: () => {
        calls.push("reset");
      },
    };

    return {
      calls,
      client,
      offer: (_serverId: string, password: string | null) => {
        offered = password;
      },
      offered: () => offered,
    };
  }

  it("garde le mot de passe que sudo accepte", async () => {
    const machine = server();
    const held = vault();

    const outcome = await enterSudoPassword(SERVER, PASSWORD, {
      client: machine.client as never,
      offer: machine.offer,
      vault: held,
    });

    expect(outcome).toEqual({ kept: true, ok: true });
    expect(held.held.get(SERVER)).toBe(PASSWORD);
    expect(machine.calls).toEqual(["snapshot", "reset", "privileged ping"]);
    expect(machine.offered()).toBeNull();
  });

  it("ne garde pas un mot de passe que sudo refuse, et rend la session à celui d'avant", async () => {
    const machine = server();
    const held = vault();

    const outcome = await enterSudoPassword(SERVER, "pas-le-bon", {
      client: machine.client as never,
      offer: machine.offer,
      vault: held,
    });

    expect(outcome).toMatchObject({
      error: { code: "privilege_required" },
      ok: false,
    });
    expect(held.held.size).toBe(0);
    expect(machine.calls).toEqual([
      "snapshot",
      "reset",
      "privileged ping",
      "reset",
    ]);
    expect(machine.offered()).toBeNull();
  });

  it("ne garde rien sur un serveur qui ne demande pas encore de mot de passe", async () => {
    const machine = server("nopasswd_all");
    const held = vault();

    const outcome = await enterSudoPassword(SERVER, PASSWORD, {
      client: machine.client as never,
      offer: machine.offer,
      vault: held,
    });

    expect(outcome).toMatchObject({
      error: { phrase: { id: "refusal.sudo.open" } },
      ok: false,
    });
    expect(held.held.size).toBe(0);
    expect(machine.calls).toEqual(["snapshot"]);
  });
});
