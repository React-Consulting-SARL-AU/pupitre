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

describe("la ligne Include", () => {
  it("cite un chemin qui porte un espace, laisse nu un chemin sans", () => {
    expect(includeLine(APP)).toBe(`Include "${APP}"`);
    expect(includeLine(PLAIN)).toBe(`Include ${PLAIN}`);
  });

  it("se reconnaît citée ou nue, quelle que soit la casse du mot", () => {
    expect(isShared(`include "${APP}"\n${OWN}`, APP)).toBe(true);
    expect(isShared(`Include ${PLAIN}\n${OWN}`, PLAIN)).toBe(true);
    expect(isShared(`Include ~/.ssh/other\n${OWN}`, PLAIN)).toBe(false);
  });
});

describe("le fichier du système avec la ligne", () => {
  it("la reçoit en tête, au-dessus de tout ce que le lecteur y avait écrit", () => {
    expect(withInclude(OWN, PLAIN)).toBe(`Include ${PLAIN}\n\n${OWN}`);
  });

  it("naît de la ligne seule quand il n'existait pas", () => {
    expect(withInclude("", PLAIN)).toBe(`Include ${PLAIN}\n`);
  });

  it("ne la reçoit pas deux fois", () => {
    const once = withInclude(OWN, PLAIN);

    expect(withInclude(once, PLAIN)).toBe(once);
  });
});

describe("le fichier du système sans la ligne", () => {
  it("redevient ce qu'il était", () => {
    expect(withoutInclude(withInclude(OWN, PLAIN), PLAIN)).toBe(OWN);
  });

  it("la perd où que le lecteur l'ait déplacée, et ne touche à rien d'autre", () => {
    const moved = `${OWN}\nInclude ${PLAIN}\nHost other\n`;

    expect(withoutInclude(moved, PLAIN)).toBe(`${OWN}\nHost other\n`);
  });
});

describe("sur le disque", () => {
  it("crée le fichier fermé quand il manque, le reprend tel quel sinon", () => {
    const home = mkdtempSync(join(tmpdir(), "pupitre-home-"));
    const file = join(home, ".ssh", "config");

    expect(shareAt(file, PLAIN, true)).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(`Include ${PLAIN}\n`);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(home, ".ssh")).mode & 0o777).toBe(0o700);

    expect(shareAt(file, PLAIN, false)).toBe(false);
    expect(readFileSync(file, "utf8")).toBe("");
  });

  it("laisse un fichier existant dans ses modes, et son contenu autour de la ligne", () => {
    const home = mkdtempSync(join(tmpdir(), "pupitre-home-"));
    const file = join(home, "config");
    writeFileSync(file, OWN, { mode: 0o644 });

    shareAt(file, PLAIN, true);

    expect(readFileSync(file, "utf8")).toBe(`Include ${PLAIN}\n\n${OWN}`);
    expect(statSync(file).mode & 0o777).toBe(0o644);

    shareAt(file, PLAIN, false);

    expect(readFileSync(file, "utf8")).toBe(OWN);
  });

  it("n'écrit rien quand on retire une ligne d'un fichier qui n'existe pas", () => {
    const home = mkdtempSync(join(tmpdir(), "pupitre-home-"));
    const file = join(home, "config");

    expect(shareAt(file, PLAIN, false)).toBe(false);
    expect(existsSync(file)).toBe(false);
  });
});
