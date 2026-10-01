import { describe, expect, it } from "bun:test";
import {
  homeDirectory,
  multiplexes,
  terminalOptions,
  windowChrome,
} from "../platform";

const SIZE = { cols: 100, rows: 30 };

describe("ssh multiplexing", () => {
  it("is refused on Windows, whose OpenSSH does not know it", () => {
    expect(multiplexes("win32")).toBe(false);
  });

  it("stays in place on macOS and Linux", () => {
    expect(multiplexes("darwin")).toBe(true);
    expect(multiplexes("linux")).toBe(true);
  });
});

describe("the home folder", () => {
  it("is read from USERPROFILE on Windows, where HOME is empty", () => {
    expect(
      homeDirectory("win32", { HOME: "", USERPROFILE: "C:\\Users\\Jean" })
    ).toBe("C:\\Users\\Jean");
  });

  it("is read from HOME elsewhere", () => {
    expect(homeDirectory("darwin", { HOME: "/Users/jean" })).toBe(
      "/Users/jean"
    );
  });
});

describe("the window frame", () => {
  it("keeps the traffic lights inset on macOS", () => {
    expect(windowChrome("darwin")).toEqual({ titleBarStyle: "hiddenInset" });
  });

  it("gives its buttons back on Windows and Linux, which draw none otherwise", () => {
    for (const platform of ["win32", "linux"] as const) {
      expect(windowChrome(platform)).toEqual({
        titleBarOverlay: true,
        titleBarStyle: "hidden",
      });
    }
  });
});

describe("a terminal's pty", () => {
  it("requests ConPTY on Windows, never winpty", () => {
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

  it("requests nothing of the sort elsewhere", () => {
    const options = terminalOptions(SIZE, "linux", { HOME: "/home/jean" });

    expect(options).not.toHaveProperty("useConpty");
    expect(options.cwd).toBe("/home/jean");
  });
});
