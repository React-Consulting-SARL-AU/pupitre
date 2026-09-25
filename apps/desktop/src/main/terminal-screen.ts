import { Terminal } from "@xterm/headless";

/** tmux paints row by row and splits long addresses into fragments: only a screen reassembles them. */
export interface Screen {
  write(data: string, then: () => void): void;
  resize(cols: number, rows: number): void;
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
