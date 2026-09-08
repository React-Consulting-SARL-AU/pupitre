import { hostname } from "node:os";
import type {
  AccountResponse,
  AccountState,
  SignInProgress,
} from "@shared/account";
import { app, ipcMain, safeStorage, shell } from "electron";
import { type Account, createAccount } from "./account-run";
import { createTokenVault, type Sealer } from "./account-vault";
import { generateKey, keyPaths, readPublicKey } from "./keys";
import {
  agentBaseUrl,
  createPlatformClient,
  DEFAULT_PLATFORM_URL,
  LOCAL_PLATFORM_URL,
} from "./platform-client";
import { relayTo } from "./relay";
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

/**
 * Which platform this build talks to.
 *
 * A packaged app knows only the hosted one. A development build talks to the
 * console running beside it, so the whole account — device flow, enrolment,
 * console links — stays on this computer; `PUPITRE_PLATFORM_URL` names another
 * one when it is elsewhere.
 */
export function platformUrl(): string {
  const fallback = app.isPackaged ? DEFAULT_PLATFORM_URL : LOCAL_PLATFORM_URL;

  return process.env.PUPITRE_PLATFORM_URL || fallback;
}

/**
 * The same platform, as the agent reaches it: the API's own base, not the
 * console's — and under a name the server can actually resolve.
 *
 * A development console is served on this computer, which the VPS has no way to
 * reach; what leaves for the server is the tunnel that publishes that same
 * console. `PUPITRE_AGENT_PLATFORM_URL` names another one when the agent has to
 * answer somewhere else than the app does.
 */
export function agentPlatformUrl(): string {
  const base = process.env.PUPITRE_AGENT_PLATFORM_URL || platformUrl();

  return new URL("/api/v1", agentBaseUrl(base)).toString();
}

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

  ipcMain.handle(
    "account:organization",
    (_event, organizationId: unknown): Promise<AccountState> =>
      typeof organizationId === "string" && organizationId.length > 0
        ? account.switchOrganization(organizationId)
        : Promise.resolve(account.state())
  );

  ipcMain.handle("account:sign-out", (): AccountState => account.signOut());

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
