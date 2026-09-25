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

describe("le trousseau qui garde les secrets", () => {
  it("sert sous macOS et Windows dès que le chiffrement répond", () => {
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

  it("sert sous Linux derrière GNOME Keyring ou KWallet", () => {
    expect(
      keychainSealer(storage(true, "gnome_libsecret"), "linux").available()
    ).toBe(true);
    expect(keychainSealer(storage(true, "kwallet6"), "linux").available()).toBe(
      true
    );
  });

  it("ne compte pas pour un trousseau la clé écrite en dur de basic_text", () => {
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

  it("chiffre et déchiffre par le stockage du système", () => {
    const sealer = keychainSealer(storage(true, "gnome_libsecret"), "linux");

    expect(sealer.decrypt(sealer.encrypt("jeton"))).toBe("jeton");
  });
});
