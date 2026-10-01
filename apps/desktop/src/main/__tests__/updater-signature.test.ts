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

describe("the signature of an app update", () => {
  const key = releaseKey();
  const sha256 = digest("an AppImage, allegedly");

  it("holds for the artefact the release key signed", () => {
    expect(checkAppArtefact(signed(key, sha256), key.publicKey)).toBe(true);
  });

  it("holds on all three systems, the macOS archive included", () => {
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

  it("fails for bytes that changed", () => {
    expect(
      checkAppArtefact(
        { ...signed(key, sha256), sha256: digest("an AppImage, altered") },
        key.publicKey
      )
    ).toBe(false);
  });

  it("fails for another version, another system or another chip", () => {
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

  it("fails for another key, and for a file that does not name its chip", () => {
    const other = releaseKey();

    expect(checkAppArtefact(signed(key, sha256), other.publicKey)).toBe(false);
    expect(
      checkAppArtefact(
        signed(key, sha256, { file: "Pupitre.AppImage" }),
        key.publicKey
      )
    ).toBe(false);
  });

  it("looks for the signature next to the artefact, whatever the feed", () => {
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

describe("installing a verified update", () => {
  const verified: VerifiedUpdate = {
    file: "/cache/pending/Pupitre-1.2.3-x64.AppImage",
    sha256: digest("the verified bytes"),
    version: VERSION,
  };
  const onDisk = (content: string | null) => () =>
    content === null ? null : digest(content);

  it("installs the verified file, exactly as it was verified", () => {
    expect(
      installable(verified, verified.file, onDisk("the verified bytes"))
    ).toBe(true);
  });

  it("refuses without verification, or without a pending file", () => {
    expect(installable(null, verified.file, onDisk("the verified bytes"))).toBe(
      false
    );
    expect(installable(verified, null, onDisk("the verified bytes"))).toBe(
      false
    );
  });

  it("refuses a file other than the one that was verified", () => {
    expect(
      installable(
        verified,
        "/cache/pending/Pupitre-1.2.4-x64.AppImage",
        onDisk("the verified bytes")
      )
    ).toBe(false);
  });

  it("refuses a file that changed since, or that can no longer be read", () => {
    expect(installable(verified, verified.file, onDisk("other bytes"))).toBe(
      false
    );
    expect(installable(verified, verified.file, onDisk(null))).toBe(false);
  });
});
