import { describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  includeLine,
  isShared,
  shareAt,
  withInclude,
  withoutInclude,
} from "../ssh-share";

const APP = "/Users/jean/Library/Application Support/Pupitre/ssh/config";
const PLAIN = "/home/jean/.config/pupitre/ssh/config";
const OWN = "Host work\n  HostName 10.0.0.2\n  User jean\n";

describe("the Include line", () => {
  it("quotes a path containing a space, leaves a path without one bare", () => {
    expect(includeLine(APP)).toBe(`Include "${APP}"`);
    expect(includeLine(PLAIN)).toBe(`Include ${PLAIN}`);
  });

  it("is recognised quoted or bare, whatever the case of the keyword", () => {
    expect(isShared(`include "${APP}"\n${OWN}`, APP)).toBe(true);
    expect(isShared(`Include ${PLAIN}\n${OWN}`, PLAIN)).toBe(true);
    expect(isShared(`Include ~/.ssh/other\n${OWN}`, PLAIN)).toBe(false);
  });
});

describe("the system file with the line", () => {
  it("receives it at the top, above everything the reader had written there", () => {
    expect(withInclude(OWN, PLAIN)).toBe(`Include ${PLAIN}\n\n${OWN}`);
  });

  it("is born from the line alone when it did not exist", () => {
    expect(withInclude("", PLAIN)).toBe(`Include ${PLAIN}\n`);
  });

  it("does not receive it twice", () => {
    const once = withInclude(OWN, PLAIN);

    expect(withInclude(once, PLAIN)).toBe(once);
  });
});

describe("the system file without the line", () => {
  it("goes back to what it was", () => {
    expect(withoutInclude(withInclude(OWN, PLAIN), PLAIN)).toBe(OWN);
  });

  it("loses it wherever the reader moved it, and touches nothing else", () => {
    const moved = `${OWN}\nInclude ${PLAIN}\nHost other\n`;

    expect(withoutInclude(moved, PLAIN)).toBe(`${OWN}\nHost other\n`);
  });
});

describe("on disk", () => {
  it("creates the file closed when it is missing, takes it as is otherwise", () => {
    const home = mkdtempSync(join(tmpdir(), "pupitre-home-"));
    const file = join(home, ".ssh", "config");

    expect(shareAt(file, PLAIN, true)).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(`Include ${PLAIN}\n`);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(home, ".ssh")).mode & 0o777).toBe(0o700);

    expect(shareAt(file, PLAIN, false)).toBe(false);
    expect(readFileSync(file, "utf8")).toBe("");
  });

  it("leaves an existing file in its modes, and its content around the line", () => {
    const home = mkdtempSync(join(tmpdir(), "pupitre-home-"));
    const file = join(home, "config");
    writeFileSync(file, OWN, { mode: 0o644 });

    shareAt(file, PLAIN, true);

    expect(readFileSync(file, "utf8")).toBe(`Include ${PLAIN}\n\n${OWN}`);
    expect(statSync(file).mode & 0o777).toBe(0o644);

    shareAt(file, PLAIN, false);

    expect(readFileSync(file, "utf8")).toBe(OWN);
  });

  it("writes nothing when a line is removed from a file that does not exist", () => {
    const home = mkdtempSync(join(tmpdir(), "pupitre-home-"));
    const file = join(home, "config");

    expect(shareAt(file, PLAIN, false)).toBe(false);
    expect(existsSync(file)).toBe(false);
  });
});
