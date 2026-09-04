import { describe, expect, it } from "bun:test";
import {
  homeDirectory,
  multiplexes,
  terminalOptions,
  windowChrome,
} from "../platform";

const SIZE = { cols: 100, rows: 30 };

describe("le multiplexage ssh", () => {
  it("est refusé à Windows, dont l'OpenSSH ne le connaît pas", () => {
    expect(multiplexes("win32")).toBe(false);
  });

  it("reste en place sur macOS et sur Linux", () => {
    expect(multiplexes("darwin")).toBe(true);
    expect(multiplexes("linux")).toBe(true);
  });
});

describe("le dossier personnel", () => {
  it("se lit dans USERPROFILE sur Windows, où HOME est vide", () => {
    expect(
      homeDirectory("win32", { HOME: "", USERPROFILE: "C:\\Users\\Jean" })
    ).toBe("C:\\Users\\Jean");
  });

  it("se lit dans HOME ailleurs", () => {
    expect(homeDirectory("darwin", { HOME: "/Users/jean" })).toBe(
      "/Users/jean"
    );
  });
});

describe("le cadre de la fenêtre", () => {
  it("garde les feux de circulation en retrait sur macOS", () => {
    expect(windowChrome("darwin")).toEqual({ titleBarStyle: "hiddenInset" });
  });

  it("rend ses boutons à Windows et à Linux, qui n'en dessinent aucun sans cela", () => {
    for (const platform of ["win32", "linux"] as const) {
      expect(windowChrome(platform)).toEqual({
        titleBarOverlay: true,
        titleBarStyle: "hidden",
      });
    }
  });
});

describe("le pty d'un terminal", () => {
  it("demande ConPTY sur Windows, jamais winpty", () => {
    const options = terminalOptions(SIZE, "win32", {
      USERPROFILE: "C:\\Users\\Jean",
    });

    expect(options).toMatchObject({
      cols: 100,
      cwd: "C:\\Users\\Jean",
      rows: 30,
      useConpty: true,
    });
  });

  it("ne demande rien de tel ailleurs", () => {
    const options = terminalOptions(SIZE, "linux", { HOME: "/home/jean" });

    expect(options).not.toHaveProperty("useConpty");
    expect(options.cwd).toBe("/home/jean");
  });
});
