import { type FoldedLine, foldRows, type ScreenRow } from "@shared/folded-rows";
import type { IBufferLine, ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { ADDRESS, trimmedAddress } from "./addresses";

// Rows scanned on either side of the hovered one; an address rarely spans more.
const REACH = 32;

interface ReadRow extends ScreenRow {
  columns: number[];
}

function readRow(line: IBufferLine, cols: number): ReadRow {
  let text = "";
  const columns: number[] = [];
  let width = 0;

  for (let x = 0; x < cols; x++) {
    const cell = line.getCell(x);

    if (!cell || cell.getWidth() === 0) {
      continue;
    }

    const chars = cell.getChars() || " ";

    for (const _ of chars) {
      columns.push(x);
    }

    text += chars;

    if (chars.trim() !== "") {
      width = x + cell.getWidth();
    }
  }

  const kept = text.trimEnd();

  return { text: kept, width, columns: columns.slice(0, kept.length) };
}

function locate(
  line: FoldedLine,
  rows: readonly ReadRow[],
  offset: number
): { row: number; column: number } | null {
  let passed = 0;

  for (const piece of line.pieces) {
    if (offset < passed + piece.length) {
      const row = rows[piece.row];
      const column = row?.columns[piece.from + offset - passed];

      return column === undefined ? null : { row: piece.row, column };
    }

    passed += piece.length;
  }

  return null;
}

/** TUIs such as Codex or Claude write each row themselves, so xterm's link addon sees a cut address as two halves. */
export function addressProvider(
  xterm: Terminal,
  activate: (address: string) => void
): ILinkProvider {
  return {
    provideLinks(bufferLine, callback) {
      const buffer = xterm.buffer.active;
      const target = bufferLine - 1;
      const first = Math.max(0, target - REACH);
      const last = Math.min(buffer.length - 1, target + REACH);

      const rows: ReadRow[] = [];

      for (let y = first; y <= last; y++) {
        const line = buffer.getLine(y);

        rows.push(
          line ? readRow(line, xterm.cols) : { text: "", width: 0, columns: [] }
        );
      }

      const links: ILink[] = [];

      for (const line of foldRows(rows, xterm.cols)) {
        const touches = line.pieces.some(
          (piece) => piece.row + first === target
        );

        if (!touches) {
          continue;
        }

        for (const match of line.text.matchAll(ADDRESS)) {
          const address = trimmedAddress(match[0]);
          const start = locate(line, rows, match.index);
          const end = locate(line, rows, match.index + address.length - 1);

          if (!(start && end)) {
            continue;
          }

          links.push({
            activate: () => activate(address),
            range: {
              end: { x: end.column + 1, y: end.row + first + 1 },
              start: { x: start.column + 1, y: start.row + first + 1 },
            },
            text: address,
          });
        }
      }

      callback(links.length > 0 ? links : undefined);
    },
  };
}
