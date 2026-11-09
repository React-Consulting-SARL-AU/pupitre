import { describe, expect, it } from "bun:test";
import { multiplexes, windowChrome } from "../platform";

describe("ssh multiplexing", () => {
  it("is refused on Windows, whose OpenSSH does not know it", () => {
    expect(multiplexes("win32")).toBe(false);
  });

  it("stays in place on macOS and Linux", () => {
    expect(multiplexes("darwin")).toBe(true);
    expect(multiplexes("linux")).toBe(true);
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
