import { describe, expect, it } from "bun:test";
import type { FileEntry } from "@pupitre/shared/agent-protocol/files";
import { entryActions } from "../file-actions";
import {
  absoluteOf,
  crumbsOf,
  dirnameOf,
  isEntryName,
  nameOf,
  parentOf,
  renderedFormOf,
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

describe("the breadcrumb", () => {
  it("splits a path into crumbs and makes none from the root", () => {
    expect(crumbsOf("")).toEqual([]);
    expect(crumbsOf("projects/atlas/src")).toEqual([
      "projects",
      "atlas",
      "src",
    ]);
  });

  it("names the parent and the name of a path", () => {
    expect(parentOf("projects/atlas/src")).toBe("projects/atlas");
    expect(parentOf("projects")).toBe("");
    expect(nameOf("projects/atlas/.env")).toBe(".env");
    expect(nameOf("")).toBe("");
  });
});

describe("composing a path", () => {
  it("joins two pieces, one of which may be the root", () => {
    expect(under("", "src")).toBe("src");
    expect(under("projects/atlas", "src")).toBe("projects/atlas/src");
    expect(under("projects", "")).toBe("projects");
  });

  it("reads a path under a root, and nothing outside it", () => {
    expect(within("projects/atlas", "projects/atlas/src")).toBe("src");
    expect(within("projects/atlas", "projects/atlas")).toBe("");
    expect(within("", "projects/atlas")).toBe("projects/atlas");
    expect(within("projects/atlas", "projects/atlas-two/src")).toBeNull();
    expect(within("/home/dev", "/home/dev/projects/atlas")).toBe(
      "projects/atlas"
    );
    expect(within("/home/dev", "/srv/atlas")).toBeNull();
  });

  it("rebuilds an absolute path from the root the agent names", () => {
    expect(absoluteOf("/home/dev", "projects/atlas/.env")).toBe(
      "/home/dev/projects/atlas/.env"
    );
    expect(absoluteOf("/home/dev", "")).toBe("/home/dev");
    expect(dirnameOf("/home/dev/projects")).toBe("/home/dev");
    expect(dirnameOf("/home")).toBe("/");
  });

  it("accepts as an entry name neither a path, nor the current folder, nor the parent", () => {
    expect(isEntryName("notes.md")).toBe(true);
    expect(isEntryName(".env")).toBe(true);
    expect(isEntryName("a/b")).toBe(false);
    expect(isEntryName("..")).toBe(false);
    expect(isEntryName(".")).toBe(false);
    expect(isEntryName("")).toBe(false);
  });
});

describe("sorting a folder", () => {
  it("puts folders first, then files by name ignoring case", () => {
    expect(sortedEntries(ENTRIES, "name", true).map((e) => e.name)).toEqual([
      ".git",
      "src",
      ".env",
      "alpha.ts",
      "Beta.md",
      "zeta.ts",
    ]);
  });

  it("hides entries starting with a dot until they are asked for", () => {
    expect(sortedEntries(ENTRIES, "name", false).map((e) => e.name)).toEqual([
      "src",
      "alpha.ts",
      "Beta.md",
      "zeta.ts",
    ]);
  });

  it("sorts by date, most recent first, folders staying in front", () => {
    expect(sortedEntries(ENTRIES, "date", false).map((e) => e.name)).toEqual([
      "src",
      "Beta.md",
      "zeta.ts",
      "alpha.ts",
    ]);
  });

  it("does not modify the list the agent gave", () => {
    const given = [...ENTRIES];

    sortedEntries(given, "date", true);

    expect(given.map((e) => e.name)).toEqual(ENTRIES.map((e) => e.name));
  });
});

describe("an entry's menu", () => {
  const zed = {
    backend: false,
    id: "zed" as const,
    logo: "editor.zed",
    module: "editor.zed",
    name: "Zed",
  };

  it("offers a terminal to folders only, one editor entry per installed editor, and a download to all", () => {
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

  it("offers neither opening nor copying of a pipe, a socket or a device, which a read would wait on forever", () => {
    expect(
      entryActions(entry("fifo", "special"), [zed]).map((a) => a.id)
    ).toEqual(["rename", "remove"]);
  });

  it("tells whether a download targets a folder, which changes the dialog", () => {
    expect(
      entryActions(entry("src", "dir"), []).find((a) => a.id === "download")
        ?.folder
    ).toBe(true);
    expect(
      entryActions(entry("a.ts"), []).find((a) => a.id === "download")?.folder
    ).toBe(false);
  });
});

describe("a file's rendered form", () => {
  it("is read from the extension, ignoring case", () => {
    expect(renderedFormOf("projects/atlas/README.md")).toBe("markdown");
    expect(renderedFormOf("notes.markdown")).toBe("markdown");
    expect(renderedFormOf("Logo.SVG")).toBe("svg");
  });

  it("does not exist for what is read as is", () => {
    expect(renderedFormOf("index.ts")).toBeNull();
    expect(renderedFormOf(".env")).toBeNull();
    expect(renderedFormOf("md")).toBeNull();
  });
});
