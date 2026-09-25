import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bootApiTestServer,
  resetDb,
  TEST_BASE_URL,
} from "@pupitre/api/testing";
import { subscribeOrganization } from "@pupitre/api/testing/factories";
import {
  createTestSession,
  createTestUser,
  setTestSession,
} from "@pupitre/auth/testing";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { publicKeyFingerprint } from "@pupitre/shared/keys";
import type { SignInProgress } from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import type { InstallUpdate } from "@shared/install";
import { serve } from "bun";
import { createAccount } from "../account-run";
import { createTokenVault } from "../account-vault";
import type { AgentDelivery } from "../agent-binary";
import { createAgentClient } from "../agent-client";
import { asAgentError, summaryOf } from "../enrollment-run";
import { type EnrollmentGrant, runInstall } from "../install-run";
import { createPlatformClient } from "../platform-client";
import { fakeAgent } from "./fixtures/fake-agent";
import { memorySealer } from "./fixtures/fake-platform";

const DEVICE_PUBLIC_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJggxfUKhpYOKRen6E6lpoh//viuSJtxOQ8hVlFZb+/t jordan@macbook";

const MINUTE_MS = 60_000;

const dirs: string[] = [];

interface Console {
  approve: (userCode: string) => Promise<void>;
  headers: Headers;
}

async function rewindPolls(): Promise<void> {
  const { prisma } = await bootApiTestServer();

  await prisma.deviceCode.updateMany({
    data: { lastPolledAt: new Date(Date.now() - MINUTE_MS) },
  });
}

/** No server enrols without a running subscription, so the organization gets one by default. */
async function signedInConsole({ subscribed = true } = {}): Promise<Console> {
  const { prisma, fetch } = await bootApiTestServer();
  const { user, organization } = await createTestUser(prisma, {
    email: "ada@test.local",
  });

  if (subscribed) {
    await subscribeOrganization({ organizationId: organization.id });
  }

  const { token } = await createTestSession(prisma, { userId: user.id });
  const headers = setTestSession(new Headers(), { token });

  return {
    headers,
    approve: async (userCode) => {
      await fetch(`${TEST_BASE_URL}/api/auth/device?user_code=${userCode}`, {
        headers,
      });
      await fetch(`${TEST_BASE_URL}/api/auth/device/approve`, {
        body: JSON.stringify({ userCode }),
        headers: setTestSession(
          new Headers({ "content-type": "application/json" }),
          { token }
        ),
        method: "POST",
      });
    },
  };
}

async function desktop(browser: Console) {
  const { fetch } = await bootApiTestServer();
  const dir = mkdtempSync(join(tmpdir(), "pupitre-platform-"));

  dirs.push(dir);

  let code: string | null = null;
  let approved = false;

  const account = createAccount({
    build: "production",
    deviceKey: () => Promise.resolve(DEVICE_PUBLIC_KEY),
    deviceName: () => "MacBook d'Ada",
    now: () => Date.now(),
    openUrl: () => undefined,
    platform: createPlatformClient({ baseUrl: TEST_BASE_URL, fetch }),
    vault: createTokenVault({ dir, sealer: memorySealer }),
    wait: async () => {
      if (code && !approved) {
        approved = true;
        await browser.approve(code);
      }

      await rewindPolls();
    },
  });

  const report = (progress: SignInProgress) => {
    if (progress.kind === "code") {
      code = progress.userCode;
    }
  };

  return { account, dir, report };
}

/** The fake agent is a child process: it needs a real socket to reach this in-process API. */
async function platformBridge(): Promise<{ url: string; stop: () => void }> {
  const { fetch } = await bootApiTestServer();
  const server = serve({ fetch: (request) => fetch(request), port: 0 });

  return {
    stop: () => {
      server.stop(true);
    },
    url: `http://127.0.0.1:${server.port}/api/v1`,
  };
}

function bareMachine(): ProbeResult {
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
    verdict: { fixes: [], kind: "bare", level: "ready", reasons: [] },
    version: "24.04",
  };
}

function apiFetch(path: string, init: RequestInit = {}) {
  return bootApiTestServer().then((server) =>
    server.fetch(`${TEST_BASE_URL}/api/v1${path}`, init)
  );
}

function asAgent(token: string, body: unknown, path: string) {
  return apiFetch(path, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("le compte contre l'API de la plateforme", () => {
  beforeAll(async () => {
    await bootApiTestServer();
  });

  beforeEach(async () => {
    await resetDb();

    for (const dir of dirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("connecte l'appareil par le device flow et enregistre sa clé publique", async () => {
    const browser = await signedInConsole();
    const { account, report } = await desktop(browser);

    const signedIn = await account.signIn(report);

    expect(signedIn).toMatchObject({
      ok: true,
      result: {
        identity: { email: "ada@test.local", entitlement: "valid" },
        usage: { source: "platform", status: "granted" },
      },
    });
    expect(account.state().device?.publicKey).toBe(DEVICE_PUBLIC_KEY);

    const listed = await apiFetch("/me/devices", { headers: browser.headers });
    const body = (await listed.json()) as {
      data: { name: string; public_key: string }[];
    };

    expect(body.data).toMatchObject([
      { name: "MacBook d'Ada", public_key: DEVICE_PUBLIC_KEY },
    ]);
  });

  it("enrôle un serveur qui paraît dans la console avec son heartbeat en moins d'une minute", async () => {
    const browser = await signedInConsole();
    const { account, report } = await desktop(browser);

    await account.signIn(report);

    const started = Date.now();
    const enrolled = await account.enroll({
      device_id: account.state().device?.id ?? "",
      fingerprint: (await publicKeyFingerprint(DEVICE_PUBLIC_KEY)) ?? "",
      host: "vps.test",
      port: 22,
      probe: { arch: "amd64" },
      ssh_user: "root",
    });

    expect(enrolled.ok).toBe(true);

    if (!enrolled.ok) {
      throw new Error("unreachable");
    }

    const enrollmentToken = account.takeEnrollmentToken(
      enrolled.result.serverId
    );

    expect(enrollmentToken).toBeTruthy();

    const exchanged = await apiFetch("/agent/exchange", {
      body: JSON.stringify({
        agent_version: "1.4.0",
        arch: "amd64",
        enrollment_token: enrollmentToken,
        host_public_key: DEVICE_PUBLIC_KEY,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(exchanged.status).toBe(200);

    const { server_token } = (await exchanged.json()) as {
      server_token: string;
    };
    // Nothing in the app sends a heartbeat, so the test plays the agent's.
    const beat = await asAgent(
      server_token,
      {
        agent_version: "1.4.0",
        disk: 41,
        load: 1.2,
        modules: ["core.system"],
        ram: 55,
        sessions: ["dev"],
        stack_version: "1.0.0",
      },
      "/agent/heartbeat"
    );

    expect(beat.status).toBe(204);

    const listed = await apiFetch("/servers", { headers: browser.headers });
    const body = (await listed.json()) as {
      data: {
        id: string;
        host: string | null;
        status: string;
        stale: boolean;
        last_heartbeat_at: string | null;
        usage: { disk: number } | null;
      }[];
    };
    const seen = body.data.find(
      (server) => server.id === enrolled.result.serverId
    );

    expect(seen).toMatchObject({
      host: "vps.test",
      stale: false,
      status: "active",
      usage: { disk: 41 },
    });
    expect(Date.parse(seen?.last_heartbeat_at ?? "") - started).toBeLessThan(
      MINUTE_MS
    );
    expect(Date.now() - started).toBeLessThan(MINUTE_MS);
  });

  it("refuse l'enrôlement d'une organisation sans abonnement, avec le code et le remède de l'API", async () => {
    const browser = await signedInConsole({ subscribed: false });
    const { account, report } = await desktop(browser);

    await account.signIn(report);

    const input = {
      device_id: account.state().device?.id ?? "",
      host: "vps4.test",
      probe: { arch: "amd64" },
    };
    const enrolled = await account.enroll(input);

    expect(enrolled.ok).toBe(false);

    if (enrolled.ok) {
      throw new Error("unreachable");
    }

    const direct = await apiFetch("/servers/enroll", {
      body: JSON.stringify(input),
      headers: {
        authorization: browser.headers.get("authorization") ?? "",
        "content-type": "application/json",
      },
      method: "POST",
    });
    const refusal = (await direct.json()) as {
      error: { code: string; message: string; fix: string };
    };

    expect(direct.status).toBe(403);
    expect(refusal.error.code).toBe("entitlement_required");
    expect(enrolled.error).toEqual(refusal.error);
    expect(asAgentError(enrolled.error)).toEqual(refusal.error);

    const listed = await apiFetch("/servers", { headers: browser.headers });
    const body = (await listed.json()) as { data: unknown[] };

    expect(body.data).toEqual([]);
  });

  it("pousse la clé de l'appareil dans l'état que l'agent lit", async () => {
    const browser = await signedInConsole();
    const { account, report } = await desktop(browser);

    await account.signIn(report);

    const enrolled = await account.enroll({
      device_id: account.state().device?.id ?? "",
      host: "vps2.test",
      probe: { arch: "amd64" },
    });

    if (!enrolled.ok) {
      throw new Error("unreachable");
    }

    const exchanged = await apiFetch("/agent/exchange", {
      body: JSON.stringify({
        agent_version: "1.4.0",
        arch: "amd64",
        enrollment_token: account.takeEnrollmentToken(enrolled.result.serverId),
        host_public_key: DEVICE_PUBLIC_KEY,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { server_token } = (await exchanged.json()) as {
      server_token: string;
    };
    const state = await apiFetch("/agent/state", {
      headers: { authorization: `Bearer ${server_token}` },
    });
    const body = (await state.json()) as {
      authorized_keys: string[];
      entitlement: string;
    };

    expect(body.entitlement).toBe("valid");
    expect(body.authorized_keys.join("\n")).toContain(
      DEVICE_PUBLIC_KEY.split(" ")[1]
    );
  });

  it("enrôle un serveur par le protocole, sans jamais montrer le jeton", async () => {
    const browser = await signedInConsole();
    const { account, report } = await desktop(browser);

    await account.signIn(report);

    const bridge = await platformBridge();
    const fake = fakeAgent("enroll-install.jsonl");
    const client = createAgentClient({
      appVersion: "0.1.0",
      backoff: { attempts: 2, firstMs: 5, maxMs: 20 },
      spawn: fake.spawn,
    });

    const updates: InstallUpdate[] = [];
    let handed = "";

    const answer = await runInstall(
      "srv-local",
      ["core.system"],
      { "core.system": {} },
      (update) => updates.push(update),
      {
        client,
        declared: () => Promise.resolve({ ok: true, result: ["core.system"] }),
        deliver: async (_serverId, arch) => {
          const enrolled = await account.enroll({
            device_id: account.state().device?.id ?? "",
            host: "vps.test",
            port: 22,
            probe: { arch },
            ssh_user: "root",
          });

          if (!enrolled.ok) {
            return {
              ok: false,
              error: { code: "internal", message: enrolled.error.message },
            } satisfies AgentResponse<AgentDelivery>;
          }

          return {
            ok: true,
            result: {
              arch,
              bytes: 12,
              enrollment: summaryOf(enrolled.result),
              path: "/usr/local/bin/pupitred",
              sha256: "0".repeat(64),
            },
          } satisfies AgentResponse<AgentDelivery>;
        },
        enrollment: (platformServerId): EnrollmentGrant | null => {
          const token = account.takeEnrollmentToken(platformServerId);

          if (!token) {
            return null;
          }

          handed = token;

          return { platformUrl: bridge.url, token };
        },
        forgetSecrets: () => undefined,
        managed: () =>
          Promise.resolve({ ok: true, result: { config: {}, secrets: {} } }),
        probe: () => Promise.resolve({ ok: true, result: bareMachine() }),
        secrets: () => ({}),
      }
    );

    expect(answer).toMatchObject({ ok: true, result: { failed: [] } });
    expect(handed).not.toBe("");

    const requests = fake.written().filter((line) => line.includes('"cmd"'));
    const enrol = requests.find((line) => line.includes('"enroll"')) ?? "";

    expect(enrol).toContain(bridge.url);
    expect(enrol).toContain('"secrets_stdin":true');

    for (const line of requests) {
      expect(line).not.toContain(handed);
    }

    expect(fake.written().filter((line) => line.includes(handed))).toEqual([
      JSON.stringify({ enrollment_token: handed }),
    ]);

    expect(JSON.stringify(updates)).not.toContain(handed);
    expect(fake.trace().join("\n")).not.toContain(handed);
    expect(fake.trace()).toEqual([
      "id=1 cmd=hello",
      "id=2 cmd=enroll",
      "id=3 cmd=install",
    ]);

    const replayed = await apiFetch("/agent/exchange", {
      body: JSON.stringify({
        agent_version: "0.0.0-test",
        arch: "amd64",
        enrollment_token: handed,
        host_public_key: DEVICE_PUBLIC_KEY,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(replayed.status).toBe(409);

    client.closeAll();
    fake.killAll();
    bridge.stop();
  });

  it("brûle le jeton d'enrôlement : un second échange est refusé", async () => {
    const browser = await signedInConsole();
    const { account, report } = await desktop(browser);

    await account.signIn(report);

    const enrolled = await account.enroll({
      device_id: account.state().device?.id ?? "",
      host: "vps3.test",
      probe: { arch: "amd64" },
    });

    if (!enrolled.ok) {
      throw new Error("unreachable");
    }

    const token = account.takeEnrollmentToken(enrolled.result.serverId);
    const body = {
      agent_version: "0.0.0-test",
      arch: "amd64",
      enrollment_token: token,
      host_public_key: DEVICE_PUBLIC_KEY,
    };

    const first = await apiFetch("/agent/exchange", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(first.status).toBe(200);

    const again = await apiFetch("/agent/exchange", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(again.status).toBe(409);
  });
});
