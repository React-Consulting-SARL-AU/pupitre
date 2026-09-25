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

/** Linux encrypts without a keyring over `basic_text`: that counts as none, and secrets last until quit. */
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
