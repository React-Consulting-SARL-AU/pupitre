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

function probing(fixtures: string[]): AgentClient {
  return agent(fixtures, 1);
}

const AT_ONCE = { attempts: 2, delayMs: 0, sleep: () => Promise.resolve() };

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
  it("closes root, switches the configuration to dev and reconnects", async () => {
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

  it("switches to dev anyway when root is kept on request", async () => {
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

  it("keeps root and returns the agent's reason as is", async () => {
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

  it("says why the reconnection as dev did not succeed", async () => {
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

  it("keeps root when the app does not own the server's configuration", async () => {
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

// Hardening restarts sshd and writes no report, so the app probes which account opens the machine now.
describe("a hardening cut off midway", () => {
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

  it("switches to dev when root no longer answers and dev opens the machine", async () => {
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

  it("returns the cut and stays on root when root still opens the machine", async () => {
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

  it("gives sshd time to come back before concluding", async () => {
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

  it("puts the configuration back on root when nobody answers", async () => {
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

  it("never rereads an installation's report instead", async () => {
    const client = probing(["harden-cut.jsonl", "hello-then-ping.jsonl"]);
    const { deps } = tracked(client);

    await runHarden(SERVER, () => undefined, deps, AT_ONCE);

    expect(fake?.trace().some((line) => line.includes("cmd=report"))).toBe(
      false
    );
  });
});

describe("the journey of a server reached as root", () => {
  it("installs then hardens, and ends up connected as dev without intervention", async () => {
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

describe("the multiplexing socket", () => {
  // `%C` hashes host, port and account, so root and dev sessions never share a master socket.
  it("is named by ssh after the account, so root's session is not reused", () => {
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
  it("touches only the named server", () => {
    const other: Server = { ...asRoot(), id: "other", name: "Autre" };
    const next = withAccount([asRoot(), other], SERVER, "dev");

    expect(next?.[0].user).toBe("dev");
    expect(next?.[1].user).toBe("root");
  });

  it("refuses an account the app could not write", () => {
    expect(withAccount([asRoot()], SERVER, "dev; rm -rf /")).toBeNull();
    expect(withAccount([asRoot()], SERVER, "")).toBeNull();
  });

  it("refuses a server taken from the system configuration", () => {
    const system: Server = {
      ...asRoot(),
      keyPath: undefined,
      origin: "system",
    };

    expect(withAccount([system], SERVER, "dev")).toBeNull();
  });
});
