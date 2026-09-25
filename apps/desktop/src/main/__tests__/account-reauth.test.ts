import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAccount } from "../account-run";
import { createTokenVault } from "../account-vault";
import { FAKE_KEY, fakePlatform, memorySealer } from "./fixtures/fake-platform";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("un appareil ajouté sur une connexion trop ancienne", () => {
  it("demande de se reconnecter, et ne garde pas la session", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pupitre-reauth-"));

    dirs.push(dir);

    const vault = createTokenVault({ dir, sealer: memorySealer });
    const account = createAccount({
      build: "production",
      deviceKey: () => Promise.resolve(FAKE_KEY),
      deviceName: () => "MacBook",
      now: () => Date.parse("2026-09-25T10:00:00.000Z"),
      openUrl: () => undefined,
      platform: fakePlatform({
        addDeviceRefusal: {
          code: "reauthentication_required",
          message: "Sign in again to add a device.",
        },
      }),
      vault,
      wait: () => Promise.resolve(),
    });

    const answer = await account.signIn(() => undefined);

    expect(answer).toEqual({
      error: {
        code: "reauthentication_required",
        message: "refusal.device.reauthenticate",
        phrase: { id: "refusal.device.reauthenticate" },
      },
      ok: false,
    });
    expect(vault.token()).toBeNull();
  });
});
