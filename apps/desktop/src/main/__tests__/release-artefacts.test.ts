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
  it("lit le système, l'architecture et le format dans le nom du fichier", () => {
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

  it("traduit l'architecture Debian que porte un .deb", () => {
    expect(artefactOf("pupitre_1.4.0_amd64.deb")).toMatchObject({
      arch: "x64",
      format: "deb",
      os: "linux",
    });
  });

  it("traduit l'architecture qu'electron-builder donne à une AppImage", () => {
    expect(artefactOf("Pupitre-1.4.0-x86_64.AppImage")).toMatchObject({
      arch: "x64",
      format: "AppImage",
      os: "linux",
    });
  });

  it("ne publie ni un flux, ni une carte de blocs, ni l'archive de mise à jour, ni un nom muet", () => {
    expect(artefactOf("latest-mac.yml")).toBeNull();
    expect(artefactOf("Pupitre-1.4.0-arm64.dmg.blockmap")).toBeNull();
    expect(artefactOf("Pupitre-1.4.0-arm64.zip")).toBeNull();
    expect(artefactOf("Pupitre-1.4.0.dmg")).toBeNull();
    expect(artefactOf("../etc/passwd.dmg")).toBeNull();
  });

  it("nomme les flux et les cartes de blocs pour ce qu'ils sont", () => {
    expect(isFeed("latest.yml")).toBe(true);
    expect(isFeed("Pupitre-1.4.0-x64.dmg")).toBe(false);
    expect(isBlockmap("Pupitre-1.4.0-x64.dmg.blockmap")).toBe(true);
  });

  it("rattache à son installateur ce que l'app télécharge à côté", () => {
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

  it("signe ce que l'updater télécharge, sous le système et la puce de son installateur", () => {
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

describe("les emplacements", () => {
  it("range une version dans son propre dossier", () => {
    expect(objectKey("1.4.0", "Pupitre-1.4.0-x64.dmg")).toBe(
      "app/1.4.0/Pupitre-1.4.0-x64.dmg"
    );
    expect(downloadUrl(`${BASE}/`, "1.4.0", "a.dmg")).toBe(
      `${BASE}/app/1.4.0/a.dmg`
    );
  });
});

describe("signedAppMessage", () => {
  it("se distingue d'une signature d'agent, ligne à ligne", () => {
    expect(signedAppMessage("1.4.0", "macos", "arm64", "abc").toString()).toBe(
      "pupitre-app\n1.4.0\nmacos\narm64\nabc\n"
    );
  });
});

describe("absoluteFeed", () => {
  it("envoie le flux d'un canal chercher les fichiers de leur version", () => {
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

  it("laisse une URL déjà absolue telle quelle", () => {
    const feed = `  - url: ${BASE}/app/1.4.0/Pupitre.dmg`;

    expect(absoluteFeed(feed, BASE, "1.4.0")).toBe(feed);
  });
});
