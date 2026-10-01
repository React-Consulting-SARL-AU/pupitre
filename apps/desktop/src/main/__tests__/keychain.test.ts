import { describe, expect, it } from "bun:test";
import { keychainSealer } from "../keychain";

type Backend = ReturnType<
  Parameters<typeof keychainSealer>[0]["getSelectedStorageBackend"]
>;

function storage(encryption: boolean, backend: Backend) {
  return {
    decryptString: (value: Buffer) => value.toString("utf8"),
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    getSelectedStorageBackend: () => backend,
    isEncryptionAvailable: () => encryption,
  };
}

describe("the keychain that holds the secrets", () => {
  it("serves on macOS and Windows as soon as encryption responds", () => {
    expect(keychainSealer(storage(true, "unknown"), "darwin").available()).toBe(
      true
    );
    expect(keychainSealer(storage(true, "unknown"), "win32").available()).toBe(
      true
    );
    expect(
      keychainSealer(storage(false, "unknown"), "darwin").available()
    ).toBe(false);
  });

  it("serves on Linux behind GNOME Keyring or KWallet", () => {
    expect(
      keychainSealer(storage(true, "gnome_libsecret"), "linux").available()
    ).toBe(true);
    expect(keychainSealer(storage(true, "kwallet6"), "linux").available()).toBe(
      true
    );
  });

  it("does not count basic_text's hardcoded key as a keychain", () => {
    expect(
      keychainSealer(storage(true, "basic_text"), "linux").available()
    ).toBe(false);
    expect(keychainSealer(storage(true, "unknown"), "linux").available()).toBe(
      false
    );
    expect(
      keychainSealer(storage(false, "gnome_libsecret"), "linux").available()
    ).toBe(false);
  });

  it("encrypts and decrypts through the system storage", () => {
    const sealer = keychainSealer(storage(true, "gnome_libsecret"), "linux");

    expect(sealer.decrypt(sealer.encrypt("jeton"))).toBe("jeton");
  });
});
