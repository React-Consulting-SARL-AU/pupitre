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

describe("la connexion", () => {
  it("affiche le code, ouvre le navigateur et attend l'approbation", async () => {
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

  it("enregistre la clé publique de l'appareil, et une seule fois", async () => {
    const { account, platform } = harness();
    const { report } = progressOf();

    await account.signIn(report);
    await account.signIn(report);

    expect(platform.added).toEqual([{ name: "MacBook", publicKey: FAKE_KEY }]);
    expect(account.state().device?.publicKey).toBe(FAKE_KEY);
  });

  it("reprend l'appareil que la plateforme connaît déjà", async () => {
    const { account, platform } = harness({ devices: [DEVICE] });
    const { report } = progressOf();

    await account.signIn(report);

    expect(platform.added).toEqual([]);
    expect(account.state().device?.id).toBe(DEVICE.id);
  });

  it("dit le refus du navigateur avec son remède", async () => {
    const { account } = harness({ polls: ["denied"] });
    const { report } = progressOf();

    const answer = await account.signIn(report);

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "denied", fix: expect.stringContaining("code affiché") },
    });
  });

  it("dit l'expiration du code", async () => {
    const { account } = harness({ polls: ["expired"] });
    const { report } = progressOf();

    expect(await account.signIn(report)).toMatchObject({
      ok: false,
      error: { code: "expired" },
    });
  });
});

describe("le jeton", () => {
  it("ne traverse ni le disque, ni un journal, ni ce que le renderer reçoit", async () => {
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

  it("part avec la déconnexion", async () => {
    const { account, dir } = harness();
    const { report } = progressOf();

    await account.signIn(report);

    const after = account.signOut();

    expect(after.identity).toBeNull();
    expect(after.device).toBeNull();
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("le droit d'usage", () => {
  it("tient sept jours sans la plateforme, et pas huit", async () => {
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
      error: { code: "entitlement_required" },
    });
  });

  it("refuse tout de suite une organisation suspendue", async () => {
    const { account } = harness({
      build: "production",
      identity: { ...IDENTITY, entitlement: "suspended" },
    });
    const { report } = progressOf();

    await account.signIn(report);

    expect(account.guard()).toMatchObject({
      ok: false,
      error: { code: "server_suspended" },
    });
  });

  it("refuse un build de production sans compte, avec le lien vers la console", () => {
    const { account } = harness({ build: "production" });

    expect(account.state().usage).toEqual({
      consoleUrl: "https://app.pupitre.test/dashboard",
      status: "absent",
    });
    expect(account.guard()).toMatchObject({
      ok: false,
      error: {
        code: "entitlement_required",
        fix: expect.stringContaining("https://app.pupitre.test/dashboard"),
      },
    });
  });

  it("laisse travailler un build de développement sans compte", () => {
    const { account } = harness();

    expect(account.state().usage).toMatchObject({
      source: "development",
      status: "granted",
    });
    expect(account.guard().ok).toBe(true);
  });

  /**
   * L'écran de compte n'écrit pas son propre refus : il rend celui du garde,
   * message et remède compris, pour qu'un canal refusé et l'écran disent la
   * même chose.
   */
  it("porte dans son état le refus que le garde oppose aux canaux", async () => {
    let clock = Date.parse("2026-09-04T10:00:00.000Z");
    const { account } = harness({ build: "production", now: () => clock });
    const { report } = progressOf();

    const first = account.guard();

    expect(account.state().refusal).toEqual(first.ok ? null : first.error);
    expect(account.state().refusal).toMatchObject({
      code: "entitlement_required",
    });

    await account.signIn(report);

    expect(account.state().refusal).toBeNull();

    clock += TOLERANCE_MS + DAY_MS;

    const refused = account.guard();

    expect(refused.ok).toBe(false);
    expect(account.state().refusal).toEqual(refused.ok ? null : refused.error);
    expect(account.state().refusal?.fix).toContain(
      "https://app.pupitre.test/dashboard"
    );
  });

  it("porte le refus d'une organisation suspendue tel que le garde le dit", async () => {
    const { account } = harness({
      build: "production",
      identity: { ...IDENTITY, entitlement: "suspended" },
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

describe("l'enrôlement", () => {
  it("envoie l'appareil, l'adresse et l'architecture sondée", async () => {
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

  it("garde le jeton d'enrôlement du côté du processus principal, une fois", async () => {
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
});
