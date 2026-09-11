import { describe, expect, it } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { signedAppMessage } from "../../../scripts/release-artefacts";
import { checkAppArtefact, signatureUrl } from "../updater-run";

const ED25519_PUBLIC_KEY_BYTES = 32;

/** A release key of this test's own: the raw public half, as the app embeds it. */
function releaseKey(): {
  publicKey: string;
  signOf: (message: Buffer) => string;
} {
  const pair = generateKeyPairSync("ed25519");
  const spki = pair.publicKey.export({ format: "der", type: "spki" });

  return {
    publicKey: spki.subarray(-ED25519_PUBLIC_KEY_BYTES).toString("base64"),
    signOf: (message) =>
      sign(null, message, pair.privateKey).toString("base64"),
  };
}

const FILE = "Pupitre-1.2.3-x64.AppImage";
const VERSION = "1.2.3";

function signed(
  key: ReturnType<typeof releaseKey>,
  bytes: Uint8Array,
  { file = FILE, version = VERSION, os = "linux", arch = "x64" } = {}
): { bytes: Uint8Array; file: string; signature: string; version: string } {
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  return {
    bytes,
    file,
    signature: `${key.signOf(signedAppMessage(version, os, arch, sha256))}\n`,
    version,
  };
}

describe("la signature d'une mise à jour Linux", () => {
  const key = releaseKey();
  const bytes = new TextEncoder().encode("an AppImage, allegedly");

  it("tient pour l'artefact que la clé de release a signé", () => {
    expect(checkAppArtefact(signed(key, bytes), key.publicKey)).toBe(true);
  });

  it("tombe pour des octets qui ont changé", () => {
    const download = signed(key, bytes);

    expect(
      checkAppArtefact(
        {
          ...download,
          bytes: new TextEncoder().encode("an AppImage, altered"),
        },
        key.publicKey
      )
    ).toBe(false);
  });

  it("tombe pour une autre version, un autre système ou une autre puce", () => {
    expect(
      checkAppArtefact(
        { ...signed(key, bytes), version: "1.2.4" },
        key.publicKey
      )
    ).toBe(false);
    expect(
      checkAppArtefact(signed(key, bytes, { os: "macos" }), key.publicKey)
    ).toBe(false);
    expect(
      checkAppArtefact(
        { ...signed(key, bytes, { arch: "arm64" }), file: FILE },
        key.publicKey
      )
    ).toBe(false);
  });

  it("tombe pour une autre clé, et pour un fichier qui ne dit pas sa puce", () => {
    const other = releaseKey();

    expect(checkAppArtefact(signed(key, bytes), other.publicKey)).toBe(false);
    expect(
      checkAppArtefact(
        signed(key, bytes, { file: "Pupitre.AppImage" }),
        key.publicKey
      )
    ).toBe(false);
  });

  it("cherche la signature à côté de l'artefact, quel que soit le flux", () => {
    expect(
      signatureUrl(
        "https://dl.pupitre.studio/app/1.2.3/Pupitre-1.2.3-x64.AppImage",
        "https://dl.pupitre.studio/app/stable"
      )
    ).toBe(
      "https://dl.pupitre.studio/app/1.2.3/Pupitre-1.2.3-x64.AppImage.sig"
    );
    expect(
      signatureUrl(
        "Pupitre-1.2.3-x64.AppImage",
        "https://dl.pupitre.studio/app/stable/"
      )
    ).toBe(
      "https://dl.pupitre.studio/app/stable/Pupitre-1.2.3-x64.AppImage.sig"
    );
  });
});
