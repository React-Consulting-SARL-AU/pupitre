import { afterEach, describe, expect, it } from "bun:test";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import type { AgentDelivery } from "../agent-binary";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
  type InstallDeps,
  type InstallUpdate,
  runInstall,
} from "../install-run";
import {
  forgetSecrets,
  marks,
  setSecret,
  takeSecrets,
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
    probe: () => Promise.resolve({ ok: true, result: machine() }),
    secrets: () => ({}),
    ...over,
  };
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
  it("part sur l'entrée standard et vide le coffre dans le même appel", async () => {
    const client = agent("install-preset.jsonl");
    setSecret(SERVER, "db.postgres", "app_password", PASSWORD);
    const { note, updates } = collector();

    const answer = await runInstall(
      SERVER,
      PRESET,
      PRESET_CONFIG,
      note,
      deps(client, { secrets: takeSecrets })
    );

    expect(answer.ok).toBe(true);
    expect(marks(SERVER)).toEqual({});

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
      deps(client, { secrets: takeSecrets })
    );

    // La transcription refuse la requête si `params` ne correspond pas au
    // fixture, qui ne porte que `version`, et refuse la ligne de secrets si
    // elle n'est pas celle attendue : les deux ensemble prouvent la séparation.
    expect(fake?.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=install"]);

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
    expect(updates.every((update) => update.kind === "event")).toBe(true);

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
      deps(client, { secrets: takeSecrets })
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
