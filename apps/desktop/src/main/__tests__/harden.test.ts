import { afterEach, describe, expect, it } from "bun:test";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import type { HardenUpdate } from "@shared/harden";
import type { Server } from "@shared/servers";
import { type AgentClient, createAgentClient } from "../agent-client";
import { runHarden } from "../harden-run";
import { runInstall } from "../install-run";
import { withAccount } from "../server-setup";
import { appSshPaths, controlDir, renderSshConfig } from "../ssh-config";
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

function agent(fixtures: string | string[], attempts = 3): AgentClient {
  fake = fakeAgent(fixtures);

  return createAgentClient({
    appVersion: "0.1.0",
    backoff: { attempts, firstMs: 5, maxMs: 20 },
    spawn: fake.spawn,
  });
}

/** One transcript per connection attempt, so the probes can be counted. */
function probing(fixtures: string[]): AgentClient {
  return agent(fixtures, 1);
}

const AT_ONCE = { attempts: 2, delayMs: 0, sleep: () => Promise.resolve() };

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
      user: () => servers[0]?.user ?? null,
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
      user: () => servers[0]?.user ?? null,
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
      user: () => "root",
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
      user: () => "root",
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
      user: () => "root",
    });

    expect(answer).toMatchObject({
      ok: true,
      result: { reconnected: false, user: null },
    });
  });
});

/**
 * The hardening restarts sshd, and the channel dies with it. The agent writes
 * no report of a hardening, so nothing can be read back: the app asks the
 * machine who opens it now, on the account it came in with and on `dev`.
 */
describe("un durcissement coupé en route", () => {
  function tracked(client: AgentClient) {
    const switched: string[] = [];
    let servers = [asRoot()];

    return {
      deps: {
        client,
        close: (id: string) => client.close(id),
        switchUser: (_id: string, user: string) => {
          const next = withAccount(servers, SERVER, user);
          if (!next) {
            return null;
          }
          servers = next;
          switched.push(user);

          return user;
        },
        user: () => servers[0]?.user ?? null,
      },
      switched,
      user: () => servers[0]?.user,
    };
  }

  it("passe sur dev quand root ne répond plus et que dev ouvre la machine", async () => {
    const client = probing([
      "harden-cut.jsonl",
      "dies-at-hello.jsonl",
      "hello-then-ping.jsonl",
    ]);
    const { deps, switched, user } = tracked(client);
    const updates: HardenUpdate[] = [];

    const answer = await runHarden(
      SERVER,
      (change) => updates.push(change),
      deps,
      AT_ONCE
    );

    expect(answer).toEqual({
      ok: true,
      result: {
        harden: { next_user: "dev", root_closed: true, root_kept: false },
        reconnected: true,
        user: "dev",
      },
    });
    expect(switched).toEqual(["root", "dev"]);
    expect(user()).toBe("dev");
    expect(updates.filter((change) => change.kind === "event")).toHaveLength(3);
    expect(updates.some((change) => change.kind === "switching")).toBe(true);
    expect(fake?.started()).toBe(3);
  });

  it("rend la coupure et reste sur root quand root ouvre encore la machine", async () => {
    const client = probing(["harden-cut.jsonl", "hello-then-ping.jsonl"]);
    const { deps, switched, user } = tracked(client);

    const answer = await runHarden(SERVER, () => undefined, deps, AT_ONCE);

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "disconnected" },
    });
    expect(switched).toEqual(["root"]);
    expect(user()).toBe("root");
    expect(fake?.started()).toBe(2);
  });

  it("laisse à sshd le temps de revenir avant de conclure", async () => {
    const client = probing([
      "harden-cut.jsonl",
      "dies-at-hello.jsonl",
      "dies-at-hello.jsonl",
      "dies-at-hello.jsonl",
      "hello-then-ping.jsonl",
    ]);
    const { deps, switched, user } = tracked(client);
    let slept = 0;

    const answer = await runHarden(SERVER, () => undefined, deps, {
      ...AT_ONCE,
      attempts: 3,
      sleep: () => {
        slept += 1;

        return Promise.resolve();
      },
    });

    expect(answer).toMatchObject({
      ok: true,
      result: { harden: { root_closed: true }, user: "dev" },
    });
    expect(switched).toEqual(["root", "dev", "root", "dev"]);
    expect(user()).toBe("dev");
    expect(slept).toBe(1);
  });

  it("remet la configuration sur root quand personne ne répond", async () => {
    const client = probing(["harden-cut.jsonl", "dies-at-hello.jsonl"]);
    const { deps, switched, user } = tracked(client);

    const answer = await runHarden(SERVER, () => undefined, deps, AT_ONCE);

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "disconnected" },
    });
    expect(switched).toEqual(["root", "dev", "root", "dev", "root"]);
    expect(user()).toBe("root");
  });

  it("ne relit jamais le rapport d'une installation à la place", async () => {
    const client = probing(["harden-cut.jsonl", "hello-then-ping.jsonl"]);
    const { deps } = tracked(client);

    await runHarden(SERVER, () => undefined, deps, AT_ONCE);

    expect(fake?.trace().some((line) => line.includes("cmd=report"))).toBe(
      false
    );
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
        forgetSecrets: () => undefined,
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
      user: () => servers[0]?.user ?? null,
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
  /**
   * `%C` is ssh's own hash of the host, the port and the account: a session
   * opened as root and one opened as dev never share a socket, so closing root
   * never leaves a master answering for it.
   */
  it("est nommé par ssh d'après le compte, pour ne pas réutiliser la session de root", () => {
    const paths = appSshPaths("/data");
    const rendered = renderSshConfig(
      [asRoot()],
      paths,
      "darwin",
      controlDir(501)
    );

    expect(rendered).toContain("  ControlPath /tmp/pupitre-501/%C");
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
