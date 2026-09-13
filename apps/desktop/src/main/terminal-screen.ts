import { Terminal } from "@xterm/headless";

/**
 * What a session shows, read here rather than in the window.
 *
 * The stream is not enough: tmux paints the screen row by row, drops the
 * hyperlinks it does not know how to keep, and an address longer than a row
 * arrives as positioned fragments. Only a screen puts them back in order, and
 * the address stays in this process, so the screen lives here too.
 */
export interface Screen {
  write(data: string, then: () => void): void;
  resize(cols: number, rows: number): void;
  /** The rows on display, top to bottom, without their trailing blanks. */
  lines(): string[];
  cols(): number;
  dispose(): void;
}

export function openScreen(cols: number, rows: number): Screen {
  const terminal = new Terminal({
    allowProposedApi: true,
    cols,
    rows,
    scrollback: 0,
  });

  return {
    cols: () => terminal.cols,
    dispose: () => terminal.dispose(),
    lines: () => {
      const buffer = terminal.buffer.active;
      const rows: string[] = [];

      for (let y = 0; y < buffer.length; y++) {
        rows.push(buffer.getLine(y)?.translateToString(true) ?? "");
      }

      return rows;
    },
    resize: (nextCols, nextRows) => terminal.resize(nextCols, nextRows),
    write: (data, then) => terminal.write(data, then),
  };
}
