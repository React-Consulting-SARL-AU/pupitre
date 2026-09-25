export interface ScreenRow {
  text: string;
  /** Columns occupied, margin included. */
  width: number;
}

export interface FoldedPiece {
  row: number;
  from: number;
  length: number;
}

export interface FoldedLine {
  text: string;
  pieces: FoldedPiece[];
}

function margin(text: string): number {
  return text.length - text.trimStart().length;
}

/** A wrap continues at column zero (terminal) or at the box margin (a TUI that lays out its own text). */
export function foldRows(
  rows: readonly ScreenRow[],
  cols: number
): FoldedLine[] {
  const lines: FoldedLine[] = [];
  let open: FoldedLine | null = null;
  let edge = 0;
  let atEdge = false;

  rows.forEach((row, index) => {
    const left = margin(row.text);
    const continues =
      row.text.length > left && (left === edge || (atEdge && left === 0));

    if (open !== null && continues) {
      open.text += row.text.slice(left);
      open.pieces.push({
        row: index,
        from: left,
        length: row.text.length - left,
      });
    } else {
      if (open !== null) {
        lines.push(open);
      }

      open = {
        text: row.text,
        pieces: [{ row: index, from: 0, length: row.text.length }],
      };
      edge = left;
    }

    atEdge = row.width === cols;

    if (!atEdge && row.width + edge !== cols) {
      lines.push(open);
      open = null;
    }
  });

  if (open !== null) {
    lines.push(open);
  }

  return lines;
}
