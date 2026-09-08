import { afterEach, describe, expect, it } from "bun:test";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import type { HardenUpdate } from "@shared/harden";
import type { Server } from "@shared/servers";
import { type AgentClient, createAgentClient } from "../agent-client";
import { runHarden } from "../harden-run";
import { runInstall } from "../install-run";
import { withAccount } from "../server-setup";
import { appSshPaths, controlPath, renderSshConfig } from "../ssh-config";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "staging";

const PRESET = ["core.system", "runtime.node", "db.postgres"];
const PRESET_CONFIG = {
  "core.system": { hostname: "staging" },
  "db.postgres": { version: "17" },
  "runtime.node": { version: "24" },
};

function bare(): ProbeResult {
  return {
    agent_version: null,
    arch: "amd64",
    disk_free_gb: 38,
    docker: false,
    installed_modules: [],
    os: "ubuntu",
    panel: null,
    ports: [],
    ram_mb: 8192,
    sudo: true,
    verdict: {
      fixes: [],
      kind: "bare",
      level: "ready",
      reasons: [],
    },
    version: "24.04",
  };
}

function asRoot(): Server {
  return {
    host: "staging.example.net",
    id: SERVER,
    keyPath: "/keys/staging",
    name: "Staging",
    origin: "app",
    port: 22,
    user: "root",
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

/** The app's own configuration, rewritten exactly as `servers.ts` rewrites it. */
function account(servers: Server[], user: string) {
  const next = withAccount(servers, SERVER, user);

  return {
    config: next ? renderSshConfig(next, appSshPaths("/data")) : null,
    servers: next,
  };
}

afterEach(() => {
  fake?.killAll();
  fake = null;
});

describe("runHarden", () => {
  it("ferme root, bascule la configuration sur dev et se reconnecte", async () => {
    const client = agent(["harden-ok.jsonl", "hello-then-ping.jsonl"]);
    const updates: HardenUpdate[] = [];
    let servers = [asRoot()];
    let rendered = "";

    const answer = await runHarden(SERVER, (change) => updates.push(change), {
      client,
      close: (id) => client.close(id),
      switchUser: (id, user) => {
        const next = account(servers, user);
        if (!(next.servers && id === SERVER)) {
          return null;
        }
        servers = next.servers;
        rendered = next.config ?? rendered;

        return user;
      },
    });

    expect(answer).toMatchObject({
      ok: true,
      result: {
        harden: { next_user: "dev", root_closed: true, root_kept: false },
        reconnected: true,
        user: "dev",
      },
    });

    expect(servers[0]?.user).toBe("dev");
    expect(rendered).toContain("User dev");
    expect(updates.some((change) => change.kind === "switching")).toBe(true);
    expect(
      updates.filter((change) => change.kind === "event").length
    ).toBeGreaterThan(0);
  });

  it("bascule quand même sur dev quand root est gardé à la demande", async () => {
    const client = agent(["harden-kept.jsonl", "hello-then-ping.jsonl"]);
    let servers = [asRoot()];
    let rendered = "";

    const answer = await runHarden(SERVER, () => undefined, {
      client,
      close: (id) => client.close(id),
      switchUser: (id, user) => {
        const next = account(servers, user);
        if (!(next.servers && id === SERVER)) {
          return null;
        }
        servers = next.servers;
        rendered = next.config ?? rendered;

        return user;
      },
    });

    expect(answer).toMatchObject({
      ok: true,
      result: {
        harden: { next_user: "dev", root_closed: false, root_kept: true },
        reconnected: true,
        user: "dev",
      },
    });

    expect(servers[0]?.user).toBe("dev");
    expect(rendered).toContain("User dev");
  });

  it("garde root et rend la raison de l'agent telle quelle", async () => {
    const client = agent("harden-refused.jsonl");
    let switched = 0;

    const answer = await runHarden(SERVER, () => undefined, {
      client,
      close: () => undefined,
      switchUser: () => {
        switched += 1;

        return "dev";
      },
    });

    expect(switched).toBe(0);
    expect(answer).toEqual({
      ok: true,
      result: {
        harden: {
          next_user: "root",
          reason:
            "Aucune clé n'ouvre le compte dev : /home/dev/.ssh/authorized_keys est vide.",
          root_closed: false,
          root_kept: false,
        },
        reconnected: false,
        user: null,
      },
    });
  });

  it("dit pourquoi la reconnexion en dev n'a pas abouti", async () => {
    const client = agent(["harden-ok.jsonl", "hello-only.jsonl"]);

    const answer = await runHarden(SERVER, () => undefined, {
      client,
      close: (id) => client.close(id),
      switchUser: () => "dev",
    });

    expect(answer).toMatchObject({
      ok: true,
      result: { reconnected: false, user: "dev" },
    });
    expect(answer.ok ? answer.result.error?.message : null).toBeTruthy();
  });

  it("garde root quand l'app ne possède pas la configuration du serveur", async () => {
    const client = agent("harden-ok.jsonl");

    const answer = await runHarden(SERVER, () => undefined, {
      client,
      close: () => undefined,
      switchUser: () => null,
    });

    expect(answer).toMatchObject({
      ok: true,
      result: { reconnected: false, user: null },
    });
  });
});

describe("le parcours d'un serveur atteint en root", () => {
  it("installe puis durcit, et finit connecté en dev sans intervention", async () => {
    const client = agent(["parcours-root.jsonl", "hello-then-ping.jsonl"]);
    const delivered: string[] = [];
    let servers = [asRoot()];
    let rendered = renderSshConfig(servers, appSshPaths("/data"));

    expect(rendered).toContain("User root");

    const install = await runInstall(
      SERVER,
      PRESET,
      PRESET_CONFIG,
      () => undefined,
      {
        client,
        declared: () => Promise.resolve({ ok: true, result: [...PRESET] }),
        deliver: (_id, arch) => {
          delivered.push(arch);

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
        enrollment: () => null,
        managed: () =>
          Promise.resolve({ ok: true, result: { config: {}, secrets: {} } }),
        probe: () => Promise.resolve({ ok: true, result: bare() }),
        secrets: () => ({ "db.postgres": { app_password: "s3cret-de-test" } }),
      }
    );

    expect(install).toMatchObject({ ok: true, result: { failed: [] } });
    expect(delivered).toEqual(["amd64"]);

    const harden = await runHarden(SERVER, () => undefined, {
      client,
      close: (id) => client.close(id),
      switchUser: (_id, user) => {
        const next = account(servers, user);
        if (!next.servers) {
          return null;
        }
        servers = next.servers;
        rendered = next.config ?? rendered;

        return user;
      },
    });

    expect(harden).toMatchObject({
      ok: true,
      result: {
        harden: { root_closed: true },
        reconnected: true,
        user: "dev",
      },
    });
    expect(rendered).toContain("User dev");
    expect(rendered).not.toContain("User root");
  });
});

describe("le socket de multiplexage", () => {
  it("change avec le compte, pour ne pas réutiliser la session de root", () => {
    const paths = appSshPaths("/data");
    const server = asRoot();

    expect(controlPath(paths, server)).not.toBe(
      controlPath(paths, { ...server, user: "dev" })
    );
  });
});

describe("withAccount", () => {
  it("ne touche qu'au serveur nommé", () => {
    const other: Server = { ...asRoot(), id: "other", name: "Autre" };
    const next = withAccount([asRoot(), other], SERVER, "dev");

    expect(next?.[0].user).toBe("dev");
    expect(next?.[1].user).toBe("root");
  });

  it("refuse un compte que l'app ne saurait pas écrire", () => {
    expect(withAccount([asRoot()], SERVER, "dev; rm -rf /")).toBeNull();
    expect(withAccount([asRoot()], SERVER, "")).toBeNull();
  });

  it("refuse un serveur pris dans la configuration du système", () => {
    const system: Server = {
      ...asRoot(),
      keyPath: undefined,
      origin: "system",
    };

    expect(withAccount([system], SERVER, "dev")).toBeNull();
  });
});
