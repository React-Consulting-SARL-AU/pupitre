import { describe, expect, it } from "bun:test";
import type { ILink, Terminal } from "@xterm/xterm";
import { addressProvider } from "../terminal-links";

const COLS = 40;

function screen(rows: string[]): Terminal {
  const lines = rows.map((text) => ({
    isWrapped: false,
    getCell: (x: number) => ({
      getChars: () => text[x] ?? "",
      getWidth: () => 1,
    }),
    translateToString: () => text,
  }));

  return {
    cols: COLS,
    buffer: {
      active: { length: lines.length, getLine: (y: number) => lines[y] },
    },
  } as unknown as Terminal;
}

function linksOn(xterm: Terminal, row: number): ILink[] {
  let found: ILink[] | undefined;

  addressProvider(xterm, () => undefined).provideLinks(row + 1, (links) => {
    found = links;
  });

  return found ?? [];
}

const ADDRESS =
  "https://auth.openai.com/oauth/authorize?client_id=app_EMoam&redirect_uri=http%3A%2F%2Flocalhost&state=JX_gTItN";

describe("a screen's addresses", () => {
  it("are read as one block when the agent cut them at the edge", () => {
    const rows = [
      "Open the following link:",
      ADDRESS.slice(0, COLS),
      ADDRESS.slice(COLS, 2 * COLS),
      ADDRESS.slice(2 * COLS),
      "",
      "Press esc to cancel",
    ];
    const xterm = screen(rows);

    for (const row of [1, 2, 3]) {
      const [link] = linksOn(xterm, row);

      expect(link?.text).toBe(ADDRESS);
      expect(link?.range).toEqual({
        start: { x: 1, y: 2 },
        end: { x: ADDRESS.length - 2 * COLS, y: 4 },
      });
    }
  });

  it("are read as one block when the terminal wrapped an indented line", () => {
    const rows = [
      `  ${ADDRESS.slice(0, COLS - 2)}`,
      ADDRESS.slice(COLS - 2, 2 * COLS - 2),
      ADDRESS.slice(2 * COLS - 2),
      "",
    ];
    const xterm = screen(rows);

    for (const row of [0, 1, 2]) {
      const [link] = linksOn(xterm, row);

      expect(link?.text).toBe(ADDRESS);
      expect(link?.range).toEqual({
        start: { x: 3, y: 1 },
        end: { x: ADDRESS.length - 2 * COLS + 2, y: 3 },
      });
    }
  });

  it("leave the address in place when nothing follows it", () => {
    const [link] = linksOn(
      screen(["see https://pupitre.studio/docs.", "next"]),
      0
    );

    expect(link?.text).toBe("https://pupitre.studio/docs");
    expect(link?.range).toEqual({
      start: { x: 5, y: 1 },
      end: { x: 31, y: 1 },
    });
  });

  it("do not glue a short line to the next one", () => {
    const [link] = linksOn(screen(["https://pupitre.studio", "invoke&x=1"]), 0);

    expect(link?.text).toBe("https://pupitre.studio");
  });

  it("keep the parenthesis that closes the address's own", () => {
    const [link] = linksOn(
      screen(["(https://en.wikipedia.org/wiki/Foo_(bar))"]),
      0
    );

    expect(link?.text).toBe("https://en.wikipedia.org/wiki/Foo_(bar)");
  });

  it("return nothing on a line without an address", () => {
    expect(linksOn(screen(["nothing here", "https://a.b/c"]), 0)).toEqual([]);
  });
});
