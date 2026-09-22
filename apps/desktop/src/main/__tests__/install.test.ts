import { afterEach, describe, expect, it } from "bun:test";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import type { AgentDelivery } from "../agent-binary";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
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

describe("un préréglage installé de bout en bout", () => {
  it("rend les étapes de chaque module puis un rapport sans échec", async () => {
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

  it("n'annonce pas de flux secret quand le coffre est vide", async () => {
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

  it("refuse une installation sans module", async () => {
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

describe("le flux secret", () => {
  it("part sur l'entrée standard et vide le coffre une fois l'installation acceptée", async () => {
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

  it("ne met aucun secret dans les paramètres de la requête", async () => {
    const client = agent("install-preset.jsonl");
    setSecret(SERVER, "db.postgres", "app_password", PASSWORD);

    await runInstall(
      SERVER,
      PRESET,
      PRESET_CONFIG,
      () => undefined,
      vaulted(client)
    );

    // The transcript refuses the request if `params` doesn't match the
    // fixture, which carries only `version`, and refuses the secrets line if
    // it isn't the expected one: together, the two prove the separation.
    expect(fake?.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=install"]);

    client.closeAll();
  });

  /**
   * A refusal has consumed nothing: the agent validates the whole
   * configuration before its first step, and a machine busy or a line cut
   * before that never read the secrets. The form still shows them filled, and
   * the next Apply has to carry them again rather than leave with none.
   */
  it("garde le coffre quand l'agent refuse la configuration", async () => {
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

  it("garde le coffre quand la machine est occupée", async () => {
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

  it("garde le coffre quand le canal coupe avant la première étape", async () => {
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

  it("vide le coffre dès qu'une étape a été vue, même si le canal coupe ensuite", async () => {
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

  it("le second Apply repart avec les mêmes secrets", async () => {
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

describe("l'enrôlement", () => {
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

  it("remet le jeton sur le flux secret, jamais dans params", async () => {
    const client = agent([
      "enroll-then-install.jsonl",
      "install-no-secrets.jsonl",
    ]);

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
      "id=1 cmd=hello",
      "id=2 cmd=install",
    ]);

    client.closeAll();
  });

  it("arrête l'installation quand la plateforme refuse le jeton", async () => {
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
      error: { code: "entitlement_required" },
    });
    expect(fake?.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=enroll"]);

    client.closeAll();
  });

  it("n'enrôle rien quand la plateforme n'a rien accordé", async () => {
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

describe("un module en échec", () => {
  it("laisse les autres continuer et revient dans failed", async () => {
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

  it("se rejoue seul, avec sa seule configuration", async () => {
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

describe("l'envoi de l'agent avant la première installation", () => {
  it("choisit l'architecture que la sonde a rapportée, sur une machine nue", async () => {
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

  /**
   * The session that answered the probe still runs the binary the rename
   * replaced. The channels are dropped so the next word reaches the new one,
   * and a machine that already ran the agent has its configuration brought to
   * that binary's shape before anything is installed on it.
   */
  it("rouvre les canaux et migre la configuration après avoir remplacé l'agent d'un serveur géré", async () => {
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

  it("ne migre rien sur une machine qui n'avait pas d'agent", async () => {
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

  it("ne renvoie rien à un serveur déjà géré et à jour", async () => {
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

  it("dit clairement qu'aucun binaire n'est disponible, sans rien installer", async () => {
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

  it("ne demande le catalogue qu'une fois le binaire posé", async () => {
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

  it("refuse un module que le catalogue de ce serveur ne déclare pas", async () => {
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

  it("remonte l'échec de la sonde plutôt que d'installer à l'aveugle", async () => {
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

describe("une coupure pendant l'installation", () => {
  it("se reconnecte et relit le rapport au lieu de repartir de zéro", async () => {
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

describe("un enrôlement repris", () => {
  /**
   * A channel cut between the exchange and its answer leaves the app not
   * knowing whether the token was burnt. It was: the platform says so, and the
   * server carries the identity it granted.
   */
  it("ne réenrôle pas un agent qui porte déjà son identité", async () => {
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

  /**
   * The agent answers a burnt token and a revoked one with the same code, so a
   * refusal is reported as it comes: only the identity says the exchange
   * already happened, and a server without one has genuinely not enrolled.
   */
  it("rapporte un refus tel quel quand le serveur ne porte aucune identité", async () => {
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
                code: "entitlement_required",
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
      error: { code: "entitlement_required" },
      ok: false,
    });
  });

  const instant = { attempts: 3, delayMs: 0, sleep: () => Promise.resolve() };

  /**
   * A cut is not a refusal: the enrolment is sent again on a fresh channel, and
   * the seat is claimed on the attempt the line finally holds. The probe that
   * watches for an enrolment that already landed reads as a ping.
   */
  it("renvoie l'enrôlement quand le canal tombe, jusqu'à ce qu'il passe", async () => {
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
                    result: { enrolled: true, entitlement: "valid" },
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
      result: { enrolled: true, entitlement: "valid" },
    });
    expect(codes).toEqual([]);
  });

  /**
   * The cut the retry fears can fall after the exchange: the token is spent
   * and the machine enrolled, and the probe says so before another enrolment
   * replays what cannot be replayed.
   */
  it("voit un échange tombé après la remise comme l'enrôlement réussi qu'il fut", async () => {
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

  /** A refusal that is not a cut is not retried: it stands as it came. */
  it("ne réessaie pas un refus qui n'est pas une coupure", async () => {
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
              error: { code: "entitlement_required", message: "refusé" },
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

    expect(answer).toMatchObject({ error: { code: "entitlement_required" } });
    expect(calls).toBe(1);
  });

  /** A channel that never comes back gives up bounded, not for ever. */
  it("renonce après un nombre borné de coupures", async () => {
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

describe("la configuration pesée avant l'installation", () => {
  it("porte ce que la machine seule sait, et aucun secret", async () => {
    const client = agent("install-check.jsonl");

    const answer = await runCheck(
      SERVER,
      ["db.postgres"],
      { "db.postgres": { port: 5432 } },
      deps(client)
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

  it("refuse un module que l'agent ne déclare pas, sans toucher au canal", async () => {
    const client = agent("install-check.jsonl");

    const answer = await runCheck(
      SERVER,
      ["db.oracle"],
      { "db.oracle": {} },
      deps(client)
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "module_not_found" },
    });

    client.closeAll();
  });

  it("ne demande rien quand rien n'est choisi", async () => {
    const client = agent("install-check.jsonl");

    const answer = await runCheck(SERVER, [], {}, deps(client));

    expect(answer).toEqual({
      ok: true,
      result: { problems: [], warnings: [] },
    });
    expect(fake?.started()).toBe(0);

    client.closeAll();
  });
});
