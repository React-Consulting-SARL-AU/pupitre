import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildKind, SignInProgress } from "@shared/account";
import { type AccountDeps, createAccount, TOLERANCE_MS } from "../account-run";
import { createTokenVault } from "../account-vault";
import {
  DEVICE,
  FAKE_KEY,
  FAKE_TOKEN,
  type FakePlatformOptions,
  fakePlatform,
  IDENTITY,
  memorySealer,
  OVER_FREE_SERVERS,
} from "./fixtures/fake-platform";

const DAY_MS = 86_400_000;

const dirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "pupitre-account-"));

  dirs.push(dir);

  return dir;
}

function harness({
  build = "development" as BuildKind,
  now = () => Date.parse("2026-09-04T10:00:00.000Z"),
  ...options
}: FakePlatformOptions & { build?: BuildKind; now?: () => number } = {}) {
  const dir = scratch();
  const platform = fakePlatform(options);
  const opened: string[] = [];
  const deps: AccountDeps = {
    build,
    deviceKey: () => Promise.resolve(FAKE_KEY),
    deviceName: () => "MacBook",
    now,
    openUrl: (url) => {
      opened.push(url);
    },
    platform,
    vault: createTokenVault({ dir, sealer: memorySealer }),
    wait: () => Promise.resolve(),
  };

  return { account: createAccount(deps), deps, dir, opened, platform };
}

function progressOf(): {
  seen: SignInProgress[];
  report: (progress: SignInProgress) => void;
} {
  const seen: SignInProgress[] = [];

  return { report: (progress) => seen.push(progress), seen };
}

function filesOf(dir: string): string[] {
  return readdirSync(dir).map((name) =>
    readFileSync(join(dir, name), "latin1")
  );
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("sign-in", () => {
  it("shows the code, opens the browser and waits for approval", async () => {
    const { account, opened } = harness({
      polls: ["authorization_pending", "slow_down", "authorized"],
    });
    const { report, seen } = progressOf();

    const answer = await account.signIn(report);

    expect(answer.ok).toBe(true);
    expect(seen).toEqual([
      { kind: "starting" },
      {
        kind: "code",
        userCode: "WDJB-MJHT",
        verificationUri: "https://app.pupitre.test/auth/device",
        verificationUriComplete:
          "https://app.pupitre.test/auth/device?user_code=WDJB-MJHT",
      },
      { kind: "waiting" },
    ]);
    expect(opened).toEqual([
      "https://app.pupitre.test/auth/device?user_code=WDJB-MJHT",
    ]);
  });

  it("registers the device's public key, once only", async () => {
    const { account, platform } = harness();
    const { report } = progressOf();

    await account.signIn(report);
    await account.signIn(report);

    expect(platform.added).toEqual([{ name: "MacBook", publicKey: FAKE_KEY }]);
    expect(account.state().device?.publicKey).toBe(FAKE_KEY);
  });

  it("reuses the device the platform already knows", async () => {
    const { account, platform } = harness({ devices: [DEVICE] });
    const { report } = progressOf();

    await account.signIn(report);

    expect(platform.added).toEqual([]);
    expect(account.state().device?.id).toBe(DEVICE.id);
  });

  it("states the browser's refusal with its fix", async () => {
    const { account } = harness({ polls: ["denied"] });
    const { report } = progressOf();

    const answer = await account.signIn(report);

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "denied", phrase: { id: "refusal.signIn.denied" } },
    });
  });

  it("states the code's expiry", async () => {
    const { account } = harness({ polls: ["expired"] });
    const { report } = progressOf();

    expect(await account.signIn(report)).toMatchObject({
      ok: false,
      error: { code: "expired" },
    });
  });

  it("stops when cancelled, keeping no token, and the next one starts afresh", async () => {
    const { deps } = harness({
      polls: ["authorization_pending", "authorization_pending", "authorized"],
    });
    const { report } = progressOf();
    let cancelling = true;
    const account = createAccount({
      ...deps,
      wait: () => {
        if (cancelling) {
          account.cancelSignIn();
        }

        return Promise.resolve();
      },
    });

    const answer = await account.signIn(report);

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "cancelled", phrase: { id: "refusal.signIn.cancelled" } },
    });
    expect(account.state().identity).toBeNull();

    cancelling = false;

    expect((await account.signIn(report)).ok).toBe(true);
  });
});

describe("the token", () => {
  it("crosses neither the disk, nor a log, nor what the renderer receives", async () => {
    const { account, dir } = harness();
    const { report, seen } = progressOf();
    const logged: unknown[] = [];
    const kept = { error: console.error, log: console.log, warn: console.warn };

    console.log = (...args: unknown[]) => logged.push(...args);
    console.warn = (...args: unknown[]) => logged.push(...args);
    console.error = (...args: unknown[]) => logged.push(...args);

    let crossed = "";

    try {
      const answer = await account.signIn(report);
      const enrolled = await account.enroll({
        device_id: "device-1",
        host: "vps.test",
        probe: { arch: "amd64" },
      });

      crossed = JSON.stringify([answer, enrolled, seen, account.state()]);
    } finally {
      console.error = kept.error;
      console.log = kept.log;
      console.warn = kept.warn;
    }

    expect(crossed).not.toContain(FAKE_TOKEN);
    expect(crossed).not.toContain("enrol-secret");
    expect(JSON.stringify(logged)).not.toContain(FAKE_TOKEN);

    for (const content of filesOf(dir)) {
      expect(content).not.toContain(FAKE_TOKEN);
    }
  });

  it("goes away with sign-out", async () => {
    const { account, dir } = harness();
    const { report } = progressOf();

    await account.signIn(report);

    const after = account.signOut();

    expect(after.identity).toBeNull();
    expect(after.device).toBeNull();
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("the licence", () => {
  it("holds seven days without the platform, and not eight", async () => {
    let clock = Date.parse("2026-09-04T10:00:00.000Z");
    const { account } = harness({ build: "production", now: () => clock });
    const { report } = progressOf();

    await account.signIn(report);

    expect(account.state().usage).toMatchObject({
      source: "platform",
      status: "granted",
    });

    clock += 6 * DAY_MS;
    expect(account.state().usage).toMatchObject({
      source: "cache",
      status: "granted",
    });
    expect(account.guard().ok).toBe(true);

    clock += TOLERANCE_MS;
    expect(account.state().usage).toMatchObject({ status: "stale" });
    expect(account.guard()).toMatchObject({
      ok: false,
      error: { code: "license_required" },
    });
  });

  it("refuses at once a session the platform no longer recognizes", async () => {
    const { account, deps, platform } = harness({ build: "production" });
    const { report } = progressOf();

    await account.signIn(report);
    expect(account.guard().ok).toBe(true);

    platform.me = () =>
      Promise.resolve({
        ok: false,
        error: { code: "unauthenticated", message: "refusal.platform.refused" },
      });

    const refreshed = await account.refresh();

    expect(refreshed.usage).toMatchObject({ status: "absent" });
    expect(refreshed.identity).toBeNull();
    expect(deps.vault.token()).toBeNull();
    expect(account.guard()).toMatchObject({
      ok: false,
      error: { code: "license_required" },
    });
  });

  it("keeps the cached licence when the platform is merely unreachable", async () => {
    const { account, deps, platform } = harness({ build: "production" });
    const { report } = progressOf();

    await account.signIn(report);

    platform.me = () =>
      Promise.resolve({
        ok: false,
        error: { code: "offline", message: "refusal.platform.silent" },
      });

    const refreshed = await account.refresh();

    expect(refreshed.usage).toMatchObject({ status: "granted" });
    expect(deps.vault.token()).toBe(FAKE_TOKEN);
  });

  it("refuses a suspended organization at once", async () => {
    const { account } = harness({
      build: "production",
      identity: { ...IDENTITY, license: "suspended" },
    });
    const { report } = progressOf();

    await account.signIn(report);

    expect(account.state().usage).toMatchObject({ status: "suspended" });
    expect(account.guard()).toMatchObject({
      ok: false,
      error: { code: "server_suspended" },
    });
  });

  it("tells an organization beyond its free servers from one the platform suspends", async () => {
    const { account } = harness({
      build: "production",
      identity: {
        ...IDENTITY,
        license: "suspended",
        servers: OVER_FREE_SERVERS,
      },
    });
    const { report } = progressOf();

    await account.signIn(report);

    expect(account.state().usage).toEqual({
      consoleUrl: "https://app.pupitre.test/dashboard",
      servers: OVER_FREE_SERVERS,
      status: "unlicensed",
    });
    expect(account.guard()).toMatchObject({
      ok: false,
      error: {
        code: "license_required",
        phrase: {
          id: "refusal.account.unlicensed",
          values: { free: 3, support: "support@pupitre.studio", used: 4 },
        },
      },
    });
  });

  it("refuses a production build without an account, with the link to the console", () => {
    const { account } = harness({ build: "production" });

    expect(account.state().usage).toEqual({
      consoleUrl: "https://app.pupitre.test/dashboard",
      status: "absent",
    });
    expect(account.guard()).toMatchObject({
      ok: false,
      error: {
        code: "license_required",
        phrase: {
          id: "refusal.account.required",
          values: { console: "https://app.pupitre.test/dashboard" },
        },
      },
    });
  });

  it("lets a development build work without an account", () => {
    const { account } = harness();

    expect(account.state().usage).toMatchObject({
      source: "development",
      status: "granted",
    });
    expect(account.guard().ok).toBe(true);
  });

  it("carries in its state the refusal the guard opposes to channels", async () => {
    let clock = Date.parse("2026-09-04T10:00:00.000Z");
    const { account } = harness({ build: "production", now: () => clock });
    const { report } = progressOf();

    const first = account.guard();

    expect(account.state().refusal).toEqual(first.ok ? null : first.error);
    expect(account.state().refusal).toMatchObject({
      code: "license_required",
    });

    await account.signIn(report);

    expect(account.state().refusal).toBeNull();

    clock += TOLERANCE_MS + DAY_MS;

    const refused = account.guard();

    expect(refused.ok).toBe(false);
    expect(account.state().refusal).toEqual(refused.ok ? null : refused.error);
    expect(account.state().refusal?.phrase?.values?.console).toBe(
      "https://app.pupitre.test/dashboard"
    );
  });

  it("carries a suspended organization's refusal as the guard states it", async () => {
    const { account } = harness({
      build: "production",
      identity: { ...IDENTITY, license: "suspended" },
    });
    const { report } = progressOf();

    await account.signIn(report);

    const refused = account.guard();

    expect(account.state().refusal).toEqual(refused.ok ? null : refused.error);
    expect(account.state().refusal).toMatchObject({
      code: "server_suspended",
    });
  });
});

describe("enrolment", () => {
  it("sends the device, the address and the probed architecture", async () => {
    const { account, platform } = harness();
    const { report } = progressOf();

    await account.signIn(report);

    const enrolled = await account.enroll({
      device_id: account.state().device?.id ?? "",
      fingerprint: "SHA256:host",
      host: "vps.test",
      port: 2222,
      probe: { arch: "arm64" },
      ssh_user: "root",
    });

    expect(platform.enrolled[0]).toMatchObject({
      device_id: "device-1",
      fingerprint: "SHA256:host",
      host: "vps.test",
      port: 2222,
      probe: { arch: "arm64" },
      ssh_user: "root",
    });
    expect(enrolled).toMatchObject({
      ok: true,
      result: { serverId: "srv-platform-1" },
    });
  });

  it("keeps the enrolment token on the main process side, once", async () => {
    const { account } = harness();
    const { report } = progressOf();

    await account.signIn(report);
    await account.enroll({
      device_id: "device-1",
      host: "vps.test",
      probe: { arch: "amd64" },
    });

    expect(account.takeEnrollmentToken("srv-platform-1")).toBe("enrol-secret");
    expect(account.takeEnrollmentToken("srv-platform-1")).toBeNull();
  });
  it("refuses enrolment without a session, even on a development build", async () => {
    const { account, platform } = harness({
      build: "development" as BuildKind,
    });

    expect(account.state().usage.status).toBe("granted");

    const enrolled = await account.enroll({
      device_id: "device-1",
      host: "vps.test",
      probe: { arch: "amd64" },
    });

    expect(enrolled).toEqual({
      ok: false,
      error: {
        code: "signed_out",
        message: "refusal.account.signedOut",
        phrase: { id: "refusal.account.signedOut" },
      },
    });
    expect(platform.enrolled).toEqual([]);
  });
});

describe("deleting a server on the platform", () => {
  it("asks for both steps: revoke, then erase the row", async () => {
    const { account, platform } = harness();
    const { report } = progressOf();

    await account.signIn(report);

    const forgotten = await account.forgetServer("srv-platform-1");

    expect(forgotten).toEqual({ ok: true, result: null });
    expect(platform.deletions).toEqual(["srv-platform-1", "srv-platform-1"]);
  });

  it("erases nothing more when the platform refuses the first step", async () => {
    const { account, platform } = harness();

    const forgotten = await account.forgetServer("srv-platform-1");

    expect(forgotten).toMatchObject({ ok: false });
    expect(platform.deletions).toEqual([]);
  });
});

describe("this device's active organization", () => {
  it("switches, and the cached identity follows the new one's role", async () => {
    const { account, platform } = harness({
      identity: {
        ...IDENTITY,
        organizations: [
          { id: "org-1", name: "Ada", role: "owner", slug: "ada" },
          { id: "org-2", name: "Fonderie", role: "member", slug: "fonderie" },
        ],
      },
    });

    await account.signIn(() => undefined);

    const state = await account.switchOrganization("org-2");

    expect(platform.switched).toEqual(["org-2"]);
    expect(state.identity?.organization?.id).toBe("org-2");
    expect(state.identity?.role).toBe("member");
  });

  it("asks for nothing without a session", async () => {
    const { account, platform } = harness();

    await account.switchOrganization("org-2");

    expect(platform.switched).toEqual([]);
  });
});

describe("the account's devices", () => {
  it("lists what the platform holds, and revokes another device", async () => {
    const other = { ...DEVICE, id: "device-2", name: "Vieux portable" };
    const { account, platform } = harness({ devices: [DEVICE, other] });

    await account.signIn(() => undefined);

    const listed = await account.devices();

    expect(listed).toMatchObject({ ok: true });
    expect(listed.ok && listed.result.map((device) => device.id)).toEqual([
      "device-1",
      "device-2",
    ]);

    const revoked = await account.revokeDevice("device-2");
    const after = await account.devices();

    expect(revoked).toEqual({ ok: true, result: null });
    expect(platform.revokedDevices).toEqual(["device-2"]);
    expect(after.ok && after.result.map((device) => device.id)).toEqual([
      "device-1",
    ]);
  });

  it("refuses that this computer revokes itself", async () => {
    const { account, platform } = harness({ devices: [DEVICE] });

    await account.signIn(() => undefined);

    const answer = await account.revokeDevice(DEVICE.id);

    expect(answer).toMatchObject({
      ok: false,
      error: { phrase: { id: "refusal.device.self" } },
    });
    expect(platform.revokedDevices).toEqual([]);
  });

  it("asks for nothing without a session", async () => {
    const { account } = harness({ devices: [DEVICE] });

    const listed = await account.devices();

    expect(listed).toMatchObject({ ok: false, error: { code: "signed_out" } });
  });
});
