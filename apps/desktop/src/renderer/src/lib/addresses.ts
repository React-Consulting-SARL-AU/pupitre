export const ADDRESS = /(?:https?|ssh|file):\/\/[^\s"'<>`]{4,2048}/g;

const TRAILING = /[.,;:!?'"]+$/;

function count(text: string, glyph: string): number {
  return text.split(glyph).length - 1;
}

/** A closing bracket only belongs to the address when it closes one opened inside it. */
export function trimmedAddress(raw: string): string {
  let address = raw.replace(TRAILING, "");

  while (address.endsWith(")") && count(address, "(") < count(address, ")")) {
    address = address.slice(0, -1).replace(TRAILING, "");
  }

  return address;
}

/** A piece of a line: text as it is, or an address to follow. */
export type Piece =
  | { kind: "text"; text: string }
  | { kind: "address"; text: string };

/** The line cut around the addresses it carries, in order; a line without one is a single piece. */
export function piecesOf(line: string): readonly Piece[] {
  const pieces: Piece[] = [];
  let from = 0;

  for (const match of line.matchAll(ADDRESS)) {
    const address = trimmedAddress(match[0]);

    if (match.index > from) {
      pieces.push({ kind: "text", text: line.slice(from, match.index) });
    }

    pieces.push({ kind: "address", text: address });
    from = match.index + address.length;
  }

  if (from < line.length || pieces.length === 0) {
    pieces.push({ kind: "text", text: line.slice(from) });
  }

  return pieces;
}
