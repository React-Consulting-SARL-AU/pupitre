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
  createOrganizationWithMembers,
  createServer,
} from "@pupitre/api/testing/factories";
import { createTestSession, setTestSession } from "@pupitre/auth/testing";
import type { SignInProgress } from "@shared/account";
import type { FleetServer } from "@shared/servers";
import { createAccount } from "../account-run";
import { createTokenVault } from "../account-vault";
import { mergeFleet } from "../fleet-run";
import { createPlatformClient } from "../platform-client";
import { renderSshConfig, type SshPaths, sshArgs } from "../ssh-config";
import { memorySealer } from "./fixtures/fake-platform";

/**
 * The invited member, against the platform's own API booted on PGlite.
 *
 * This is the acceptance criterion of APP-15, played end to end: an admin is
 * given a server, assigns it to someone else, and that someone opens it from
 * this computer without ever typing an address or making a key. Nothing here
 * reaches a deployed service — `@pupitre/api/testing` is the Elysia app the
 * console mounts.
 */

const DEVICE_PUBLIC_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJggxfUKhpYOKRen6E6lpoh//viuSJtxOQ8hVlFZb+/t ada@macbook";

const MINUTE_MS = 60_000;

const HOST = "203.0.113.10";

const dirs: string[] = [];

function pathsIn(dir: string): SshPaths {
  return {
    configPath: join(dir, "ssh", "config"),
    dir: join(dir, "ssh"),
    keysDir: join(dir, "keys"),
    knownHostsPath: join(dir, "ssh", "known_hosts"),
  };
}

async function rewindPolls(): Promise<void> {
  const { prisma } = await bootApiTestServer();

  await prisma.deviceCode.updateMany({
    data: { lastPolledAt: new Date(Date.now() - MINUTE_MS) },
  });
}

/** The invited member's own browser, signed into the console. */
async function browserOf(userId: string) {
  const { prisma, fetch } = await bootApiTestServer();
  const { token } = await createTestSession(prisma, { userId });
  const headers = setTestSession(new Headers(), { token });

  return async (userCode: string) => {
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
  };
}

/** This computer, holding one device key and no server at all. */
async function laptopOf(userId: string) {
  const { fetch } = await bootApiTestServer();
  const approve = await browserOf(userId);
  const dir = mkdtempSync(join(tmpdir(), "pupitre-fleet-"));

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
        await approve(code);
      }

      await rewindPolls();
    },
  });

  const report = (progress: SignInProgress) => {
    if (progress.kind === "code") {
      code = progress.userCode;
    }
  };

  await account.signIn(report);

  return { account, dir, paths: pathsIn(dir) };
}

/** An organization whose admin has a server, and a member it is given to. */
async function assignedServer(host: string | null = HOST) {
  const { prisma } = await bootApiTestServer();
  const { organization, members } = await createOrganizationWithMembers({
    roles: ["admin", "member"],
  });
  const invited = members[1];
  const { server } = await createServer({
    assignedUserId: invited.user.id,
    name: "vps-atelier",
    organizationId: organization.id,
    status: "active",
  });

  await prisma.server.update({
    data: { host, hostFingerprint: "SHA256:atelier", port: 22, sshUser: "dev" },
    where: { id: server.id },
  });

  return { invited, organization, server };
}

async function fleetOf(
  account: Awaited<ReturnType<typeof laptopOf>>["account"]
): Promise<FleetServer[]> {
  const listed = await account.fleet();

  if (!listed.ok) {
    throw new Error(listed.error.message);
  }

  return listed.result;
}

describe("le membre invité, contre l'API de la plateforme", () => {
  beforeAll(async () => {
    await bootApiTestServer();
  });

  beforeEach(async () => {
    await resetDb();

    for (const dir of dirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("voit son serveur attribué et s'y connecte sans saisir ni adresse ni clé", async () => {
    const { invited, server } = await assignedServer();
    const { account, paths } = await laptopOf(invited.user.id);

    const granted = await fleetOf(account);

    expect(granted).toEqual([
      {
        host: HOST,
        hostFingerprint: "SHA256:atelier",
        id: server.id,
        keyReady: true,
        name: "vps-atelier",
        port: 22,
        status: "active",
        user: "dev",
      },
    ]);

    const merged = mergeFleet({
      active: null,
      deviceKeyPath: join(paths.keysDir, "device"),
      granted,
      local: [],
    });

    expect(merged.adopted).toEqual([server.id]);
    expect(merged.config.active).toBe(server.id);

    const [adopted] = merged.config.servers;
    const written = renderSshConfig([adopted], paths, "darwin");

    expect(sshArgs(adopted, paths)).toEqual([
      "-F",
      paths.configPath,
      `pupitre-${server.id}`,
    ]);
    expect(written).toContain(`HostName ${HOST}`);
    expect(written).toContain("User dev");
    expect(written).toContain(`IdentityFile ${join(paths.keysDir, "device")}`);
    expect(adopted.keyPath).toBe(join(paths.keysDir, "device"));
  });

  it("ne voit pas les serveurs attribués à quelqu'un d'autre", async () => {
    const { invited, organization } = await assignedServer();

    await createServer({
      assignedUserId: null,
      name: "vps-de-personne",
      organizationId: organization.id,
      status: "active",
    });

    const granted = await fleetOf(
      await laptopOf(invited.user.id).then((l) => l.account)
    );

    expect(granted.map((one) => one.name)).toEqual(["vps-atelier"]);
  });

  it("attend que la plateforme ait une clé de ce compte", async () => {
    const { prisma } = await bootApiTestServer();
    const { invited } = await assignedServer();
    const { account } = await laptopOf(invited.user.id);

    await prisma.device.deleteMany({});

    expect((await fleetOf(account))[0]).toMatchObject({ keyReady: false });
  });

  it("voit la révocation : le serveur reste dans la liste, marqué retiré", async () => {
    const { prisma } = await bootApiTestServer();
    const { invited, server } = await assignedServer();
    const { account, paths } = await laptopOf(invited.user.id);

    const merged = mergeFleet({
      active: null,
      deviceKeyPath: join(paths.keysDir, "device"),
      granted: await fleetOf(account),
      local: [],
    });

    await prisma.server.update({
      data: { assignedUserId: null },
      where: { id: server.id },
    });

    const after = mergeFleet({
      active: merged.config.active,
      deviceKeyPath: join(paths.keysDir, "device"),
      granted: await fleetOf(account),
      local: merged.config.servers,
    });

    expect(after.withdrawn).toEqual([server.id]);
    expect(after.config.servers).toHaveLength(1);
    expect(after.config.servers[0].grant).toMatchObject({ listed: false });
  });

  it("laisse dehors un serveur dont la plateforme ignore l'adresse", async () => {
    const { invited } = await assignedServer(null);
    const { account, paths } = await laptopOf(invited.user.id);

    const merged = mergeFleet({
      active: null,
      deviceKeyPath: join(paths.keysDir, "device"),
      granted: await fleetOf(account),
      local: [],
    });

    expect(merged.config.servers).toEqual([]);
  });
});
