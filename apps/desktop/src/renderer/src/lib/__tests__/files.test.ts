import { describe, expect, it } from "bun:test";
import type { FileEntry } from "@pupitre/shared/agent-protocol/files";
import { entryActions } from "../file-actions";
import {
  absoluteOf,
  crumbsOf,
  dirnameOf,
  heldCount,
  isEntryName,
  nameOf,
  parentOf,
  sortedEntries,
  under,
  within,
} from "../files";

function entry(
  name: string,
  kind: FileEntry["kind"] = "file",
  modified = "2026-09-01T10:00:00Z"
): FileEntry {
  return { kind, mode: "0644", modified_at: modified, name, size_bytes: 10 };
}

const ENTRIES: FileEntry[] = [
  entry("zeta.ts", "file", "2026-09-03T10:00:00Z"),
  entry(".env", "file", "2026-09-04T10:00:00Z"),
  entry("src", "dir", "2026-09-01T10:00:00Z"),
  entry("alpha.ts", "file", "2026-09-02T10:00:00Z"),
  entry(".git", "dir", "2026-09-05T10:00:00Z"),
  entry("Beta.md", "file", "2026-09-06T10:00:00Z"),
];

describe("le fil d'Ariane", () => {
  it("découpe un chemin en miettes et n'en fait aucune de la racine", () => {
    expect(crumbsOf("")).toEqual([]);
    expect(crumbsOf("projects/atlas/src")).toEqual([
      "projects",
      "atlas",
      "src",
    ]);
  });

  it("nomme le parent et le nom d'un chemin", () => {
    expect(parentOf("projects/atlas/src")).toBe("projects/atlas");
    expect(parentOf("projects")).toBe("");
    expect(nameOf("projects/atlas/.env")).toBe(".env");
    expect(nameOf("")).toBe("");
  });
});

describe("la composition d'un chemin", () => {
  it("joint deux morceaux dont l'un peut être la racine", () => {
    expect(under("", "src")).toBe("src");
    expect(under("projects/atlas", "src")).toBe("projects/atlas/src");
    expect(under("projects", "")).toBe("projects");
  });

  it("lit un chemin sous une racine, et rien hors d'elle", () => {
    expect(within("projects/atlas", "projects/atlas/src")).toBe("src");
    expect(within("projects/atlas", "projects/atlas")).toBe("");
    expect(within("", "projects/atlas")).toBe("projects/atlas");
    expect(within("projects/atlas", "projects/atlas-two/src")).toBeNull();
    expect(within("/home/dev", "/home/dev/projects/atlas")).toBe(
      "projects/atlas"
    );
    expect(within("/home/dev", "/srv/atlas")).toBeNull();
  });

  it("recompose un chemin absolu depuis la racine que l'agent nomme", () => {
    expect(absoluteOf("/home/dev", "projects/atlas/.env")).toBe(
      "/home/dev/projects/atlas/.env"
    );
    expect(absoluteOf("/home/dev", "")).toBe("/home/dev");
    expect(dirnameOf("/home/dev/projects")).toBe("/home/dev");
    expect(dirnameOf("/home")).toBe("/");
  });

  it("n'accepte comme nom d'entrée ni un chemin, ni le dossier courant, ni le parent", () => {
    expect(isEntryName("notes.md")).toBe(true);
    expect(isEntryName(".env")).toBe(true);
    expect(isEntryName("a/b")).toBe(false);
    expect(isEntryName("..")).toBe(false);
    expect(isEntryName(".")).toBe(false);
    expect(isEntryName("")).toBe(false);
  });
});

describe("le tri d'un dossier", () => {
  it("met les dossiers d'abord, puis les fichiers par nom sans tenir compte de la casse", () => {
    expect(sortedEntries(ENTRIES, "name", true).map((e) => e.name)).toEqual([
      ".git",
      "src",
      ".env",
      "alpha.ts",
      "Beta.md",
      "zeta.ts",
    ]);
  });

  it("cache les entrées qui commencent par un point tant qu'on ne les demande pas", () => {
    expect(sortedEntries(ENTRIES, "name", false).map((e) => e.name)).toEqual([
      "src",
      "alpha.ts",
      "Beta.md",
      "zeta.ts",
    ]);
  });

  it("trie par date la plus récente en premier, les dossiers restant devant", () => {
    expect(sortedEntries(ENTRIES, "date", false).map((e) => e.name)).toEqual([
      "src",
      "Beta.md",
      "zeta.ts",
      "alpha.ts",
    ]);
  });

  it("ne modifie pas la liste que l'agent a donnée", () => {
    const given = [...ENTRIES];

    sortedEntries(given, "date", true);

    expect(given.map((e) => e.name)).toEqual(ENTRIES.map((e) => e.name));
  });
});

describe("le refus d'un dossier non vide", () => {
  it("lit le nombre d'entrées que le message nomme en dernier", () => {
    expect(heldCount("the folder is not empty: v2/src holds 14 entries")).toBe(
      14
    );
    expect(heldCount("dossier non vide : app contient 3 entrées")).toBe(3);
    expect(heldCount("nothing to count here")).toBeNull();
  });
});

describe("le menu d'une entrée", () => {
  const zed = { id: "zed" as const, module: "editor.zed", name: "Zed" };

  it("offre un terminal à un dossier seulement, un éditeur par éditeur installé, et un téléchargement à tous", () => {
    expect(entryActions(entry("src", "dir"), [zed]).map((a) => a.id)).toEqual([
      "open",
      "editor",
      "terminal",
      "download",
      "rename",
      "copy",
      "remove",
    ]);
    expect(entryActions(entry("a.ts"), []).map((a) => a.id)).toEqual([
      "open",
      "download",
      "rename",
      "copy",
      "remove",
    ]);
  });

  it("dit d'un téléchargement s'il porte sur un dossier, ce qui change la boîte", () => {
    expect(
      entryActions(entry("src", "dir"), []).find((a) => a.id === "download")
        ?.folder
    ).toBe(true);
    expect(
      entryActions(entry("a.ts"), []).find((a) => a.id === "download")?.folder
    ).toBe(false);
  });
});
