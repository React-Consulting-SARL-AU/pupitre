import { hostname } from "node:os";
import type {
  AccountDevice,
  AccountResponse,
  AccountState,
  SignInProgress,
} from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import { app, ipcMain, safeStorage } from "electron";
import { type Account, createAccount } from "./account-run";
import { createTokenVault } from "./account-vault";
import { asAgentError } from "./enrollment-run";
import { openOutside } from "./foreground";
import { keychainSealer } from "./keychain";
import { generateKey, keyPaths, readPublicKey } from "./keys";
import { createPlatformClient } from "./platform-client";
import { buildKind, platformUrl } from "./platform-url";
import { refuseWith } from "./refusal";
import { relayTo } from "./relay";
import { paths } from "./servers";

/**
 * The account, wired to this computer.
 *
 * The token goes through `safeStorage`, the device key through the app's own
 * key folder, and the browser through `openOutside`. Everything that can
 * be reasoned about without Electron lives in `account-run.ts`.
 */

const DEVICE_KEY_ID = "device";

/**
 * One ed25519 key for this computer, made once and never leaving it. Only the
 * public half goes up to the platform, which hands it to the agents.
 */
export async function deviceKey(): Promise<string> {
  const dir = paths().keysDir;
  const existing = readPublicKey(dir, DEVICE_KEY_ID);

  if (existing) {
    return existing;
  }

  return (await generateKey(dir, DEVICE_KEY_ID)).publicKey;
}

/**
 * The private half of that key, which a granted server is opened with.
 *
 * The platform pushed its public half to every machine this account may open,
 * so an assigned server needs no key of its own — and this file has never left
 * the folder the app made it in.
 */
export function deviceKeyPath(): string {
  return keyPaths(paths().keysDir, DEVICE_KEY_ID).keyPath;
}

export const account: Account = createAccount({
  build: buildKind(),
  deviceKey,
  deviceName: () => hostname(),
  now: () => Date.now(),
  openUrl: openOutside,
  platform: createPlatformClient({ baseUrl: platformUrl() }),
  vault: createTokenVault({
    dir: app.getPath("userData"),
    sealer: keychainSealer(safeStorage, process.platform),
  }),
  wait: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
});

export function registerAccount(): void {
  ipcMain.handle("account:state", (): AccountState => account.state());

  ipcMain.handle(
    "account:refresh",
    (): Promise<AccountState> => account.refresh()
  );

  ipcMain.handle(
    "account:organization",
    (_event, organizationId: unknown): Promise<AccountState> =>
      typeof organizationId === "string" && organizationId.length > 0
        ? account.switchOrganization(organizationId)
        : Promise.resolve(account.state())
  );

  ipcMain.handle("account:sign-out", (): AccountState => account.signOut());

  ipcMain.handle(
    "account:devices",
    async (): Promise<AgentResponse<AccountDevice[]>> => {
      const answer = await account.devices();

      return answer.ok
        ? answer
        : { error: asAgentError(answer.error), ok: false };
    }
  );

  ipcMain.handle(
    "account:device-revoke",
    async (_event, deviceId: unknown): Promise<AgentResponse<null>> => {
      if (typeof deviceId !== "string" || deviceId.length === 0) {
        return refuseWith("bad_request", "refusal.device.unknown");
      }

      const answer = await account.revokeDevice(deviceId);

      return answer.ok
        ? answer
        : { error: asAgentError(answer.error), ok: false };
    }
  );

  ipcMain.handle(
    "account:sign-in",
    (event, token: unknown): Promise<AccountResponse<AccountState>> =>
      account.signIn(
        relayTo<SignInProgress>(
          event.sender,
          token,
          "account:sign-in-progress",
          "progress"
        )
      )
  );
}
