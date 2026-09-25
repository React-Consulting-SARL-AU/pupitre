import { describe, expect, it } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { signedAppMessage } from "../../../scripts/release-artefacts";
import {
  checkAppArtefact,
  type DownloadedArtefact,
  installable,
  signatureUrl,
  type VerifiedUpdate,
} from "../updater-run";

const ED25519_PUBLIC_KEY_BYTES = 32;

/** The public half is exported raw, the form the app embeds. */
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

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function signed(
  key: ReturnType<typeof releaseKey>,
  sha256: string,
  { file = FILE, version = VERSION, os = "linux", arch = "x64" } = {}
): DownloadedArtefact {
  return {
    file,
    sha256,
    signature: `${key.signOf(signedAppMessage(version, os, arch, sha256))}\n`,
    version,
  };
}

describe("la signature d'une mise à jour de l'app", () => {
  const key = releaseKey();
  const sha256 = digest("an AppImage, allegedly");

  it("tient pour l'artefact que la clé de release a signé", () => {
    expect(checkAppArtefact(signed(key, sha256), key.publicKey)).toBe(true);
  });

  it("tient sur les trois systèmes, l'archive macOS comprise", () => {
    const zip = digest("a zip, allegedly");
    const exe = digest("an installer, allegedly");

    expect(
      checkAppArtefact(
        signed(key, zip, {
          arch: "arm64",
          file: "Pupitre-1.2.3-arm64.zip",
          os: "macos",
        }),
        key.publicKey
      )
    ).toBe(true);
    expect(
      checkAppArtefact(
        signed(key, exe, {
          file: "Pupitre-Setup-1.2.3-x64.exe",
          os: "windows",
        }),
        key.publicKey
      )
    ).toBe(true);
  });

  it("tombe pour des octets qui ont changé", () => {
    expect(
      checkAppArtefact(
        { ...signed(key, sha256), sha256: digest("an AppImage, altered") },
        key.publicKey
      )
    ).toBe(false);
  });

  it("tombe pour une autre version, un autre système ou une autre puce", () => {
    expect(
      checkAppArtefact(
        { ...signed(key, sha256), version: "1.2.4" },
        key.publicKey
      )
    ).toBe(false);
    expect(
      checkAppArtefact(signed(key, sha256, { os: "macos" }), key.publicKey)
    ).toBe(false);
    expect(
      checkAppArtefact(
        { ...signed(key, sha256, { arch: "arm64" }), file: FILE },
        key.publicKey
      )
    ).toBe(false);
  });

  it("tombe pour une autre clé, et pour un fichier qui ne dit pas sa puce", () => {
    const other = releaseKey();

    expect(checkAppArtefact(signed(key, sha256), other.publicKey)).toBe(false);
    expect(
      checkAppArtefact(
        signed(key, sha256, { file: "Pupitre.AppImage" }),
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

describe("l'installation d'une mise à jour vérifiée", () => {
  const verified: VerifiedUpdate = {
    file: "/cache/pending/Pupitre-1.2.3-x64.AppImage",
    sha256: digest("the verified bytes"),
    version: VERSION,
  };
  const onDisk = (content: string | null) => () =>
    content === null ? null : digest(content);

  it("installe le fichier vérifié, tel qu'il a été vérifié", () => {
    expect(
      installable(verified, verified.file, onDisk("the verified bytes"))
    ).toBe(true);
  });

  it("refuse sans vérification, ou sans fichier en attente", () => {
    expect(installable(null, verified.file, onDisk("the verified bytes"))).toBe(
      false
    );
    expect(installable(verified, null, onDisk("the verified bytes"))).toBe(
      false
    );
  });

  it("refuse un autre fichier que celui qui a été vérifié", () => {
    expect(
      installable(
        verified,
        "/cache/pending/Pupitre-1.2.4-x64.AppImage",
        onDisk("the verified bytes")
      )
    ).toBe(false);
  });

  it("refuse un fichier qui a changé depuis, ou qui ne se lit plus", () => {
    expect(installable(verified, verified.file, onDisk("other bytes"))).toBe(
      false
    );
    expect(installable(verified, verified.file, onDisk(null))).toBe(false);
  });
});
