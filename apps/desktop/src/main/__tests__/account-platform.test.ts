import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bootApiTestServer,
  resetDb,
  TEST_BASE_URL,
} from "@pupitre/api/testing";
import {
  createTestSession,
  createTestUser,
  setTestSession,
} from "@pupitre/auth/testing";
import type { SignInProgress } from "@shared/account";
import { createAccount } from "../account-run";
import { createTokenVault } from "../account-vault";
import { createPlatformClient } from "../platform-client";
import { memorySealer } from "./fixtures/fake-platform";

/**
 * The account against the platform's own API, booted on PGlite.
 *
 * Nothing here reaches a remote service: `@pupitre/api/testing` is the same
 * Elysia app the console mounts. What it proves is the round trip APP-14 owns —
 * device flow, device key, enrolment — and that a server enrolled from the app
 * shows up in the console with its heartbeat well inside a minute.
 *
 * The exchange and the heartbeat are played by hand: `pupitred` does not speak
 * to the platform yet (AGT-14), and the app has no way to hand it the enrolment
 * token, which the agent protocol does not carry.
 */

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

async function signedInConsole(): Promise<Console> {
  const { prisma, fetch } = await bootApiTestServer();
  const { user } = await createTestUser(prisma, { email: "ada@test.local" });
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
      fingerprint: "SHA256:host",
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
});
