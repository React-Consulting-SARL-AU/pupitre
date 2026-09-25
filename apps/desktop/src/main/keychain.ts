import type { SafeStorage } from "electron";
import type { Sealer } from "./account-vault";

/** `basic_text` seals with a key written into every copy of Chromium; `unknown` has chosen nothing yet. */
const UNSAFE_BACKENDS = new Set(["basic_text", "unknown"]);

type Storage = Pick<
  SafeStorage,
  | "decryptString"
  | "encryptString"
  | "getSelectedStorageBackend"
  | "isEncryptionAvailable"
>;

/**
 * The one door to the system keychain, for the platform's token and the
 * connections' alike.
 *
 * macOS and Windows always have a keychain when encryption answers. Linux
 * answers too without GNOME Keyring or KWallet, over `basic_text`; that counts
 * as no keychain, and a secret then lives until the app quits.
 */
export function keychainSealer(
  storage: Storage,
  platform: NodeJS.Platform
): Sealer {
  return {
    available: () =>
      storage.isEncryptionAvailable() &&
      (platform !== "linux" ||
        !UNSAFE_BACKENDS.has(storage.getSelectedStorageBackend())),
    decrypt: (value) => storage.decryptString(value),
    encrypt: (value) => storage.encryptString(value),
  };
}
