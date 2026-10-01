import { afterEach, describe, expect, it } from "bun:test";
import type {
  ModuleConfig,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import { judgedForApp } from "@shared/agent-update";
import type { AgentDelivery } from "../agent-binary";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
  type CheckDeps,
  enrolAgent,
  type InstallDeps,
  type InstallUpdate,
  runCheck,
  runInstall,
} from "../install-run";
import {
  forgetSecrets,
  marks,
  readSecrets,
  setSecret,
} from "../install-secrets";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "staging";
const PASSWORD = "s3cret-de-test";

const PRESET = ["core.system", "runtime.node", "db.postgres"];
const PRESET_CONFIG = {
  "core.system": { hostname: "staging" },
  "db.postgres": { version: "17" },
  "runtime.node": { version: "24" },
};

function machine(over: Partial<ProbeResult> = {}): ProbeResult {
  return {
    agent_version: "0.0.0-test",
    arch: "amd64",
    disk_free_gb: 38,
    docker: false,
    installed_modules: [],
    os: "ubuntu",
    panel: null,
    ports: [],
    ram_mb: 8192,
    sudo: true,
    version: "24.04",
    verdict: {
      fixes: [],
      kind: "managed",
      level: "ready",
      reasons: [],
      up_to_date: true,
    },
    ...over,
  };
}

let fake: FakeAgent | null = null;

function agent(fixtures: string | string[]): AgentClient {
  fake = fakeAgent(fixtures);

  return createAgentClient({
    appVersion: "0.1.0",
    backoff: { attempts: 3, firstMs: 5, maxMs: 20 },
    // The transcripts stamp their reports on this day: the client's clock has to agree.
    now: () => Date.parse("2026-09-04T12:00:00Z"),
    spawn: fake.spawn,
  });
}

function deps(
  client: AgentClient,
  over: Partial<InstallDeps> = {}
): InstallDeps {
  return {
    client,
    declared: () =>
      Promise.resolve({
        ok: true,
        result: [
          "core.system",
          "core.hardening",
          "runtime.node",
          "db.postgres",
          "db.mysql",
          "core.backup",
        ],
      }),
    deliver: () =>
      Promise.resolve({
        ok: true,
        result: {
          arch: "amd64",
          bytes: 12,
          path: "/usr/local/bin/pupitred",
          sha256: "0".repeat(64),
        },
      } satisfies AgentResponse<AgentDelivery>),
    enrollment: () => null,
    forgetSecrets,
    managed: () =>
      Promise.resolve({ ok: true, result: { config: {}, secrets: {} } }),
    probe: () => Promise.resolve({ ok: true, result: machine() }),
    secrets: () => ({}),
    ...over,
  };
}

function checkDeps(client: AgentClient, weighed: ModuleConfig = {}): CheckDeps {
  return { ...deps(client), weighed: () => Promise.resolve(weighed) };
}

/** The vault as `install.ts` wires it: read on the way out, emptied once taken. */
function vaulted(client: AgentClient, over: Partial<InstallDeps> = {}) {
  return deps(client, { secrets: readSecrets, ...over });
}

function heldAfter(updates: InstallUpdate[]): boolean | null {
  const last = updates.at(-1);

  return last?.kind === "secrets" ? last.held : null;
}

function collector(): {
  updates: InstallUpdate[];
  note: (u: InstallUpdate) => void;
} {
  const updates: InstallUpdate[] = [];

  return { note: (u) => updates.push(u), updates };
}

function steps(updates: InstallUpdate[]): string[] {
  return updates
    .filter((update) => update.kind === "event")
    .map((update) =>
      update.kind === "event"
        ? `${String(update.event.module)} ${String(update.event.step)} ${String(update.event.status)}`
        : ""
    );
}

afterEach(() => {
  fake?.killAll();
  fake = null;
  forgetSecrets(SERVER);
});

describe("a preset installed end to end", () => {
  it("returns each module's steps then a report with no failure", async () => {
    const client = agent("install-preset.jsonl");
    const { note, updates } = collector();

    const answer = await runInstall(
      SERVER,
      PRESET,
      PRESET_CONFIG,
      note,
      deps(client, {
        secrets: () => ({ "db.postgres": { app_password: PASSWORD } }),
      })
    );

    expect(steps(updates)).toEqual([
      "core.system paquets start",
      "core.system paquets ok",
      "runtime.node mise start",
      "runtime.node mise ok",
      "db.postgres apt start",
      "db.postgres apt ok",
      "db.postgres cluster start",
      "db.postgres cluster ok",
    ]);
    expect(answer).toEqual({
      ok: true,
      result: {
        failed: [],
        warned: [],
        report_path: "/var/lib/pupitre/report.json",
      },
    });

    client.closeAll();
  });

  it("announces no secret stream when the vault is empty", async () => {
    const client = agent("install-no-secrets.jsonl");
    const { note } = collector();

    const answer = await runInstall(
      SERVER,
      ["core.system"],
      { "core.system": {} },
      note,
      deps(client)
    );

    expect(answer.ok).toBe(true);

    client.closeAll();
  });

  it("refuses an installation without a module", async () => {
    const client = agent("install-preset.jsonl");

    const answer = await runInstall(
      SERVER,
      [],
      {},
      () => undefined,
      deps(client)
    );

    expect(answer).toMatchObject({ ok: false, error: { code: "bad_request" } });

    client.closeAll();
  });
});

describe("the secret stream", () => {
  it("goes out on standard input and empties the vault once the installation is accepted", async () => {
    const client = agent("install-preset.jsonl");
    setSecret(SERVER, "db.postgres", "app_password", PASSWORD);
    const { note, updates } = collector();

    const answer = await runInstall(
      SERVER,
      PRESET,
      PRESET_CONFIG,
      note,
      vaulted(client)
    );

    expect(answer.ok).toBe(true);
    expect(marks(SERVER)).toEqual({});
    expect(heldAfter(updates)).toBe(false);

    client.closeAll();

    const seen = [
      JSON.stringify(updates),
      JSON.stringify(answer),
      fake?.trace().join("\n") ?? "",
    ].join("\n");

    expect(seen).not.toContain(PASSWORD);
    expect(seen).not.toContain("app_password");
  });

  it("puts no secret in the request parameters", async () => {
    const client = agent("install-preset.jsonl");
    setSecret(SERVER, "db.postgres", "app_password", PASSWORD);

    await runInstall(
      SERVER,
      PRESET,
      PRESET_CONFIG,
      () => undefined,
      vaulted(client)
    );

    // The transcript refuses params beyond `version` and any other secrets line: that proves the separation.
    expect(fake?.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=install"]);

    client.closeAll();
  });

  // The agent validates the whole configuration before reading the secrets: a refusal consumed nothing.
  it("keeps the vault when the agent refuses the configuration", async () => {
    const client = agent("install-refused-config.jsonl");
    setSecret(SERVER, "db.postgres", "app_password", PASSWORD);
    const { note, updates } = collector();

    const answer = await runInstall(
      SERVER,
      ["db.postgres"],
      { "db.postgres": { version: "17" } },
      note,
      vaulted(client)
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "invalid_config" },
    });
    expect(marks(SERVER)).toEqual({
      "db.postgres": {
        app_password: { filled: true, generated: false, revealed: false },
      },
    });
    expect(heldAfter(updates)).toBe(true);

    client.closeAll();
  });

  it("keeps the vault when the machine is busy", async () => {
    const client = agent("install-busy.jsonl");
    setSecret(SERVER, "db.postgres", "app_password", PASSWORD);
    const { note, updates } = collector();

    const answer = await runInstall(
      SERVER,
      ["db.postgres"],
      { "db.postgres": { version: "17" } },
      note,
      vaulted(client)
    );

    expect(answer).toMatchObject({ ok: false, error: { code: "busy" } });
    expect(readSecrets(SERVER)).toEqual({
      "db.postgres": { app_password: PASSWORD },
    });
    expect(heldAfter(updates)).toBe(true);

    client.closeAll();
  });

  it("keeps the vault when the channel drops before the first step", async () => {
    const client = agent([
      "install-cut-early.jsonl",
      "install-resume-none.jsonl",
    ]);
    setSecret(SERVER, "db.postgres", "app_password", PASSWORD);
    const { note, updates } = collector();

    const answer = await runInstall(
      SERVER,
      ["db.postgres"],
      { "db.postgres": { version: "17" } },
      note,
      vaulted(client)
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "disconnected" },
    });
    expect(steps(updates)).toEqual([]);
    expect(readSecrets(SERVER)).toEqual({
      "db.postgres": { app_password: PASSWORD },
    });
    expect(heldAfter(updates)).toBe(true);

    client.closeAll();
  });

  it("empties the vault as soon as a step has been seen, even if the channel drops afterwards", async () => {
    const client = agent(["install-cut.jsonl", "install-resume-none.jsonl"]);
    setSecret(SERVER, "db.postgres", "app_password", PASSWORD);
    const { note, updates } = collector();

    const answer = await runInstall(
      SERVER,
      ["db.postgres"],
      { "db.postgres": { version: "17" } },
      note,
      vaulted(client)
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "disconnected" },
    });
    expect(steps(updates)).toEqual([
      "db.postgres apt start",
      "db.postgres apt ok",
    ]);
    expect(marks(SERVER)).toEqual({});
    expect(heldAfter(updates)).toBe(false);

    client.closeAll();
  });

  it("the second Apply restarts with the same secrets", async () => {
    const client = agent(["install-busy.jsonl", "install-preset.jsonl"]);
    setSecret(SERVER, "db.postgres", "app_password", PASSWORD);

    const refused = await runInstall(
      SERVER,
      ["db.postgres"],
      { "db.postgres": { version: "17" } },
      () => undefined,
      vaulted(client)
    );

    expect(refused).toMatchObject({ ok: false, error: { code: "busy" } });

    client.close(SERVER);

    const retried = await runInstall(
      SERVER,
      PRESET,
      PRESET_CONFIG,
      () => undefined,
      vaulted(client)
    );

    expect(retried.ok).toBe(true);
    expect(marks(SERVER)).toEqual({});
    expect(
      fake?.written().filter((line) => line.includes(PASSWORD))
    ).toHaveLength(2);

    client.closeAll();
  });
});

describe("enrolment", () => {
  const GRANT = {
    platformUrl: "https://app.pupitre.studio/api/v1",
    token: "enr-jeton-de-test",
  };

  function bare(): ProbeResult {
    return machine({
      agent_version: null,
      verdict: { fixes: [], kind: "bare", level: "ready", reasons: [] },
    });
  }

  function delivered(): InstallDeps["deliver"] {
    return () =>
      Promise.resolve({
        ok: true,
        result: {
          arch: "amd64",
          bytes: 12,
          enrollment: {
            release: { available: false, channel: "stable", version: "1.0.0" },
            serverId: "srv-platform-1",
          },
          path: "/usr/local/bin/pupitred",
          sha256: "0".repeat(64),
        },
      } satisfies AgentResponse<AgentDelivery>);
  }

  it("puts the token on the secret stream, never in params", async () => {
    const client = agent(["enroll-then-install.jsonl"]);

    const answer = await runInstall(
      SERVER,
      ["core.system"],
      { "core.system": {} },
      () => undefined,
      deps(client, {
        deliver: delivered(),
        enrollment: (id) => (id === "srv-platform-1" ? GRANT : null),
        probe: () => Promise.resolve({ ok: true, result: bare() }),
      })
    );

    expect(answer.ok).toBe(true);
    expect(fake?.trace()).toEqual([
      "id=1 cmd=hello",
      "id=2 cmd=enroll",
      "id=3 cmd=install",
    ]);
    expect(fake?.purposes()).toEqual(["privileged"]);

    client.closeAll();
  });

  it("stops the installation when the platform refuses the token", async () => {
    const client = agent("enroll-refused.jsonl");

    const answer = await runInstall(
      SERVER,
      ["core.system"],
      { "core.system": {} },
      () => undefined,
      deps(client, {
        deliver: delivered(),
        enrollment: () => GRANT,
        probe: () => Promise.resolve({ ok: true, result: bare() }),
      })
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "license_required" },
    });
    expect(fake?.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=enroll"]);

    client.closeAll();
  });

  it("enrols nothing when the platform granted nothing", async () => {
    const client = agent("install-no-secrets.jsonl");

    const answer = await runInstall(
      SERVER,
      ["core.system"],
      { "core.system": {} },
      () => undefined,
      deps(client, {
        deliver: delivered(),
        enrollment: () => null,
        probe: () => Promise.resolve({ ok: true, result: bare() }),
      })
    );

    expect(answer.ok).toBe(true);
    expect(fake?.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=install"]);

    client.closeAll();
  });
});

describe("a failed module", () => {
  it("lets the others continue and comes back in failed", async () => {
    const client = agent("install-one-fails.jsonl");
    const { note, updates } = collector();

    const answer = await runInstall(
      SERVER,
      ["core.system", "db.mysql", "runtime.node"],
      { "core.system": {}, "db.mysql": {}, "runtime.node": {} },
      note,
      deps(client)
    );

    expect(steps(updates)).toEqual([
      "core.system paquets start",
      "core.system paquets ok",
      "db.mysql apt start",
      "db.mysql apt fail",
      "runtime.node mise start",
      "runtime.node mise ok",
    ]);
    expect(answer).toMatchObject({
      ok: true,
      result: { failed: ["db.mysql"], warned: ["core.system"] },
    });

    client.closeAll();
  });

  it("replays alone, with only its own configuration", async () => {
    const client = agent("install-one-fails.jsonl");
    const config = {
      "core.system": {},
      "db.mysql": {},
      "runtime.node": {},
    };

    await runInstall(
      SERVER,
      ["core.system", "db.mysql", "runtime.node"],
      config,
      () => undefined,
      deps(client)
    );

    const { note, updates } = collector();
    const replay = await runInstall(
      SERVER,
      ["db.mysql"],
      config,
      note,
      deps(client)
    );

    expect(steps(updates)).toEqual(["db.mysql apt start", "db.mysql apt ok"]);
    expect(replay).toMatchObject({ ok: true, result: { failed: [] } });

    client.closeAll();
  });
});

describe("sending the agent before the first installation", () => {
  it("picks the architecture the probe reported, on a bare machine", async () => {
    const client = agent("install-no-secrets.jsonl");
    const asked: string[] = [];
    const { note, updates } = collector();

    await runInstall(
      SERVER,
      ["core.system"],
      { "core.system": {} },
      note,
      deps(client, {
        deliver: (_serverId, arch) => {
          asked.push(arch);

          return Promise.resolve({
            ok: true,
            result: {
              arch,
              bytes: 18_000_000,
              path: "/usr/local/bin/pupitred",
              sha256: "a".repeat(64),
            },
          });
        },
        probe: () =>
          Promise.resolve({
            ok: true,
            result: machine({
              agent_version: null,
              arch: "arm64",
              verdict: {
                fixes: [],
                kind: "bare",
                level: "ready",
                reasons: [],
              },
            }),
          }),
      })
    );

    expect(asked).toEqual(["arm64"]);
    expect(updates[0]).toEqual({ arch: "arm64", kind: "sending" });
    expect(updates[1]).toMatchObject({ kind: "sent", arch: "arm64" });

    client.closeAll();
  });

  // The session that answered the probe still runs the binary the rename replaced.
  it("reopens the channels and migrates the configuration after replacing the agent of a managed server", async () => {
    const client = agent([
      "hello-then-ping.jsonl",
      "agent-migrate-ok.jsonl",
      "install-no-secrets.jsonl",
    ]);

    await client.request(SERVER, "ping");

    const answer = await runInstall(
      SERVER,
      ["core.system"],
      { "core.system": {} },
      () => undefined,
      deps(client, {
        probe: () =>
          Promise.resolve({
            ok: true,
            result: machine({
              agent_version: "0.2.0",
              verdict: {
                fixes: [],
                kind: "managed",
                level: "ready",
                reasons: [],
                up_to_date: false,
              },
            }),
          }),
      })
    );

    expect(answer.ok).toBe(true);
    expect(fake?.started()).toBe(3);
    expect(fake?.trace()).toEqual([
      "id=1 cmd=hello",
      "id=2 cmd=ping",
      "id=1 cmd=hello",
      "id=2 cmd=agent.migrate",
      "id=1 cmd=hello",
      "id=2 cmd=install",
    ]);

    client.closeAll();
  });

  it("replaces with the embedded binary a 1.x agent that refuses the protocol 3 hello, then migrates on the new one", async () => {
    const client = agent([
      "protocol-mismatch.jsonl",
      "agent-migrate-ok.jsonl",
      "install-no-secrets.jsonl",
    ]);
    let delivered = 0;

    const refused = await client.request(SERVER, "snapshot");

    expect(refused).toMatchObject({
      ok: false,
      error: { code: "protocol_mismatch" },
    });

    const answer = await runInstall(
      SERVER,
      ["core.system"],
      { "core.system": {} },
      () => undefined,
      deps(client, {
        deliver: () => {
          delivered += 1;

          return Promise.resolve({
            ok: true,
            result: {
              arch: "amd64",
              bytes: 12,
              path: "/usr/local/bin/pupitred",
              sha256: "0".repeat(64),
            },
          });
        },
        probe: () =>
          Promise.resolve({
            ok: true,
            result: judgedForApp(machine({ agent_version: "1.2.1" }), "2.0.0"),
          }),
      })
    );

    expect(answer.ok).toBe(true);
    expect(delivered).toBe(1);
    expect(fake?.trace()).toEqual([
      "id=1 cmd=hello",
      "id=1 cmd=hello",
      "id=2 cmd=agent.migrate",
      "id=1 cmd=hello",
      "id=2 cmd=install",
    ]);

    client.closeAll();
  });

  it("migrates nothing on a machine that had no agent", async () => {
    const client = agent("install-no-secrets.jsonl");

    const answer = await runInstall(
      SERVER,
      ["core.system"],
      { "core.system": {} },
      () => undefined,
      deps(client, {
        probe: () =>
          Promise.resolve({
            ok: true,
            result: machine({
              agent_version: null,
              verdict: { fixes: [], kind: "bare", level: "ready", reasons: [] },
            }),
          }),
      })
    );

    expect(answer.ok).toBe(true);
    expect(fake?.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=install"]);

    client.closeAll();
  });

  it("sends nothing to a server that is already managed and up to date", async () => {
    const client = agent("install-no-secrets.jsonl");
    let sent = 0;
    const { note, updates } = collector();

    await runInstall(
      SERVER,
      ["core.system"],
      { "core.system": {} },
      note,
      deps(client, {
        deliver: () => {
          sent += 1;

          return Promise.resolve({
            ok: true,
            result: {
              arch: "amd64",
              bytes: 0,
              path: "/usr/local/bin/pupitred",
              sha256: "b".repeat(64),
            },
          });
        },
      })
    );

    expect(sent).toBe(0);
    expect(
      updates.every((update) => ["event", "secrets"].includes(update.kind))
    ).toBe(true);

    client.closeAll();
  });

  it("says plainly that no binary is available, without installing anything", async () => {
    const client = agent("install-no-secrets.jsonl");

    const answer = await runInstall(
      SERVER,
      ["core.system"],
      { "core.system": {} },
      () => undefined,
      deps(client, {
        deliver: () =>
          Promise.resolve({
            ok: false,
            error: {
              code: "internal",
              message:
                "Cette app ne porte pas d'agent pour l'architecture amd64.",
              fix: "Construis l'agent avec bun --cwd=apps/agent run build, puis reconstruis l'app.",
            },
          }),
        probe: () =>
          Promise.resolve({
            ok: true,
            result: machine({ agent_version: null }),
          }),
      })
    );

    expect(answer).toMatchObject({
      ok: false,
      error: {
        message: "Cette app ne porte pas d'agent pour l'architecture amd64.",
      },
    });
    expect(fake?.started()).toBe(0);

    client.closeAll();
  });

  it("requests the catalogue only once the binary is in place", async () => {
    const client = agent("install-no-secrets.jsonl");
    const order: string[] = [];

    await runInstall(
      SERVER,
      ["core.system"],
      { "core.system": {} },
      () => undefined,
      deps(client, {
        declared: () => {
          order.push("catalogue");

          return Promise.resolve({ ok: true, result: ["core.system"] });
        },
        deliver: (_serverId, arch) => {
          order.push("binaire");

          return Promise.resolve({
            ok: true,
            result: {
              arch,
              bytes: 4_071_584,
              path: "/usr/local/bin/pupitred",
              sha256: "c".repeat(64),
            },
          });
        },
        probe: () =>
          Promise.resolve({
            ok: true,
            result: machine({
              agent_version: null,
              verdict: { fixes: [], kind: "bare", level: "ready", reasons: [] },
            }),
          }),
      })
    );

    expect(order).toEqual(["binaire", "catalogue"]);

    client.closeAll();
  });

  it("refuses a module that this server's catalogue does not declare", async () => {
    const client = agent("install-no-secrets.jsonl");

    const answer = await runInstall(
      SERVER,
      ["db.inventé"],
      { "db.inventé": {} },
      () => undefined,
      deps(client, {
        declared: () => Promise.resolve({ ok: true, result: ["core.system"] }),
      })
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "module_not_found" },
    });
    expect(fake?.started()).toBe(0);

    client.closeAll();
  });

  it("surfaces the probe's failure rather than installing blind", async () => {
    const client = agent("install-no-secrets.jsonl");

    const answer = await runInstall(
      SERVER,
      ["core.system"],
      { "core.system": {} },
      () => undefined,
      deps(client, {
        probe: () =>
          Promise.resolve({
            ok: false,
            error: {
              code: "disconnected",
              message: "La sonde n'a pas pu s'exécuter sur le serveur.",
            },
          }),
      })
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "disconnected" },
    });
    expect(fake?.started()).toBe(0);

    client.closeAll();
  });
});

describe("a drop during the installation", () => {
  it("reconnects and rereads the report instead of starting over", async () => {
    const client = agent(["install-cut.jsonl", "install-resume.jsonl"]);
    setSecret(SERVER, "db.postgres", "app_password", PASSWORD);
    const { note, updates } = collector();

    const answer = await runInstall(
      SERVER,
      ["db.postgres"],
      { "db.postgres": { version: "17" } },
      note,
      vaulted(client)
    );

    expect(steps(updates)).toEqual([
      "db.postgres apt start",
      "db.postgres apt ok",
      "db.postgres cluster start",
      "db.postgres cluster ok",
    ]);
    expect(answer).toMatchObject({
      ok: true,
      result: { failed: [], warned: ["db.postgres"] },
    });
    expect(fake?.trace()).toEqual([
      "id=1 cmd=hello",
      "id=2 cmd=install",
      "id=3 cmd=hello",
      "id=4 cmd=report",
    ]);

    client.closeAll();
  });
});

describe("a resumed enrolment", () => {
  // A cut between the exchange and its answer leaves the token burnt: the server already carries its identity.
  it("does not re-enrol an agent that already carries its identity", async () => {
    const calls: string[] = [];

    const answer = await enrolAgent(
      "srv-1",
      {
        release: { available: true, channel: "stable", version: "0.4.0" },
        serverId: "plt-1",
      },
      {
        client: {
          close: () => undefined,
          request: (_id, cmd) => {
            calls.push(cmd);

            return Promise.resolve({ ok: true, result: {} } as never);
          },
        },
        enrollment: () => ({
          platformUrl: "https://app.pupitre.test",
          token: "enr-1",
        }),
        identity: () => "plt-1",
      }
    );

    expect(answer).toEqual({ ok: true, result: null });
    expect(calls).toEqual([]);
  });

  // The agent answers a burnt token and a revoked one with the same code: only the identity tells them apart.
  it("reports a refusal as is when the server carries no identity", async () => {
    const answer = await enrolAgent(
      "srv-1",
      {
        release: { available: true, channel: "stable", version: "0.4.0" },
        serverId: "plt-1",
      },
      {
        client: {
          close: () => undefined,
          request: () =>
            Promise.resolve({
              error: {
                code: "license_required",
                message: "ce jeton a déjà servi",
              },
              ok: false,
            } as never),
        },
        enrollment: () => ({
          platformUrl: "https://app.pupitre.test",
          token: "enr-1",
        }),
        identity: () => null,
      }
    );

    expect(answer).toMatchObject({
      error: { code: "license_required" },
      ok: false,
    });
  });

  const instant = { attempts: 3, delayMs: 0, sleep: () => Promise.resolve() };

  // The probe that watches for an enrolment that already landed reads as a ping.
  it("resends the enrolment when the channel drops, until it goes through", async () => {
    const codes = ["disconnected", "disconnected"];

    const answer = await enrolAgent(
      "srv-1",
      {
        release: { available: true, channel: "stable", version: "0.4.0" },
        serverId: "plt-1",
      },
      {
        client: {
          close: () => undefined,
          request: (_id, cmd) => {
            if (cmd === "ping") {
              return Promise.resolve({
                ok: true,
                result: { ts: "now" },
              } as never);
            }

            const code = codes.shift();

            return Promise.resolve(
              (code
                ? { error: { code, message: "coupé" }, ok: false }
                : {
                    ok: true,
                    result: { enrolled: true, license: "valid" },
                  }) as never
            );
          },
        },
        enrollment: () => ({
          platformUrl: "https://app.pupitre.test",
          token: "enr-1",
        }),
        identity: () => null,
      },
      instant
    );

    expect(answer).toEqual({
      ok: true,
      result: { enrolled: true, license: "valid" },
    });
    expect(codes).toEqual([]);
  });

  // A spent token cannot be replayed: the probe must see the enrolment before another one is sent.
  it("sees an exchange dropped after delivery as the successful enrolment it was", async () => {
    let enrolled = false;
    const commands: string[] = [];

    const answer = await enrolAgent(
      "srv-1",
      {
        release: { available: true, channel: "stable", version: "0.4.0" },
        serverId: "plt-1",
      },
      {
        client: {
          close: () => undefined,
          request: (_id, cmd) => {
            commands.push(cmd);

            if (cmd === "ping") {
              enrolled = true;

              return Promise.resolve({
                ok: true,
                result: { ts: "now" },
              } as never);
            }

            return Promise.resolve({
              error: { code: "disconnected", message: "coupé" },
              ok: false,
            } as never);
          },
        },
        enrollment: () => ({
          platformUrl: "https://app.pupitre.test",
          token: "enr-1",
        }),
        identity: () => (enrolled ? "plt-1" : null),
      },
      instant
    );

    expect(answer).toEqual({ ok: true, result: null });
    expect(commands).toEqual(["enroll", "ping"]);
  });

  it("does not retry a refusal that is not a drop", async () => {
    let calls = 0;

    const answer = await enrolAgent(
      "srv-1",
      {
        release: { available: true, channel: "stable", version: "0.4.0" },
        serverId: "plt-1",
      },
      {
        client: {
          close: () => undefined,
          request: () => {
            calls += 1;

            return Promise.resolve({
              error: { code: "license_required", message: "refusé" },
              ok: false,
            } as never);
          },
        },
        enrollment: () => ({
          platformUrl: "https://app.pupitre.test",
          token: "enr-1",
        }),
        identity: () => null,
      },
      instant
    );

    expect(answer).toMatchObject({ error: { code: "license_required" } });
    expect(calls).toBe(1);
  });

  it("gives up after a bounded number of drops", async () => {
    let enrolments = 0;
    let probes = 0;

    const answer = await enrolAgent(
      "srv-1",
      {
        release: { available: true, channel: "stable", version: "0.4.0" },
        serverId: "plt-1",
      },
      {
        client: {
          close: () => undefined,
          request: (_id, cmd) => {
            if (cmd === "ping") {
              probes += 1;

              return Promise.resolve({
                ok: true,
                result: { ts: "now" },
              } as never);
            }

            enrolments += 1;

            return Promise.resolve({
              error: { code: "disconnected", message: "coupé" },
              ok: false,
            } as never);
          },
        },
        enrollment: () => ({
          platformUrl: "https://app.pupitre.test",
          token: "enr-1",
        }),
        identity: () => null,
      },
      instant
    );

    expect(answer).toMatchObject({ error: { code: "disconnected" } });
    expect(enrolments).toBe(instant.attempts + 1);
    expect(probes).toBe(instant.attempts);
  });
});

describe("the configuration weighed before the installation", () => {
  it("carries what only the machine knows, and no secret", async () => {
    const client = agent("install-check.jsonl");

    const answer = await runCheck(
      SERVER,
      ["db.postgres"],
      { "db.postgres": { port: 5432 } },
      checkDeps(client)
    );

    expect(answer).toEqual({
      ok: true,
      result: {
        problems: [
          {
            module: "db.postgres",
            field: "port",
            code: "max",
            message: "le port 5432 est déjà écouté",
          },
        ],
        warnings: [],
      },
    });
    expect(fake?.written().join("\n")).not.toContain("secrets_stdin");

    client.closeAll();
  });

  it("weighs the form with the values the app will fill in from the keychain", async () => {
    const client = agent("install-check-managed.jsonl");

    const answer = await runCheck(
      SERVER,
      ["core.backup"],
      { "core.backup": { interval_hours: 24 } },
      checkDeps(client, {
        "core.backup": { bucket: "backups", endpoint: "https://s3.test" },
      })
    );

    expect(answer).toEqual({
      ok: true,
      result: { problems: [], warnings: [] },
    });

    client.closeAll();
  });

  it("does not keep the verdict on a bucket judged with the old secret key", async () => {
    const client = agent("install-check-old-secret.jsonl");

    const answer = await runCheck(
      SERVER,
      ["core.backup"],
      { "core.backup": { interval_hours: 24 } },
      checkDeps(client, { "core.backup": { access_key_id: "new-key" } })
    );

    expect(answer).toEqual({
      ok: true,
      result: {
        problems: [
          {
            code: "max",
            field: "keep",
            message: "trop grand",
            module: "core.backup",
          },
        ],
        warnings: [],
      },
    });

    client.closeAll();
  });

  it("refuses a module the agent does not declare, without touching the channel", async () => {
    const client = agent("install-check.jsonl");

    const answer = await runCheck(
      SERVER,
      ["db.oracle"],
      { "db.oracle": {} },
      checkDeps(client)
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "module_not_found" },
    });

    client.closeAll();
  });

  it("asks for nothing when nothing is chosen", async () => {
    const client = agent("install-check.jsonl");

    const answer = await runCheck(SERVER, [], {}, checkDeps(client));

    expect(answer).toEqual({
      ok: true,
      result: { problems: [], warnings: [] },
    });
    expect(fake?.started()).toBe(0);

    client.closeAll();
  });
});
