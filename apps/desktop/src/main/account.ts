import { hostname } from "node:os";
import type {
  AccountDevice,
  AccountResponse,
  AccountState,
  SignInProgress,
} from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import { app, safeStorage } from "electron";
import { type Account, createAccount } from "./account-run";
import { createTokenVault } from "./account-vault";
import { asAgentError } from "./enrollment-run";
import { openOutside } from "./foreground";
import { handle } from "./ipc";
import { isString, shape } from "./ipc-guard";
import { keychainSealer } from "./keychain";
import { generateKey, keyPaths, readPublicKey } from "./keys";
import { createPlatformClient } from "./platform-client";
import { buildKind, platformUrl } from "./platform-url";
import { refuseWith } from "./refusal";
import { relayTo } from "./relay";
import { paths } from "./servers";

const DEVICE_KEY_ID = "device";

/** Made once and never leaving this computer: only the public half goes up to the platform. */
export async function deviceKey(): Promise<string> {
  const dir = paths().keysDir;
  const existing = readPublicKey(dir, DEVICE_KEY_ID);

  if (existing) {
    return existing;
  }

  return (await generateKey(dir, DEVICE_KEY_ID)).publicKey;
}

/** A granted server needs no key of its own: the platform pushed this key's public half to it. */
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
  handle("account:state", shape(), (): AccountState => account.state());

  handle(
    "account:refresh",
    shape(),
    (): Promise<AccountState> => account.refresh()
  );

  handle(
    "account:organization",
    shape(isString),
    (_event, organizationId): Promise<AccountState> =>
      organizationId.length > 0
        ? account.switchOrganization(organizationId)
        : Promise.resolve(account.state())
  );

  handle("account:sign-out", shape(), (): AccountState => account.signOut());

  handle(
    "account:devices",
    shape(),
    async (): Promise<AgentResponse<AccountDevice[]>> => {
      const answer = await account.devices();

      return answer.ok
        ? answer
        : { error: asAgentError(answer.error), ok: false };
    }
  );

  handle(
    "account:device-revoke",
    shape(isString),
    async (_event, deviceId): Promise<AgentResponse<null>> => {
      if (deviceId.length === 0) {
        return refuseWith("bad_request", "refusal.device.unknown");
      }

      const answer = await account.revokeDevice(deviceId);

      return answer.ok
        ? answer
        : { error: asAgentError(answer.error), ok: false };
    }
  );

  handle(
    "account:sign-in",
    shape(isString),
    (event, token): Promise<AccountResponse<AccountState>> =>
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
