import { hostname } from "node:os";
import type {
  AccountResponse,
  AccountState,
  SignInProgress,
} from "@shared/account";
import { app, ipcMain, safeStorage, shell } from "electron";
import { type Account, createAccount } from "./account-run";
import { createTokenVault, type Sealer } from "./account-vault";
import { generateKey, readPublicKey } from "./keys";
import { createPlatformClient, DEFAULT_PLATFORM_URL } from "./platform-client";
import { paths } from "./servers";

/**
 * The account, wired to this computer.
 *
 * The token goes through `safeStorage`, the device key through the app's own
 * key folder, and the browser through `shell.openExternal`. Everything that can
 * be reasoned about without Electron lives in `account-run.ts`.
 */

const DEVICE_KEY_ID = "device";

const sealer: Sealer = {
  available: () => safeStorage.isEncryptionAvailable(),
  decrypt: (value) => safeStorage.decryptString(value),
  encrypt: (value) => safeStorage.encryptString(value),
};

export function platformUrl(): string {
  return process.env.PUPITRE_PLATFORM_URL || DEFAULT_PLATFORM_URL;
}

/** The same platform, as the agent reaches it: the API's own base, not the console's. */
export function agentPlatformUrl(): string {
  return new URL("/api/v1", platformUrl()).toString();
}

/**
 * One ed25519 key for this computer, made once and never leaving it. Only the
 * public half goes up to the platform, which hands it to the agents.
 */
async function deviceKey(): Promise<string> {
  const dir = paths().keysDir;
  const existing = readPublicKey(dir, DEVICE_KEY_ID);

  if (existing) {
    return existing;
  }

  return (await generateKey(dir, DEVICE_KEY_ID)).publicKey;
}

export const account: Account = createAccount({
  build: app.isPackaged ? "production" : "development",
  deviceKey,
  deviceName: () => hostname(),
  now: () => Date.now(),
  openUrl: (url) => {
    shell.openExternal(url);
  },
  platform: createPlatformClient({ baseUrl: platformUrl() }),
  vault: createTokenVault({ dir: app.getPath("userData"), sealer }),
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

  ipcMain.handle("account:sign-out", (): AccountState => account.signOut());

  ipcMain.handle(
    "account:sign-in",
    (event, token: unknown): Promise<AccountResponse<AccountState>> => {
      const report = (progress: SignInProgress) => {
        if (typeof token === "string" && !event.sender.isDestroyed()) {
          event.sender.send("account:sign-in-progress", { progress, token });
        }
      };

      return account.signIn(report);
    }
  );
}
