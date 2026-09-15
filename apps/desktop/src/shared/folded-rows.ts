/** One row of a screen: its text and the columns it occupies, margin included. */
export interface ScreenRow {
  text: string;
  width: number;
}

/** Where a piece of a folded line sits on the screen: the row, the column it starts at, and its length. */
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

/**
 * The rows of a screen, with a folded line read as one.
 *
 * An address longer than the screen is wide reaches the last column and goes
 * on at the left edge of the next row: the terminal wraps it there, and so
 * does an interface that lays its text out itself, at the margin of its box
 * rather than at the edge. Nothing on the screen says which rows belong
 * together, only that shape does — so every piece remembers where it came
 * from, and a match in the joined text can be pointed back at the screen.
 */
export function foldRows(
  rows: readonly ScreenRow[],
  cols: number
): FoldedLine[] {
  const lines: FoldedLine[] = [];
  let open: FoldedLine | null = null;
  let edge = 0;

  rows.forEach((row, index) => {
    const left = margin(row.text);

    if (open !== null && left === edge && row.text.length > left) {
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

    if (row.width + edge !== cols) {
      lines.push(open);
      open = null;
    }
  });

  if (open !== null) {
    lines.push(open);
  }

  return lines;
}
