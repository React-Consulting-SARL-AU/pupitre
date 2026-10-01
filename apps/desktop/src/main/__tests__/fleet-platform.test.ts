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
import {
  appSshPaths,
  renderSshConfig,
  type SshPaths,
  sshArgs,
} from "../ssh-config";
import { memorySealer } from "./fixtures/fake-platform";

const DEVICE_PUBLIC_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJggxfUKhpYOKRen6E6lpoh//viuSJtxOQ8hVlFZb+/t ada@macbook";

const MINUTE_MS = 60_000;

const HOST = "203.0.113.10";

const dirs: string[] = [];

function pathsIn(dir: string): SshPaths {
  return appSshPaths(dir, join(dir, "home"));
}

async function rewindPolls(): Promise<void> {
  const { prisma } = await bootApiTestServer();

  await prisma.deviceCode.updateMany({
    data: { lastPolledAt: new Date(Date.now() - MINUTE_MS) },
  });
}

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

describe("the invited member, against the platform API", () => {
  beforeAll(async () => {
    await bootApiTestServer();
  });

  beforeEach(async () => {
    await resetDb();

    for (const dir of dirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("sees the assigned server and connects to it without typing an address or a key", async () => {
    const { invited, organization, server } = await assignedServer();
    const { account, paths } = await laptopOf(invited.user.id);

    const granted = await fleetOf(account);

    expect(granted).toEqual([
      {
        host: HOST,
        hostFingerprint: "SHA256:atelier",
        id: server.id,
        keyReady: true,
        name: "vps-atelier",
        organization: { id: organization.id, name: organization.name },
        port: 22,
        status: "active",
        user: "dev",
      },
    ]);

    const merged = mergeFleet({
      active: null,
      deviceKeyPath: join(paths.keysDir, "device"),
      dismissed: [],
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

  it("does not see servers assigned to someone else", async () => {
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

  it("waits until the platform has a key for this account", async () => {
    const { prisma } = await bootApiTestServer();
    const { invited } = await assignedServer();
    const { account } = await laptopOf(invited.user.id);

    await prisma.device.deleteMany({});

    expect((await fleetOf(account))[0]).toMatchObject({ keyReady: false });
  });

  it("sees the revocation: the server leaves the list the app had filled", async () => {
    const { prisma } = await bootApiTestServer();
    const { invited, server } = await assignedServer();
    const { account, paths } = await laptopOf(invited.user.id);

    const merged = mergeFleet({
      active: null,
      deviceKeyPath: join(paths.keysDir, "device"),
      dismissed: [],
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
      dismissed: [],
      granted: await fleetOf(account),
      local: merged.config.servers,
    });

    expect(after.released).toEqual([server.id]);
    expect(after.config.servers).toEqual([]);
  });

  it("leaves out a server whose address the platform does not know", async () => {
    const { invited } = await assignedServer(null);
    const { account, paths } = await laptopOf(invited.user.id);

    const merged = mergeFleet({
      active: null,
      deviceKeyPath: join(paths.keysDir, "device"),
      dismissed: [],
      granted: await fleetOf(account),
      local: [],
    });

    expect(merged.config.servers).toEqual([]);
  });
});
