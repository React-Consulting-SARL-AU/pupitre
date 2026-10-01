import { describe, expect, it } from "bun:test";
import {
  absoluteFeed,
  artefactOf,
  downloadUrl,
  installerOf,
  isBlockmap,
  isCompanion,
  isFeed,
  isUpdateArchive,
  objectKey,
  signedAppMessage,
  signedArtefactOf,
} from "../../../scripts/release-artefacts";

const BASE = "https://dl.pupitre.studio";

describe("artefactOf", () => {
  it("reads the system, architecture and format from the file name", () => {
    expect(artefactOf("Pupitre-1.4.0-arm64.dmg")).toEqual({
      arch: "arm64",
      file: "Pupitre-1.4.0-arm64.dmg",
      format: "dmg",
      os: "macos",
    });
    expect(artefactOf("Pupitre-Setup-1.4.0-x64.exe")).toMatchObject({
      arch: "x64",
      format: "exe",
      os: "windows",
    });
    expect(artefactOf("Pupitre-1.4.0-arm64.AppImage")).toMatchObject({
      format: "AppImage",
      os: "linux",
    });
  });

  it("translates the Debian architecture a .deb carries", () => {
    expect(artefactOf("pupitre_1.4.0_amd64.deb")).toMatchObject({
      arch: "x64",
      format: "deb",
      os: "linux",
    });
  });

  it("translates the architecture electron-builder gives an AppImage", () => {
    expect(artefactOf("Pupitre-1.4.0-x86_64.AppImage")).toMatchObject({
      arch: "x64",
      format: "AppImage",
      os: "linux",
    });
  });

  it("publishes neither a feed, nor a block map, nor the update archive, nor an unrecognised name", () => {
    expect(artefactOf("latest-mac.yml")).toBeNull();
    expect(artefactOf("Pupitre-1.4.0-arm64.dmg.blockmap")).toBeNull();
    expect(artefactOf("Pupitre-1.4.0-arm64.zip")).toBeNull();
    expect(artefactOf("Pupitre-1.4.0.dmg")).toBeNull();
    expect(artefactOf("../etc/passwd.dmg")).toBeNull();
  });

  it("names feeds and block maps for what they are", () => {
    expect(isFeed("latest.yml")).toBe(true);
    expect(isFeed("Pupitre-1.4.0-x64.dmg")).toBe(false);
    expect(isBlockmap("Pupitre-1.4.0-x64.dmg.blockmap")).toBe(true);
  });

  it("ties to its installer what the app downloads alongside it", () => {
    expect(installerOf("Pupitre-1.4.0-x64.dmg")).toBe("Pupitre-1.4.0-x64.dmg");
    expect(installerOf("Pupitre-1.4.0-x64.dmg.blockmap")).toBe(
      "Pupitre-1.4.0-x64.dmg"
    );
    expect(installerOf("Pupitre-1.4.0-arm64.zip")).toBe(
      "Pupitre-1.4.0-arm64.dmg"
    );
    expect(installerOf("Pupitre-1.4.0-arm64.zip.blockmap")).toBe(
      "Pupitre-1.4.0-arm64.dmg"
    );
    expect(isCompanion("Pupitre-1.4.0-arm64.zip")).toBe(true);
    expect(isCompanion("Pupitre-1.4.0-x64.dmg.blockmap")).toBe(true);
    expect(isCompanion("Pupitre-1.4.0-x64.dmg")).toBe(false);
    expect(isCompanion("latest-mac.yml")).toBe(false);
    expect(isCompanion("notes.zip")).toBe(false);
  });

  it("signs what the updater downloads, under its installer's system and chip", () => {
    expect(signedArtefactOf("Pupitre-1.4.0-arm64.zip")).toMatchObject({
      arch: "arm64",
      os: "macos",
    });
    expect(signedArtefactOf("Pupitre-Setup-1.4.0-x64.exe")).toMatchObject({
      arch: "x64",
      os: "windows",
    });
    expect(signedArtefactOf("Pupitre-1.4.0-x64.AppImage")).toMatchObject({
      arch: "x64",
      os: "linux",
    });
    expect(isUpdateArchive("Pupitre-1.4.0-arm64.zip")).toBe(true);
    expect(isUpdateArchive("Pupitre-1.4.0-arm64.dmg")).toBe(false);
    expect(isUpdateArchive("notes.zip")).toBe(false);
    expect(signedArtefactOf("Pupitre-1.4.0-arm64.zip.blockmap")).toBeNull();
    expect(signedArtefactOf("latest-mac.yml")).toBeNull();
    expect(signedArtefactOf("notes.zip")).toBeNull();
  });
});

describe("the locations", () => {
  it("files a version in its own folder", () => {
    expect(objectKey("1.4.0", "Pupitre-1.4.0-x64.dmg")).toBe(
      "app/1.4.0/Pupitre-1.4.0-x64.dmg"
    );
    expect(downloadUrl(`${BASE}/`, "1.4.0", "a.dmg")).toBe(
      `${BASE}/app/1.4.0/a.dmg`
    );
  });
});

describe("signedAppMessage", () => {
  it("differs from an agent signature, line by line", () => {
    expect(signedAppMessage("1.4.0", "macos", "arm64", "abc").toString()).toBe(
      "pupitre-app\n1.4.0\nmacos\narm64\nabc\n"
    );
  });
});

describe("absoluteFeed", () => {
  it("sends a channel's feed to fetch the files of their version", () => {
    const feed = [
      "version: 1.4.0",
      "files:",
      "  - url: Pupitre-1.4.0-arm64.dmg",
      "    sha512: abc==",
      "    size: 118000000",
      "path: Pupitre-1.4.0-arm64.dmg",
      "releaseDate: '2026-09-07T00:00:00.000Z'",
    ].join("\n");

    const rewritten = absoluteFeed(feed, BASE, "1.4.0");

    expect(rewritten).toContain(
      `- url: ${BASE}/app/1.4.0/Pupitre-1.4.0-arm64.dmg`
    );
    expect(rewritten).toContain(
      `path: ${BASE}/app/1.4.0/Pupitre-1.4.0-arm64.dmg`
    );
    expect(rewritten).toContain("sha512: abc==");
    expect(rewritten).toContain("size: 118000000");
  });

  it("leaves an already absolute URL as is", () => {
    const feed = `  - url: ${BASE}/app/1.4.0/Pupitre.dmg`;

    expect(absoluteFeed(feed, BASE, "1.4.0")).toBe(feed);
  });
});
